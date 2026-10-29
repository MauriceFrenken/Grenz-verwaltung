/**
 * camt.053-Umsätze per EBICS abrufen und in bankauszuege/bankbuchungen speichern.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BankBuchungEingabe } from "@/lib/bankAuszugParse";
import { extractCamt053Xmls, parseCamt053Xml } from "@/lib/camt053Parse";
import { loadEbicsKunden, type EbicsKundeRow } from "@/lib/ebics/kunden";

export type EbicsSyncKundeErgebnis = {
  gesellschaftId: string;
  status: "ok" | "skip" | "fehler";
  anzahlNeu: number;
  meldung?: string;
  /** Bank-Antwort ohne Auszugsdateien (nicht: schon importiert). */
  leer?: boolean;
};

const NETZFEHLER =
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up|fetch failed/i;

/** Kurze Netzabbrüche zur Bank (z. B. ECONNRESET beim ersten Abruf) bis zu zweimal wiederholen. */
export async function mitWiederholung<T>(
  fn: () => Promise<T>,
  wartezeitenMs: number[] = [2000, 5000],
): Promise<T> {
  for (let versuch = 0; ; versuch++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (versuch >= wartezeitenMs.length || !NETZFEHLER.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, wartezeitenMs[versuch]));
    }
  }
}

