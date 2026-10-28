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
};

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
    nutzungsarten: q.nutzungen,
    regionen: q.regionen,
    volumen_min: zahl(q.volumen_min),
    volumen_max: zahl(q.volumen_max),
    faktor_max: null,
    einheiten_min: zahl(q.einheiten_min),
    baujahr_ab: null,
    baujahr_bis: null,
    investor_typ: q.typ,
  };
}
