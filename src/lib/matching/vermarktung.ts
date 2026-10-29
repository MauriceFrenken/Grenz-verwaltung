/**
 * Abgleich der laufenden Vermarktungen gegen die ganze Investorendatenbank: je Mandat die
 * qualifizierten Salesforce-Investoren, die noch nicht in der Vermarktungskampagne sind, und
 * passende Investoren aus den Listen, die erst in Salesforce angelegt werden müssen.
 */

import {
  KEINE_SIGNALE,
  kaeuferScore,
  nachKreis,
  type InvestorSignale,
  type KaeuferScore,
} from "./kaeufer-score";
import {
  bewerteProfil,
  type MatchErgebnis,
  type ObjektMerkmale,
  type ProfilZeile,
} from "./score";

/** Qualifiziert für eine Vermarktung sind A- und B-Kreis (Scoring-Modell kaeufer-score.ts). */
export const QUALIFIZIERTE_KREISE = ["A", "B"] as const;

export type Qualifiziert = MatchErgebnis & {
  /** Reine Objektpassung aus den Ankaufskriterien (score.ts), score ist das Scoring-Modell. */
  passung: number;
  gruende: string[];
  bewertung: KaeuferScore;
};

/** Was für den Treffer spricht, in Kurzform für die Liste: Bausteine mit mindestens 70 % der Punkte. */
export function gruende(b: KaeuferScore): string[] {
  return b.bausteine
    .filter((x) => x.belegt && x.punkte >= x.max * 0.7)
    .map((x) => x.begruendung);
}

/** Profil bewerten: Passung je Kriterium plus Scoring-Modell, Score und Ausschluss aus dem Modell. */
export function bewerteMitScore(
  objekt: ObjektMerkmale,
  p: ProfilZeile,
  signale: InvestorSignale = KEINE_SIGNALE,
  heute = new Date(),
): Qualifiziert {
  const e = bewerteProfil(objekt, p);
  const bewertung = kaeuferScore(objekt, e, signale, heute);
  return {
    ...e,
    passung: e.score,
    score: bewertung.score,
    ausschluss: bewertung.ausschluss != null,
    bewertung,
    gruende: gruende(bewertung),
  };
}

/**
 * Qualifizierte Treffer eines Objekts: A- und B-Kreis laut Scoring-Modell, ohne die schon
 * angesprochenen Profile. Reihenfolge: Kreis, dann Score.
 */
export function qualifizierteTreffer(
  objekt: ObjektMerkmale,
  profile: ProfilZeile[],
  opts: {
    signale?: (p: ProfilZeile) => InvestorSignale;
    ausschliessen?: (p: ProfilZeile) => boolean;
    kreise?: readonly string[];
    max?: number;
  } = {},
): Qualifiziert[] {
  const kreise = opts.kreise ?? QUALIFIZIERTE_KREISE;
  return profile
    .filter((p) => !opts.ausschliessen?.(p))
    .map((p) => bewerteMitScore(objekt, p, opts.signale?.(p)))
    .filter((e) => kreise.includes(e.bewertung.kreis))
    .sort(nachKreis)
    .slice(0, opts.max ?? 50);
}

type ListenRoh = {
  schluessel: string;
  firma: string | null;
  person: string | null;
  typ: string | null;
  nutzungen: string[] | null;
  objektklassen: string[] | null;
  regionen: string[] | null;
  volumen_min: number | string | null;
  volumen_max: number | string | null;
  einheiten_min: number | string | null;
  objekte_interesse?: string[] | null;
};

/** Ortskürzel der Grenz-Objekte in der Suchkunden-Liste („2 D Art Noveau“, „16 K Roddergasse 68“). */
const KUERZEL: Record<string, string> = {
  D: "Düsseldorf",
  K: "Köln",
  AC: "Aachen",
  BN: "Bonn",
  MG: "Mönchengladbach",
  W: "Wuppertal",
  NE: "Neuss",
  E: "Essen",
};
const ORTE_IM_NAMEN = ["Velbert", "Brühl"];

/**
 * Suchgebiet eines Suchkunden aus den Grenz-Objekten, für die er sich interessiert hat: die
 * Städte der Objekte plus NRW (alle Objekte liegen in NRW). Ohne erkennbare Stadt leer.
 */
export function regionenAusInteresse(
  objekte: string[] | null | undefined,
): string[] {
  const orte = new Set<string>();
  for (const o of objekte ?? []) {
    const teile = o.trim().split(/\s+/);
    const kuerzel = KUERZEL[teile[1] ?? ""];
    if (kuerzel) orte.add(kuerzel);
    for (const ort of ORTE_IM_NAMEN) if (o.includes(ort)) orte.add(ort);
  }
  return orte.size ? [...orte, "NRW"] : [];
}

const zahl = (w: unknown) =>
  w == null || w === "" || !Number.isFinite(Number(w)) ? null : Number(w);

/** Listeneintrag als Profil fürs Matching; sf_id ist der Listenschlüssel mit Präfix „quelle:“. */
export function listeAlsProfil(q: ListenRoh): ProfilZeile {
  return {
    sf_id: `quelle:${q.schluessel}`,
    name: q.firma ?? q.person,
    kontakt_sf_id: null,
    account_sf_id: null,
    assetklassen: q.objektklassen,
    // Die 24 Objekte der Suchkunden-Liste sind Wohnobjekte aus der Wohninvestment-Vermarktung
    // (Wohnungsunternehmen und -investoren als Interessenten), daher ohne eigene Angabe „Wohnen“.
    nutzungsarten: q.nutzungen?.length
      ? q.nutzungen
      : q.objekte_interesse?.length
        ? ["Wohnen"]
        : q.nutzungen,
    regionen: q.regionen?.length
      ? q.regionen
      : regionenAusInteresse(q.objekte_interesse),
    volumen_min: zahl(q.volumen_min),
    volumen_max: zahl(q.volumen_max),
    faktor_max: null,
    einheiten_min: zahl(q.einheiten_min),
    baujahr_ab: null,
    baujahr_bis: null,
    investor_typ: q.typ,
  };
}
