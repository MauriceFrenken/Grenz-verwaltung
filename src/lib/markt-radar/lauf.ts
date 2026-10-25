/**
 * Ein Lauf des Markt-Radars: Profil aus Salesforce bauen, beide Seiten recherchieren,
 * Quellen prüfen, mit Salesforce abgleichen und neue Meldungen speichern. Server-only.
 */

import type { createServiceRoleClient } from "@/lib/server/aufrufer";

import { findeSfTreffer, pruefeFunde, type SfKontaktKurz } from "./abgleich";
import { radarRecherche } from "./ki";
import type { RadarSeite } from "./typen";

type Admin = ReturnType<typeof createServiceRoleClient>;

const SEITEN: RadarSeite[] = ["kaeufer", "verkaeufer"];

async function alle<T>(
  abfrage: (
    von: number,
    bis: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const ergebnis: T[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await abfrage(von, von + 999);
    if (error) throw new Error(error.message);
    ergebnis.push(...(data ?? []));
    if (!data || data.length < 1000) return ergebnis;
  }
}

function haeufigste(werte: (string | null | undefined)[], n: number): string {
  const zaehler = new Map<string, number>();
  for (const w of werte) {
    const t = w?.trim();
    if (t) zaehler.set(t, (zaehler.get(t) ?? 0) + 1);
  }
  return [...zaehler.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w, c]) => `${w} (${c})`)
    .join(", ");
}

/** Kurzprofil von Grenz & Co. aus Mandaten, Objekten und Ankaufsprofilen. */
export async function grenzProfil(admin: Admin): Promise<string> {
  const [objekte, mandate, profile] = await Promise.all([
    admin.from("sf_real_estate").select("objektart, ort").limit(5000),
    admin.from("sf_mandate").select("angebotspreis").limit(5000),
    admin
      .from("sf_ankaufsprofile")
      .select("assetklassen, regionen, volumen_min, volumen_max")
      .limit(5000),
  ]);
  const preise = (mandate.data ?? [])
    .map((m) => Number(m.angebotspreis))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  const median = preise.length ? preise[Math.floor(preise.length / 2)] : null;
  const zeilen = [
    `- Objektarten der Mandate: ${
      haeufigste(
        (objekte.data ?? []).map((o) => o.objektart),
        6,
      ) || "k. A."
    }`,
    `- Orte der Mandate: ${
      haeufigste(
        (objekte.data ?? []).map((o) => o.ort),
        8,
      ) || "k. A."
    }`,
    median
      ? `- Typischer Angebotspreis: ${Math.round(median / 100_000) / 10} Mio. € (Median von ${preise.length} Mandaten)`
      : null,
    `- Gesuchte Assetklassen der Investoren: ${
      haeufigste(
        (profile.data ?? []).flatMap((p) => p.assetklassen ?? []),
        6,
      ) || "k. A."
    }`,
    `- Gesuchte Regionen der Investoren: ${
      haeufigste(
        (profile.data ?? []).flatMap((p) => p.regionen ?? []),
        8,
      ) || "k. A."
    }`,
  ];
  return zeilen.filter(Boolean).join("\n");
}

async function sfKontakte(admin: Admin): Promise<SfKontaktKurz[]> {
  const zeilen = await alle<{
    sf_id: string;
    name: string;
    firma: string | null;
  }>((von, bis) =>
    admin
      .from("sf_kontakte")
      .select("sf_id, name, firma")
      .in("sf_typ", ["Account", "Contact"])
      .order("sf_id")
      .range(von, bis),
  );
  return zeilen.map((z) => ({ sfId: z.sf_id, name: z.name, firma: z.firma }));
}

async function bekannteAkteure(
  admin: Admin,
  seite: RadarSeite,
): Promise<string[]> {
  const ab = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await admin
    .from("markt_radar_meldungen")
    .select("akteur")
    .eq("seite", seite)
    .gte("created_at", ab)
    .limit(1000);
  return [...new Set((data ?? []).map((d) => d.akteur))];
}

export type RadarLaufErgebnis = {
  laufId: string;
  neu: number;
  gesamt: number;
  verworfen: number;
};

/**
 * `optionen.auftrag`: zusätzlicher Suchauftrag, z. B. die Käufersuche für ein einzelnes
 * Mandat aus der Mandatsakte; `optionen.seiten` beschränkt den Lauf auf eine Seite.
 */
