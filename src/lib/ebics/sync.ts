/**
 * camt.053-Umsätze in Sollstellung importieren und abgleichen.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BankBuchungEingabe } from "@/lib/bankAuszugParse";
import {
  extractCamt053Xmls,
  parseCamt053Xml,
} from "@/lib/camt053Parse";
import {
  ebicsC53Abrufen,
  loadEbicsKunden,
  type EbicsKundeRow,
} from "@/lib/ebics/client";

export type EbicsSyncKundeErgebnis = {
  gesellschaftId: string;
  status: "ok" | "skip" | "fehler";
  anzahlNeu: number;
  meldung?: string;
};

function monatsgrenzen(zeitraum: string): { von: string; bis: string } {
  const start = new Date(`${zeitraum}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Ungültiger Zeitraum: ${zeitraum}`);
  }
  const ende = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  );
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { von: fmt(start), bis: fmt(ende) };
}

async function bestehendeFingerprints(
  admin: SupabaseClient,
  laufId: string,
): Promise<Set<string>> {
  const { data: auszuege, error: aErr } = await admin
    .from("bankauszuege")
    .select("id")
    .eq("lauf_id", laufId);
  if (aErr) throw new Error(aErr.message);
  const ids = (auszuege ?? []).map((a) => a.id as string);
  if (ids.length === 0) return new Set();

  const { data: buchungen, error: bErr } = await admin
    .from("bankbuchungen")
    .select("fingerprint")
    .in("bankauszug_id", ids);
  if (bErr) throw new Error(bErr.message);
  return new Set((buchungen ?? []).map((b) => b.fingerprint as string));
}

async function gesellschaftIdFuerKontoIban(
  admin: SupabaseClient,
  kontoIban: string | null,
  fallbackGesellschaftId: string,
): Promise<string> {
  if (!kontoIban) return fallbackGesellschaftId;
  const { data } = await admin
    .from("ebics_konten")
    .select("ebics_kunde_id, ebics_kunden!inner(gesellschaft_id)")
    .eq("iban", kontoIban)
    .maybeSingle();
  const nested = data?.ebics_kunden as
    | { gesellschaft_id?: string }
    | { gesellschaft_id?: string }[]
    | null
    | undefined;
  if (Array.isArray(nested) && nested[0]?.gesellschaft_id) {
    return nested[0].gesellschaft_id;
  }
  if (nested && !Array.isArray(nested) && nested.gesellschaft_id) {
    return nested.gesellschaft_id;
  }
  return fallbackGesellschaftId;
}

async function importiereBuchungen(
  admin: SupabaseClient,
  input: {
    laufId: string;
    gesellschaftId: string;
    dateiname: string;
    zeitraumVon: string | null;
    zeitraumBis: string | null;
    buchungen: BankBuchungEingabe[];
  },
): Promise<number> {
  if (input.buchungen.length === 0) return 0;

  const { data: auszug, error: auszugErr } = await admin
    .from("bankauszuege")
    .insert({
      lauf_id: input.laufId,
      gesellschaft_id: input.gesellschaftId,
      dateiname: input.dateiname,
      zeitraum_von: input.zeitraumVon,
      zeitraum_bis: input.zeitraumBis,
      anzahl_buchungen: input.buchungen.length,
    })
    .select("id")
    .single();
  if (auszugErr) throw new Error(auszugErr.message);

  const rows = input.buchungen.map((b) => ({
    bankauszug_id: auszug.id,
    buchungsdatum: b.buchungsdatum,
    betrag: b.betrag,
    gegenkonto_iban: b.gegenkontoIban,
    auftraggeber_name: b.auftraggeberName,
    verwendungszweck: b.verwendungszweck,
    fingerprint: b.fingerprint,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("bankbuchungen")
      .insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
  }

  return rows.length;
}

async function syncEinKunde(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
  laufId: string,
  zeitraum: string,
): Promise<EbicsSyncKundeErgebnis> {
  if (kunde.status !== "bereit") {
    return {
      gesellschaftId: kunde.gesellschaft_id,
      status: "skip",
      anzahlNeu: 0,
      meldung: `Status: ${kunde.status}`,
    };
  }

  const { von, bis } = monatsgrenzen(zeitraum);
  try {
    const orderData = await ebicsC53Abrufen(admin, kunde, von, bis);

    let anzahlNeu = 0;
    if (orderData.length > 0) {
      const known = await bestehendeFingerprints(admin, laufId);
      const xmls = await extractCamt053Xmls(orderData);

      for (const xml of xmls) {
        const parsed = parseCamt053Xml(xml);
        const neu = parsed.buchungen.filter((b) => !known.has(b.fingerprint));
        if (neu.length === 0) continue;

        const gesellschaftId = await gesellschaftIdFuerKontoIban(
          admin,
          parsed.kontoIban,
          kunde.gesellschaft_id,
        );
        const dateiname = `EBICS C53 ${parsed.kontoIban ?? kunde.partner_id} ${von}`;
        const n = await importiereBuchungen(admin, {
          laufId,
          gesellschaftId,
          dateiname,
          zeitraumVon: parsed.zeitraumVon ?? von,
          zeitraumBis: parsed.zeitraumBis ?? bis,
          buchungen: neu,
        });
        anzahlNeu += n;
        for (const b of neu) known.add(b.fingerprint);
      }
    }

    await admin.from("ebics_abrufe").insert({
      ebics_kunde_id: kunde.id,
      lauf_id: laufId,
      auftragsart: "C53",
      zeitraum_von: von,
      zeitraum_bis: bis,
      anzahl_buchungen: anzahlNeu,
      erfolgreich: true,
      fehler: null,
    });

    return {
      gesellschaftId: kunde.gesellschaft_id,
      status: "ok",
      anzahlNeu,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("ebics_abrufe").insert({
      ebics_kunde_id: kunde.id,
      lauf_id: laufId,
      auftragsart: "C53",
      zeitraum_von: von,
      zeitraum_bis: bis,
      anzahl_buchungen: 0,
      erfolgreich: false,
      fehler: msg,
    });
    return {
      gesellschaftId: kunde.gesellschaft_id,
      status: "fehler",
      anzahlNeu: 0,
      meldung: msg,
    };
  }
}

export async function syncEbicsFuerLauf(
  admin: SupabaseClient,
  laufId: string,
): Promise<{
  ergebnisse: EbicsSyncKundeErgebnis[];
  anzahlNeuGesamt: number;
}> {
  const { data: lauf, error: laufErr } = await admin
    .from("sollstellung_laeufe")
    .select("id, zeitraum, gesellschaft_id, status")
    .eq("id", laufId)
    .maybeSingle();
  if (laufErr) throw new Error(laufErr.message);
  if (!lauf) throw new Error("Sollstellung nicht gefunden");
  if (lauf.status !== "offen") {
    throw new Error("Umsätze nur für offene Sollstellungen abrufbar.");
  }

  const kunden = await loadEbicsKunden(
    admin,
    (lauf.gesellschaft_id as string | null) ?? null,
  );
  const ergebnisse: EbicsSyncKundeErgebnis[] = [];
  for (const kunde of kunden) {
    ergebnisse.push(
      await syncEinKunde(admin, kunde, laufId, lauf.zeitraum as string),
    );
  }

  const { error: matchErr } = await admin.rpc("gleiche_sollstellung_ab", {
    p_lauf_id: laufId,
  });
  if (matchErr) throw new Error(matchErr.message);

  return {
    ergebnisse,
    anzahlNeuGesamt: ergebnisse.reduce((s, e) => s + e.anzahlNeu, 0),
  };
}

export async function syncEbicsOffeneLaeufe(
  admin: SupabaseClient,
): Promise<{
  laeufe: Array<{ laufId: string; anzahlNeu: number; fehler?: string }>;
}> {
  const now = new Date();
  const aktueller = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const vormonat = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: laeufe, error } = await admin
    .from("sollstellung_laeufe")
    .select("id, zeitraum")
    .eq("status", "offen")
    .in("zeitraum", [aktueller, vormonat]);
  if (error) throw new Error(error.message);

  const result: Array<{ laufId: string; anzahlNeu: number; fehler?: string }> =
    [];
  for (const lauf of laeufe ?? []) {
    try {
      const r = await syncEbicsFuerLauf(admin, lauf.id as string);
      result.push({ laufId: lauf.id as string, anzahlNeu: r.anzahlNeuGesamt });
    } catch (err) {
      result.push({
        laufId: lauf.id as string,
        anzahlNeu: 0,
        fehler: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { laeufe: result };
}
