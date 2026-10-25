/**
 * Prüfung und Salesforce-Abgleich der Radar-Funde. Rein funktional, damit testbar.
 * Ein Fund zählt nur, wenn seine Quelle in den Suchergebnissen des Laufs vorkam.
 */

import type { RadarFund } from "./typen";

const RECHTSFORMEN =
  /\b(gmbh|mbh|ag|kg|kgaa|se|ug|ohg|gbr|eg|e\.?\s?v|co|ltd|llc|inc|plc|sarl|s\.?a|b\.?v|n\.?v|holding|gruppe|group|invest(?:ment)?s?|immobilien|real estate|asset management|capital|partners?)\b/g;

/** Firmenname ohne Rechtsform, Branchenwörter und Satzzeichen, zum Vergleichen. */
export function normalisiereFirma(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ")
    .replace(RECHTSFORMEN, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type SfKontaktKurz = {
  sfId: string;
  name: string;
  firma: string | null;
};

/**
 * Sucht den Akteur im Salesforce-Cache: gleicher normalisierter Name, oder ein Name enthält
 * den anderen als ganze Wörter (mindestens 5 Zeichen, damit „Aurelis“ nicht „Aurelis Asset“ verfehlt
 * und kurze Kürzel nichts Falsches treffen).
 */
export function findeSfTreffer(
  akteur: string,
  kontakte: SfKontaktKurz[],
): SfKontaktKurz | null {
  const ziel = normalisiereFirma(akteur);
  if (ziel.length < 3) return null;
  let teilTreffer: SfKontaktKurz | null = null;
  for (const k of kontakte) {
    for (const kandidat of [k.firma, k.name]) {
      if (!kandidat) continue;
      const n = normalisiereFirma(kandidat);
      if (!n) continue;
      if (n === ziel) return k;
      const kurz = n.length < ziel.length ? n : ziel;
      const lang = n.length < ziel.length ? ziel : n;
      if (
        !teilTreffer &&
        kurz.length >= 5 &&
        ` ${lang} `.includes(` ${kurz} `)
      ) {
        teilTreffer = k;
      }
    }
  }
  return teilTreffer;
}

/** URL ohne Fragment, Tracking-Parameter und abschließenden Schrägstrich. */
export function normalisiereUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(p)) u.searchParams.delete(p);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    const s = u.toString();
    return s.endsWith("/") ? s.slice(0, -1) : s;
  } catch {
    return null;
  }
}

/**
 * Behält nur Funde mit belegter Quelle und plausiblen Werten.
 * `belegteUrls` sind die URLs aus Websuche und Abruf des Laufs.
 */
export function pruefeFunde(
  funde: RadarFund[],
  belegteUrls: Iterable<string>,
): { gueltig: RadarFund[]; verworfen: number } {
  const belegt = new Set<string>();
  for (const url of belegteUrls) {
    const n = normalisiereUrl(url);
    if (n) belegt.add(n);
  }
  const gesehen = new Set<string>();
  const gueltig: RadarFund[] = [];
  let verworfen = 0;
  for (const f of funde) {
    const url = normalisiereUrl(f.quelleUrl);
    const akteur = f.akteur.trim();
    const schluessel = `${normalisiereFirma(akteur)}|${url}`;
    if (!url || !belegt.has(url) || !akteur || gesehen.has(schluessel)) {
      verworfen++;
      continue;
    }
    gesehen.add(schluessel);
    gueltig.push({
      ...f,
      akteur,
      quelleUrl: url,
      relevanz: Math.max(0, Math.min(100, Math.round(f.relevanz))),
      volumenEur:
        f.volumenEur != null &&
        Number.isFinite(f.volumenEur) &&
        f.volumenEur > 0
          ? f.volumenEur
          : null,
      ereignisAm:
        f.ereignisAm && /^\d{4}-\d{2}-\d{2}$/.test(f.ereignisAm)
          ? f.ereignisAm
          : null,
    });
  }
  return { gueltig, verworfen };
}
