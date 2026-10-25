/**
 * Käufer-Matching über die Ankaufsprofile hinaus. Reine Funktionen, testbar.
 * - Interne Historie: Kontakte, die bei ähnlichen Grenz-Mandaten Interesse gezeigt haben.
 * - Markt: aktive Käufer aus dem Markt-Radar (Immobiliennews), bewertet gegen das Objekt.
 */

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLocaleLowerCase("de-DE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ObjektFamilie =
  | "wohnen"
  | "wgh"
  | "buero"
  | "handel"
  | "logistik"
  | "hotel"
  | "pflege"
  | "grundstueck";

/** Grobe Nutzungsfamilie aus einer Objektart (Salesforce oder News-Text). */
export function objektFamilien(
  objektart: string | null | undefined,
): ObjektFamilie[] {
  const o = norm(objektart);
  if (!o) return [];
  const f = new Set<ObjektFamilie>();
  if (/wohn ?und ?geschaeft|wgh|geschaeftshaus|gemischt/.test(o)) f.add("wgh");
  if (
    /mehrfamilien|mfh|wohn|zinshaus|apartment|etw|eigentumswohnung|altbau|residential/.test(
      o,
    )
  )
    f.add("wohnen");
  if (/buero|office/.test(o)) f.add("buero");
  if (
    /einzelhandel|handel|fachmarkt|retail|nahversorg|supermarkt|geschaeft/.test(
      o,
    )
  )
    f.add("handel");
  if (/logistik|lager|halle|gewerbe|industrie|light industrial/.test(o))
    f.add("logistik");
  if (/hotel/.test(o)) f.add("hotel");
  if (/pflege|senior|sozial/.test(o)) f.add("pflege");
  if (/grundstueck|bauland|projektentwicklung/.test(o)) f.add("grundstueck");
  return [...f];
}

/** Passen zwei Objektarten zusammen? 1 = gleiche Familie, 0.5 = verwandt (WGH ~ Wohnen/Handel), 0 = nein. */
export function nutzungsNaehe(
  a: string | null,
  b: string | null,
): number | null {
  const fa = objektFamilien(a);
  const fb = objektFamilien(b);
  if (!fa.length || !fb.length) return null;
  if (fa.some((x) => fb.includes(x))) return 1;
  const verwandt = (x: ObjektFamilie, y: ObjektFamilie) =>
    (x === "wgh" && (y === "wohnen" || y === "handel")) ||
    (y === "wgh" && (x === "wohnen" || x === "handel"));
  return fa.some((x) => fb.some((y) => verwandt(x, y))) ? 0.5 : 0;
}

const NRW_ORTE =
  /duesseldorf|koeln|neuss|ratingen|mettmann|leverkusen|krefeld|moenchengladbach|wuppertal|solingen|remscheid|essen|duisburg|bochum|dortmund|bonn|aachen|meerbusch|hilden|langenfeld|erkelenz|leichlingen|dormagen|kaarst|mülheim|muelheim|oberhausen|gelsenkirchen|hagen|bergisch|rhein|ruhr/;

/** Regionale Nähe 0 bis 1: gleicher Ort 1, NRW/Rheinland 0.6, bundesweit 0.3, sonst 0. */
export function regionsNaehe(
  objektOrte: string[],
  ort: string | null,
): number | null {
  const o = norm(ort);
  if (!o) return null;
  const orte = objektOrte.map(norm).filter(Boolean);
  const erstes = o.split(" ")[0] ?? "";
  if (
    orte.some(
      (x) => o.includes(x) || (erstes.length >= 4 && x.includes(erstes)),
    )
  )
    return 1;
  const objektInNrw = orte.some((x) => NRW_ORTE.test(x));
  if (
    objektInNrw &&
    (/\bnrw\b|nordrhein|rheinland|ruhrgebiet|bergisches land/.test(o) ||
      NRW_ORTE.test(o))
  )
    return 0.6;
  if (/deutschland|bundesweit|dach|germany|a staedte|b staedte|top 7/.test(o))
    return 0.3;
  return 0;
}

export type RadarKaeufer = {
  id: string;
  akteur: string;
  akteurTyp: string | null;
  ereignis: string;
  objektart: string | null;
  ort: string | null;
  volumenEur: number | null;
  ereignisAm: string | null;
  createdAt: string;
  relevanz: number;
  quelleUrl: string;
  quelleTitel: string | null;
  quelleMedium: string | null;
  sfKontaktSfId: string | null;
  sfBekanntAls: string | null;
  status: string;
};

export type MarktTreffer = RadarKaeufer & {
  score: number;
  gruende: string[];
};

/**
 * Passung eines aktiven Marktkäufers zum Objekt (0 bis 100): Nutzung 35, Region 30,
 * Volumen 15, Aktualität 10, Relevanz laut Radar 10. Unbekanntes zählt halb, fremde Nutzung
 * höchstens 25.
 */
export function marktPassung(
  k: RadarKaeufer,
  objekt: { objektart: string | null; orte: string[]; preis: number | null },
  heute = new Date(),
): MarktTreffer {
  const gruende: string[] = [];
  const nutzung = nutzungsNaehe(objekt.objektart, k.objektart);
  if (nutzung === 1) gruende.push(`kauft ${k.objektart}`);
  else if (nutzung === 0.5) gruende.push(`verwandte Nutzung (${k.objektart})`);
  const region = regionsNaehe(objekt.orte, k.ort);
  if (region === 1) gruende.push(`aktiv in ${k.ort}`);
  else if (region && region >= 0.6)
    gruende.push(`aktiv in der Region (${k.ort})`);

  let volumen: number | null = null;
  if (k.volumenEur && objekt.preis) {
    const r = k.volumenEur / objekt.preis;
    volumen = r >= 0.3 && r <= 5 ? 1 : r > 5 && r <= 20 ? 0.4 : 0;
    if (volumen === 1) gruende.push("ähnliche Ticketgröße");
  }
  const datum = new Date(k.ereignisAm ?? k.createdAt);
  const tage = (heute.getTime() - datum.getTime()) / 86_400_000;
  const aktuell = tage <= 30 ? 1 : tage <= 90 ? 0.6 : tage <= 180 ? 0.3 : 0;
  if (tage <= 30) gruende.push("in den letzten 30 Tagen aktiv");

  const teil = (wert: number | null, gewicht: number) =>
    (wert == null ? 0.5 : wert) * gewicht;
  const roh = Math.round(
    teil(nutzung, 35) +
      teil(region, 30) +
      teil(volumen, 15) +
      aktuell * 10 +
      (Math.max(0, Math.min(100, k.relevanz)) / 100) * 10,
  );
  // Andere Nutzung (z. B. Logistik für ein Zinshaus) bleibt unten, egal wie aktiv.
  const score = nutzung === 0 ? Math.min(roh, 25) : roh;
  return { ...k, score, gruende };
}

export type InteresseEreignis = {
  kontaktSfId: string;
  mandatSfId: string;
  /** „Interesse“, „Besichtigung“, „Kaufangebot“ oder Deal-Phase. */
  stufe: string;
  datum: string | null;
};

export type MandatKurz = {
  sfId: string;
  name: string;
  objektart: string | null;
  ort: string | null;
  preis: number | null;
};

export type HistorieTreffer = {
  kontaktSfId: string;
  score: number;
  /** Ähnliche Mandate, bei denen der Kontakt reagiert hat, bestes zuerst. */
  objekte: { mandat: MandatKurz; stufe: string; aehnlichkeit: number }[];
};

const STUFE_GEWICHT: [RegExp, number][] = [
  [/kaufangebot|invoice paid|closed won|notar|kaufvertrag/i, 1],
  [/besichtigung|data room|datenraum/i, 0.8],
  [/interesse|initial interest|geantwortet/i, 0.6],
];

export function stufenGewicht(stufe: string): number {
  for (const [muster, gewicht] of STUFE_GEWICHT)
    if (muster.test(stufe)) return gewicht;
  return 0.4;
}

/** Wie ähnlich ist ein früheres Mandat dem aktuellen Objekt? 0 bis 1. */
export function mandatsAehnlichkeit(
  objekt: { objektart: string | null; orte: string[]; preis: number | null },
  m: MandatKurz,
): number {
  const nutzung = nutzungsNaehe(objekt.objektart, m.objektart);
  const region = regionsNaehe(objekt.orte, m.ort);
  let preis: number | null = null;
  if (objekt.preis && m.preis) {
    const r = m.preis / objekt.preis;
    preis = r >= 0.5 && r <= 2 ? 1 : r >= 0.25 && r <= 4 ? 0.5 : 0;
  }
  const teil = (w: number | null, g: number) => (w == null ? 0.5 : w) * g;
  return (teil(nutzung, 50) + teil(region, 30) + teil(preis, 20)) / 100;
}

/**
 * Frühere Interessenten ähnlicher Mandate. Je Kontakt zählt die beste Kombination aus
 * Ähnlichkeit und Stufe (Kaufangebot > Besichtigung > Interesse); weitere Reaktionen heben leicht.
 */
export function historieTreffer(
  objekt: { objektart: string | null; orte: string[]; preis: number | null },
  aktuellesMandat: string,
  ereignisse: InteresseEreignis[],
  mandate: Map<string, MandatKurz>,
): HistorieTreffer[] {
  const jeKontakt = new Map<string, HistorieTreffer["objekte"]>();
  for (const e of ereignisse) {
    if (e.mandatSfId === aktuellesMandat) continue;
    const m = mandate.get(e.mandatSfId);
    if (!m) continue;
    const liste = jeKontakt.get(e.kontaktSfId) ?? [];
    const vorhanden = liste.find((x) => x.mandat.sfId === m.sfId);
    if (vorhanden) {
      if (stufenGewicht(e.stufe) > stufenGewicht(vorhanden.stufe))
        vorhanden.stufe = e.stufe;
      continue;
    }
    liste.push({
      mandat: m,
      stufe: e.stufe,
      aehnlichkeit: mandatsAehnlichkeit(objekt, m),
    });
    jeKontakt.set(e.kontaktSfId, liste);
  }
  const ergebnis: HistorieTreffer[] = [];
  for (const [kontaktSfId, objekte] of jeKontakt) {
    const wert = (x: HistorieTreffer["objekte"][number]) =>
      x.aehnlichkeit * (0.6 + 0.4 * stufenGewicht(x.stufe));
    objekte.sort((a, b) => wert(b) - wert(a));
    const score = Math.min(
      100,
      Math.round(
        wert(objekte[0]) * 100 + Math.min(10, (objekte.length - 1) * 4),
      ),
    );
    ergebnis.push({ kontaktSfId, score, objekte });
  }
  return ergebnis.sort((a, b) => b.score - a.score);
}