export async function marktRadarAusfuehren(
  admin: Admin,
  ausloeser: "cron" | "manuell",
  optionen: { seiten?: RadarSeite[]; auftrag?: string } = {},
): Promise<RadarLaufErgebnis> {
  const { data: lauf, error: laufFehler } = await admin
    .from("markt_radar_laeufe")
    .insert({ ausloeser })
    .select("id")
    .single();
  if (laufFehler || !lauf)
    throw new Error(
      laufFehler?.message ?? "Lauf konnte nicht angelegt werden.",
    );

  try {
    const [profil, kontakte] = await Promise.all([
      grenzProfil(admin),
      sfKontakte(admin),
    ]);
    const kosten = { input: 0, output: 0, suchen: 0 };
    let neu = 0;
    let gesamt = 0;
    let verworfen = 0;

    const ergebnisse = await Promise.all(
      (optionen.seiten ?? SEITEN).map(async (seite) => {
        const bekannt = await bekannteAkteure(admin, seite);
        return {
          seite,
          ...(await radarRecherche(seite, profil, bekannt, optionen.auftrag)),
        };
      }),
    );

    for (const e of ergebnisse) {
      kosten.input += e.usage.input;
      kosten.output += e.usage.output;
      kosten.suchen += e.usage.suchen;
      const geprueft = pruefeFunde(e.funde, e.urls);
      verworfen += geprueft.verworfen;
      gesamt += geprueft.gueltig.length;
      if (!geprueft.gueltig.length) continue;

      // Schon gespeicherte Kombinationen (Akteur + Quelle) überspringen.
      const { data: vorhanden } = await admin
        .from("markt_radar_meldungen")
        .select("akteur, quelle_url")
        .eq("seite", e.seite)
        .in(
          "quelle_url",
          geprueft.gueltig.map((f) => f.quelleUrl),
        );
      const schon = new Set(
        (vorhanden ?? []).map(
          (v) => `${v.akteur.toLowerCase()}|${v.quelle_url}`,
        ),
      );

      const zeilen = geprueft.gueltig
        .filter((f) => !schon.has(`${f.akteur.toLowerCase()}|${f.quelleUrl}`))
        .map((f) => {
          const treffer = findeSfTreffer(f.akteur, kontakte);
          return {
            seite: e.seite,
            akteur: f.akteur,
            akteur_typ: f.akteurTyp,
            ereignis: f.ereignis,
            transaktion: f.transaktion,
            objektart: f.objektart,
            ort: f.ort,
            volumen_eur: f.volumenEur,
            ereignis_am: f.ereignisAm,
            quelle_url: f.quelleUrl,
            quelle_titel: f.quelleTitel,
            quelle_medium: f.quelleMedium,
            relevanz: f.relevanz,
            begruendung: f.begruendung,
            sf_kontakt_sf_id: treffer?.sfId ?? null,
            sf_bekannt_als: treffer ? (treffer.firma ?? treffer.name) : null,
            lauf_id: lauf.id,
          };
        });
      if (!zeilen.length) continue;
      const { error } = await admin
        .from("markt_radar_meldungen")
        .insert(zeilen);
      if (error) throw new Error(error.message);
      neu += zeilen.length;
    }

    await admin
      .from("markt_radar_laeufe")
      .update({
        status: "fertig",
        beendet_am: new Date().toISOString(),
        anzahl_neu: neu,
        anzahl_gesamt: gesamt,
        kosten: { ...kosten, verworfen },
      })
      .eq("id", lauf.id);
    // Neue Käufermeldungen den Investoren zuordnen und die Liste fortschreiben.
    try {
      const { investorenAufbauen } = await import("@/lib/investoren/aufbau");
      await investorenAufbauen(admin);
    } catch (err) {
      console.error("[markt-radar] Investoren-Aufbau", err);
    }
    return { laufId: lauf.id, neu, gesamt, verworfen };
  } catch (err) {
    await admin
      .from("markt_radar_laeufe")
      .update({
        status: "fehler",
        beendet_am: new Date().toISOString(),
        fehler: err instanceof Error ? err.message : String(err),
      })
      .eq("id", lauf.id);
    throw err;
  }
}
