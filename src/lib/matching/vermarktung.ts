/**
 * Abgleich der laufenden Vermarktungen gegen die ganze Investorendatenbank: je Mandat die
 * qualifizierten Salesforce-Investoren, die noch nicht in der Vermarktungskampagne sind, und
 * passende Investoren aus den Listen, die erst in Salesforce angelegt werden müssen.
 */

import {
  rangliste,
  type MatchErgebnis,
  type ObjektMerkmale,
  type ProfilZeile,
} from "./score";

/** Ab hier gilt ein Treffer als qualifiziert: guter Score und mindestens zwei der Kernkriterien belegt. */
export const MIN_SCORE = 70;
export const MIN_ABDECKUNG = 50;

export type Qualifiziert = MatchErgebnis & { gruende: string[] };

/** Was für den Treffer spricht, in Kurzform für die Liste. */
export function gruende(e: MatchErgebnis): string[] {
  return e.kriterien
    .filter((k) => k.punkte != null && k.punkte >= 70)
    .map((k) => k.begruendung);
}

/**
 * Qualifizierte Treffer eines Objekts: kein Ausschluss, Score und Abdeckung über der Schwelle,
 * ohne die schon angesprochenen Profile. Reihenfolge wie im Käufer-Matching.
 */
export function qualifizierteTreffer(
  objekt: ObjektMerkmale,
  profile: ProfilZeile[],
  opts: {
    gewichtung?: Map<string, number>;
    ausschliessen?: (p: ProfilZeile) => boolean;
    max?: number;
  } = {},
): Qualifiziert[] {
  const kandidaten = opts.ausschliessen
    ? profile.filter((p) => !opts.ausschliessen!(p))
    : profile;
  return rangliste(objekt, kandidaten, opts.gewichtung)
    .filter(
      (e) =>
        !e.ausschluss && e.score >= MIN_SCORE && e.abdeckung >= MIN_ABDECKUNG,
    )
    .slice(0, opts.max ?? 50)
    .map((e) => ({ ...e, gruende: gruende(e) }));
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
