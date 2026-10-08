/**
 * Transaktionspipeline (Immobilien): Ankauf, Verkauf ganzer Objekte und
 * Abverkauf einzelner Einheiten.
 *
 * Live-Quellen: public.ankauf_pipeline, public.objekt_verkauf,
 * public.einheiten_verkauf, public.personen, public.postfach_exposes.
 * Salesforce (Transaktion__c) wird nur gelesen und über die ID verknüpft.
 */
import { z } from "zod";

/** Stufen wie in public.ankauf_pipeline.stufe */
export const ANKAUF_PHASEN = [
  "expose",
  "bewertung",
  "angebot",
  "due_diligence",
  "notar",
  "gekauft",
  "abgesagt",
] as const;
export type AnkaufPhase = (typeof ANKAUF_PHASEN)[number];

export const PHASE_LABEL: Record<AnkaufPhase, string> = {
  expose: "Exposé",
  bewertung: "Bewertung",
  angebot: "Angebot",
  due_diligence: "Due Diligence",
  notar: "Notar",
  gekauft: "Gekauft",
  abgesagt: "Abgesagt",
};

export const ankaufSchema = z.object({
  id: z.string(),
  /** Salesforce Transaktion__c, falls verknüpft */
  sfId: z.string().nullable(),
  /** Postfach-Exposé, aus dem der Deal entstanden ist */
  exposeId: z.string().nullable().default(null),
  name: z.string(),
  strasse: z.string(),
  ort: z.string(),
  assetKlasse: z.string(),
  einheiten: z.number().int().nonnegative().nullable(),
  flaeche: z.number().positive().nullable(),
  /** Angebots- bzw. Kaufpreis, 0 = noch unbekannt */
  angebotspreis: z.number().nonnegative(),
  jahresnettokaltmiete: z.number().nonnegative().nullable(),
  makler: z.string().nullable(),
  phase: z.enum(ANKAUF_PHASEN),
  phaseSeit: z.string(),
  naechsterSchritt: z.string(),
  naechsterSchrittAm: z.string().nullable().default(null),
  verantwortlich: z.string(),
  zielGesellschaftId: z.string().nullable(),
  /** geplanter Eigenkapitalanteil am Gesamtinvest (Kaufpreis + NK) */
  ekQuote: z.number().min(0).max(1),
  /** false = EK-Quote nicht erfasst, Standardannahme verwendet */
  ekQuoteGesetzt: z.boolean().default(true),
  notartermin: z.string().nullable(),
  strategie: z.enum(["bestand", "aufteiler", "gewerbe"]),
});
export type Ankauf = z.infer<typeof ankaufSchema>;

export const kaeuferSchema = z.object({
  id: z.string(),
  sfId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  finanzierung: z.enum(["bestaetigt", "offen", "bar", "unbekannt"]),
});
export type Kaeufer = z.infer<typeof kaeuferSchema>;

/** Stufen wie in public.einheiten_verkauf.stufe */
export const RESERVIERUNG_STATUS = [
  "in_vermarktung",
  "reserviert",
  "kaufvertrag_in_vorbereitung",
  "notartermin",
  "beurkundet",
  "uebergeben",
  "abgebrochen",
] as const;
export type ReservierungStatus = (typeof RESERVIERUNG_STATUS)[number];

export const RESERVIERUNG_LABEL: Record<ReservierungStatus, string> = {
  in_vermarktung: "In Vermarktung",
  reserviert: "Reserviert",
  kaufvertrag_in_vorbereitung: "Kaufvertrag in Vorbereitung",
  notartermin: "Notartermin",
  beurkundet: "Beurkundet",
  uebergeben: "Übergeben",
  abgebrochen: "Abgebrochen",
};

export const reservierungSchema = z.object({
  id: z.string(),
  sfId: z.string().nullable(),
  unitId: z.string(),
  kaeuferId: z.string().nullable(),
  status: z.enum(RESERVIERUNG_STATUS),
  preis: z.number().nonnegative(),
  datum: z.string(),
  notartermin: z.string().nullable(),
});
export type Reservierung = z.infer<typeof reservierungSchema>;

/** Stufen wie in public.objekt_verkauf.stufe */
export const OBJEKTVERKAUF_STUFEN = [
  "vorbereitung",
  "vermarktung",
  "angebot",
  "due_diligence",
  "notar",
  "verkauft",
  "abgebrochen",
] as const;
export type ObjektVerkaufStufe = (typeof OBJEKTVERKAUF_STUFEN)[number];

export interface ObjektVerkauf {
  id: string;
  propertyId: string;
  stufe: ObjektVerkaufStufe;
  stufeSeit: string;
  angebotspreis: number | null;
  kaufpreis: number | null;
  makler: string | null;
  notartermin: string | null;
  naechsterSchritt: string;
  sfId: string | null;
}

/** Eingegangenes Exposé aus dem Postfach (Bens Exposé-Import) */
export interface Expose {
  id: string;
  eingegangenAm: string | null;
  betreff: string;
  absender: string;
  status: string;
  adresse: string;
  ort: string;
  angebotspreis: number | null;
  jahresnettokaltmiete: number | null;
  flaeche: number | null;
  einheiten: number | null;
  makler: string | null;
  sfTransaktionId: string | null;
  /** bereits in der Pipeline */
  ankaufId: string | null;
}

export interface CrmDaten {
  ankaeufe: Ankauf[];
  objektVerkaeufe: ObjektVerkauf[];
  kaeufer: Kaeufer[];
  reservierungen: Reservierung[];
  exposes: Expose[];
  /** Basis-URL für Links in die Salesforce-Oberfläche, falls bekannt */
  instanzUrl: string | null;
}

export const LEERE_CRM: CrmDaten = {
  ankaeufe: [],
  objektVerkaeufe: [],
  kaeufer: [],
  reservierungen: [],
  exposes: [],
  instanzUrl: null,
};