async function gesellschaftIdFuerKontoIban(
  admin: SupabaseClient,
  kontoIban: string | null,
  fallbackGesellschaftId: string,
): Promise<string> {
  if (!kontoIban) return fallbackGesellschaftId;
  // bankkonten: ein EBICS-Kunde kann Konten mehrerer Gesellschaften abdecken
  const { data: bankkonto } = await admin
    .from("bankkonten")
    .select("gesellschaft_id")
    .eq("iban", kontoIban)
    .maybeSingle();
  if (bankkonto?.gesellschaft_id) {
    return String(bankkonto.gesellschaft_id);
  }
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
    gesellschaftId: string;
    kontoIban: string;
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
      gesellschaft_id: input.gesellschaftId,
      konto_iban: input.kontoIban,
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
    konto_iban: input.kontoIban,
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

/**
 * Tagesendsalden (CLBD) aus dem camt.053 sichern, damit die EBICS-Seite den
 * Kontostand zeigt. Darf den Abruf nie stören: Fehler werden nur protokolliert.
 */
async function kontosaldenSpeichern(
  admin: SupabaseClient,
  parsed: ReturnType<typeof parseCamt053Xml>,
  fallbackGesellschaftId: string,
): Promise<void> {
  if (!parsed.kontoIban || parsed.salden.length === 0) return;
  try {
    const gesellschaftId = await gesellschaftIdFuerKontoIban(
      admin,
      parsed.kontoIban,
      fallbackGesellschaftId,
    );
    const konto = await admin.from("bankkonten").upsert(
      {
        iban: parsed.kontoIban,
        gesellschaft_id: gesellschaftId,
        zugang: "ebics",
      },
      { onConflict: "iban", ignoreDuplicates: true },
    );
    if (konto.error) throw new Error(konto.error.message);
    const salden = await admin.from("kontosalden").upsert(
      parsed.salden.map((s) => ({
        iban: s.iban,
        stichtag: s.stichtag,
        saldo: s.saldo,
        quelle: "camt053",
      })),
      { onConflict: "iban,stichtag,quelle" },
    );
    if (salden.error) throw new Error(salden.error.message);
  } catch (err) {
    console.warn(
      "[ebics] Kontosalden nicht gespeichert:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Zeitraum des täglichen Kontoabrufs: vom 1. des Vormonats bis heute, damit
 * späte Buchungen des Vormonats und der laufende Monat immer drin sind.
 */
export function abrufZeitraum(heute: Date): { von: string; bis: string } {
  const von = new Date(
    Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - 1, 1),
  );
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { von: fmt(von), bis: fmt(heute) };
}

/** Fingerprints, die für dieses Konto schon gespeichert sind. */
async function bekannteFingerprintsKonto(
  admin: SupabaseClient,
  kontoIban: string,
  fingerprints: string[],
): Promise<Set<string>> {
  const bekannt = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < fingerprints.length; i += CHUNK) {
    const { data, error } = await admin
      .from("bankbuchungen")
      .select("fingerprint")
      .eq("konto_iban", kontoIban)
      .in("fingerprint", fingerprints.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) bekannt.add(r.fingerprint as string);
  }
  return bekannt;
}

/**
 * Abruf aller Konten (täglicher Cron oder Knopf auf der EBICS-Seite): jeder
 * bereite EBICS-Zugang von Grenz & Co.; neue Buchungen landen in bankauszuege.
 */
export async function syncEbicsAlleKonten(
  admin: SupabaseClient,
  heute: Date = new Date(),
): Promise<{ ergebnisse: EbicsSyncKundeErgebnis[]; anzahlNeuGesamt: number }> {
  const { von, bis } = abrufZeitraum(heute);
  const kunden = await loadEbicsKunden(admin);
  const ergebnisse: EbicsSyncKundeErgebnis[] = [];

  for (const kunde of kunden) {
    // Nach INI/HIA prüft jeder Lauf selbst, ob die Bank freigeschaltet hat (HPB);
    // ab dann wird ohne Klick in der App abgerufen.
    if (kunde.status === "wartet_auf_bank" || kunde.status === "fehler") {
      try {
        const { ebicsBankSchluesselHolen } = await import("@/lib/ebics/client");
        await mitWiederholung(() => ebicsBankSchluesselHolen(admin, kunde));
        kunde.status = "bereit";
      } catch (err) {
        ergebnisse.push({
          gesellschaftId: kunde.gesellschaft_id,
          status: "skip",
          anzahlNeu: 0,
          meldung: `Bank noch nicht freigeschaltet: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
        continue;
      }
    }
    if (kunde.status !== "bereit") {
      ergebnisse.push({
        gesellschaftId: kunde.gesellschaft_id,
        status: "skip",
        anzahlNeu: 0,
        meldung: `Status: ${kunde.status}`,
      });
      continue;
    }
    try {
      const { ebicsC53Abrufen } = await import("@/lib/ebics/client");
      const orderData = await mitWiederholung(() =>
        ebicsC53Abrufen(admin, kunde, von, bis),
      );
      let anzahlNeu = 0;
      const xmls =
        orderData.length === 0 ? [] : await extractCamt053Xmls(orderData);
      for (const xml of xmls) {
        const parsed = parseCamt053Xml(xml);
        const gesellschaftId = await gesellschaftIdFuerKontoIban(
          admin,
          parsed.kontoIban,
          kunde.gesellschaft_id,
        );
        await kontosaldenSpeichern(admin, parsed, gesellschaftId);
        if (!parsed.kontoIban || parsed.buchungen.length === 0) continue;
        const bekannt = await bekannteFingerprintsKonto(
          admin,
          parsed.kontoIban,
          parsed.buchungen.map((b) => b.fingerprint),
        );
        const neu = parsed.buchungen.filter((b) => !bekannt.has(b.fingerprint));
        if (neu.length === 0) continue;
        anzahlNeu += await importiereBuchungen(admin, {
          gesellschaftId,
          kontoIban: parsed.kontoIban,
          dateiname: `EBICS C53 ${parsed.kontoIban} ${von}`,
          zeitraumVon: parsed.zeitraumVon ?? von,
          zeitraumBis: parsed.zeitraumBis ?? bis,
          buchungen: neu,
        });
      }
      await admin.from("ebics_abrufe").insert({
        ebics_kunde_id: kunde.id,
        auftragsart: "C53",
        zeitraum_von: von,
        zeitraum_bis: bis,
        anzahl_buchungen: anzahlNeu,
        erfolgreich: true,
        fehler: null,
      });
      ergebnisse.push({
        gesellschaftId: kunde.gesellschaft_id,
        status: "ok",
        anzahlNeu,
        leer: orderData.length === 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin.from("ebics_abrufe").insert({
        ebics_kunde_id: kunde.id,
        auftragsart: "C53",
        zeitraum_von: von,
        zeitraum_bis: bis,
        anzahl_buchungen: 0,
        erfolgreich: false,
        fehler: msg,
      });
      ergebnisse.push({
        gesellschaftId: kunde.gesellschaft_id,
        status: "fehler",
        anzahlNeu: 0,
        meldung: msg,
      });
    }
  }

  return {
    ergebnisse,
    anzahlNeuGesamt: ergebnisse.reduce((s, e) => s + e.anzahlNeu, 0),
  };
}
