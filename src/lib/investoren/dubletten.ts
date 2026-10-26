/**
 * Dubletten in den externen Listen: 7Plus führt eine Firma je Nutzungsart mehrfach, Suchkunden
 * je Person und Objekt, und dieselbe Firma steht oft in mehreren Listen. Je Gruppe bleibt ein
 * Haupteintrag, der die Angaben aller Einträge vereint; die übrigen zeigen per dublette_von auf
 * ihn und verschwinden aus Liste und Prüfung. Idempotent, daher bei jedem Lauf neu berechenbar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalisiereFirma } from "@/lib/markt-radar/abgleich";

export type QuellRoh = {
  schluessel: string;
  quelle: string;
  firma: string | null;
  person: string | null;
  emails: string[] | null;
  telefon: string | null;
  adresse: string | null;
  ort: string | null;
  webseite: string | null;
  typ: string | null;
  nutzungen: string[] | null;
  objektklassen: string[] | null;
  zustand: string[] | null;
  struktur: string[] | null;
  volumen_min: number | string | null;
  volumen_max: number | string | null;
  regionen: string[] | null;
  nrw_bezug: string | null;
  objekte_interesse: string[] | null;
  nicht_anlegen: boolean | null;
  passung: number | null;
  sf_treffer_art: string | null;
  sf_kontakt_sf_id: string | null;
  sf_account_sf_id: string | null;
  bearbeitung: string;
  dublette_von: string | null;
};

const ARRAYS = ["emails", "nutzungen", "objektklassen", "zustand", "struktur", "regionen", "objekte_interesse"] as const;
const TEXTE = ["firma", "person", "telefon", "adresse", "ort", "webseite", "typ", "sf_treffer_art", "sf_kontakt_sf_id", "sf_account_sf_id"] as const;
/** Wer bei gleicher Lage Haupteintrag wird: eigene Liste und Recherche vor Marktlisten. */
const QUELL_RANG: Record<string, number> = { leadliste: 0, recherche: 1, "7plus": 2, suchkunden: 3 };
const BEARBEITUNG_RANG: Record<string, number> = { angelegt: 0, offen: 1, verworfen: 2 };

function zahl(w: unknown): number | null {
  if (w == null || w === "") return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}

/** Schlüssel, unter denen zwei Einträge als dieselbe Firma oder Person gelten. */
export function gruppenSchluessel(z: Pick<QuellRoh, "firma" | "person" | "emails" | "typ">): string[] {
  const s: string[] = [];
  for (const e of z.emails ?? []) {
    const m = e.trim().toLowerCase();
    if (m.includes("@")) s.push(`e:${m}`);
  }
  // Personen ohne Firma nur über die E-Mail, sonst würden Namensvettern verschmolzen.
  const person = !z.firma?.trim() || z.typ === "Privat" || z.firma.trim() === z.person?.trim();
  const roh = person ? (s.length ? "" : (z.person ?? z.firma ?? "").trim()) : z.firma!.trim();
  if (roh) {
    const kern = normalisiereFirma(roh);
    // Bei sehr kurzem Kern („ABC Immobilien“ → „abc“) den vollen Namen nehmen, damit
    // „ABC Immobilien“ und „ABC Capital“ nicht zusammenfallen.
    const name = kern.length >= 5 ? kern : roh.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");
    if (name.length >= 3) s.push(`n:${name}`);
  }
  return s;
}

function haupt(a: QuellRoh, b: QuellRoh): number {
  return (
    Number(Boolean(b.sf_account_sf_id || b.sf_kontakt_sf_id)) - Number(Boolean(a.sf_account_sf_id || a.sf_kontakt_sf_id)) ||
    (BEARBEITUNG_RANG[a.bearbeitung] ?? 1) - (BEARBEITUNG_RANG[b.bearbeitung] ?? 1) ||
    (b.passung ?? 0) - (a.passung ?? 0) ||
    (QUELL_RANG[a.quelle] ?? 9) - (QUELL_RANG[b.quelle] ?? 9) ||
    a.schluessel.localeCompare(b.schluessel)
  );
}

export type Zusammenfuehrung = {
  /** Neue Werte je Haupteintrag (nur geänderte Felder). */
  haupt: Map<string, Partial<QuellRoh> & { zusammengefuehrt: string[] }>;
  /** dublette_von je Eintrag (null = eigenständig oder Haupteintrag). */
  verweis: Map<string, string | null>;
  gruppen: number;
};

/** Gruppiert per Name oder gemeinsamer E-Mail (transitiv) und vereint je Gruppe die Angaben. */
export function quellenZusammenfuehren(zeilen: QuellRoh[]): Zusammenfuehrung {
  const eltern = zeilen.map((_, i) => i);
  const finde = (i: number): number => (eltern[i] === i ? i : (eltern[i] = finde(eltern[i])));
  const erster = new Map<string, number>();
  zeilen.forEach((z, i) => {
    for (const k of gruppenSchluessel(z)) {
      const j = erster.get(k);
      if (j === undefined) erster.set(k, i);
      else eltern[finde(i)] = finde(j);
    }
  });
  const gruppen = new Map<number, QuellRoh[]>();
  zeilen.forEach((z, i) => {
    const g = gruppen.get(finde(i)) ?? [];
    g.push(z);
    gruppen.set(finde(i), g);
  });

  const ergebnis: Zusammenfuehrung = { haupt: new Map(), verweis: new Map(), gruppen: 0 };
  for (const g of gruppen.values()) {
    if (g.length === 1) {
      ergebnis.verweis.set(g[0].schluessel, null);
      continue;
    }
    ergebnis.gruppen++;
    const sortiert = [...g].sort(haupt);
    const h = sortiert[0];
    const neu: Partial<QuellRoh> & { zusammengefuehrt: string[] } = { zusammengefuehrt: sortiert.map((z) => z.schluessel) };
    for (const feld of ARRAYS) {
      const alle = [...new Set(sortiert.flatMap((z) => z[feld] ?? []).filter(Boolean))];
      if (alle.length !== (h[feld] ?? []).length) neu[feld] = alle;
    }
    for (const feld of TEXTE) {
      if (h[feld]) continue;
      const wert = sortiert.find((z) => z[feld])?.[feld];
      if (wert) neu[feld] = wert;
    }
    const mins = sortiert.map((z) => zahl(z.volumen_min)).filter((v): v is number => v != null);
    const maxs = sortiert.map((z) => zahl(z.volumen_max)).filter((v): v is number => v != null);
    if (mins.length && Math.min(...mins) !== zahl(h.volumen_min)) neu.volumen_min = Math.min(...mins);
    if (maxs.length && Math.max(...maxs) !== zahl(h.volumen_max)) neu.volumen_max = Math.max(...maxs);
    const nrw = sortiert.some((z) => z.nrw_bezug === "region") ? "region" : sortiert.some((z) => z.nrw_bezug === "sitz") ? "sitz" : null;
    if (nrw !== h.nrw_bezug) neu.nrw_bezug = nrw;
    const passung = Math.max(...sortiert.map((z) => z.passung ?? 0));
    if (passung !== (h.passung ?? 0)) neu.passung = passung;
    if (sortiert.some((z) => z.nicht_anlegen) && !h.nicht_anlegen) neu.nicht_anlegen = true;
    ergebnis.haupt.set(h.schluessel, neu);
    for (const z of sortiert) ergebnis.verweis.set(z.schluessel, z === h ? null : h.schluessel);
  }
  return ergebnis;
}

/** Lädt alle Listeneinträge, führt Dubletten zusammen und schreibt nur, was sich ändert. */
export async function quellenBereinigen(admin: SupabaseClient): Promise<{ eintraege: number; gruppen: number; dubletten: number; geaendert: number }> {
  const zeilen: (QuellRoh & { roh: Record<string, unknown> | null })[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await admin
      .from("investor_quellen")
      .select(`schluessel, quelle, bearbeitung, dublette_von, passung, nrw_bezug, nicht_anlegen, volumen_min, volumen_max, roh, ${[...ARRAYS, ...TEXTE].join(", ")}`)
      .order("schluessel")
      .range(von, von + 999);
    if (error) throw new Error(error.message);
    zeilen.push(...((data ?? []) as unknown as (QuellRoh & { roh: Record<string, unknown> | null })[]));
    if (!data || data.length < 1000) break;
  }
  const z = quellenZusammenfuehren(zeilen);
  const jeSchluessel = new Map(zeilen.map((x) => [x.schluessel, x]));
  let geaendert = 0;
  const aenderungen: { schluessel: string; werte: Record<string, unknown> }[] = [];
  for (const [schluessel, verweis] of z.verweis) {
    const alt = jeSchluessel.get(schluessel)!;
    const neu = z.haupt.get(schluessel);
    const werte: Record<string, unknown> = {};
    if ((alt.dublette_von ?? null) !== verweis) werte.dublette_von = verweis;
    if (neu) {
      const { zusammengefuehrt, ...felder } = neu;
      Object.assign(werte, felder);
      const bisher = (alt.roh?.zusammengefuehrt as string[] | undefined) ?? [];
      if (bisher.join("|") !== zusammengefuehrt.join("|")) werte.roh = { ...(alt.roh ?? {}), zusammengefuehrt };
    }
    if (Object.keys(werte).length) aenderungen.push({ schluessel, werte });
  }
  // Einzeln, weil jede Zeile andere Felder ändert; parallel in kleinen Paketen.
  for (let i = 0; i < aenderungen.length; i += 25) {
    const paket = aenderungen.slice(i, i + 25);
    const fehler = (
      await Promise.all(paket.map((a) => admin.from("investor_quellen").update(a.werte).eq("schluessel", a.schluessel)))
    ).find((r) => r.error)?.error;
    if (fehler) throw new Error(fehler.message);
    geaendert += paket.length;
  }
  const dubletten = [...z.verweis.values()].filter(Boolean).length;
  return { eintraege: zeilen.length, gruppen: z.gruppen, dubletten, geaendert };
}
