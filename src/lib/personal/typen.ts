/** Typen des Personalbereichs (Mitarbeiterakte, Abwesenheiten, Schulungen, Checklisten). */

export const VERTRAGSARTEN = {
  geschaeftsfuehrung: "Geschäftsführung",
  vollzeit: "Vollzeit",
  teilzeit: "Teilzeit",
  minijob: "Minijob",
  werkstudent: "Werkstudent",
  praktikum: "Praktikum",
  freie_mitarbeit: "Freie Mitarbeit",
} as const;
export type Vertragsart = keyof typeof VERTRAGSARTEN;

export const ABWESENHEITSARTEN = {
  urlaub: "Urlaub",
  krank: "Krank",
  fortbildung: "Fortbildung",
  homeoffice: "Homeoffice",
  sonderurlaub: "Sonderurlaub",
  elternzeit: "Elternzeit",
} as const;
export type Abwesenheitsart = keyof typeof ABWESENHEITSARTEN;
/** Für Kollegen ohne Personalrecht wird der Grund dieser Arten verborgen. */
export const VERTRAULICHE_ARTEN: Abwesenheitsart[] = [
  "krank",
  "sonderurlaub",
  "elternzeit",
];

export type AbwesenheitStatus = "beantragt" | "genehmigt" | "abgelehnt";

export const SCHULUNGSARTEN = {
  weiterbildung_34c: "Weiterbildung §34c GewO",
  gwg: "Geldwäsche (GwG)",
  datenschutz: "Datenschutz",
  sonstige: "Sonstige",
} as const;
export type Schulungsart = keyof typeof SCHULUNGSARTEN;

export type ChecklistenTyp = "onboarding" | "offboarding";

export interface Mitarbeiter {
  id: string;
  profilId: string | null;
  name: string;
  email: string | null;
  telefon: string | null;
  position: string | null;
  /** Ab hier nur für die eigene Akte und für Personalverantwortliche. */
  vertragsart: Vertragsart | null;
  wochenstunden: number | null;
  urlaubstageJahr: number | null;
  eintrittAm: string | null;
  probezeitBis: string | null;
  austrittAm: string | null;
  geburtstag: string | null;
  notfallkontakt: string | null;
  sfUserId: string | null;
  weiterbildungspflichtig: boolean;
  personalakteUrl: string | null;
  notizen: string | null;
  /** false: nur Name/Position/Kontakt sichtbar. */
  vollstaendig: boolean;
}

export interface Abwesenheit {
  id: string;
  mitarbeiterId: string;
  /** null = „abwesend“ (Grund für den Betrachter verborgen). */
  art: Abwesenheitsart | null;
  von: string;
  bis: string;
  halbtag: boolean;
  status: AbwesenheitStatus;
  notiz: string | null;
  entschiedenAm: string | null;
}

export interface Jahreswert {
  mitarbeiterId: string;
  jahr: number;
  urlaubUebertrag: number;
  provisionszielEur: number | null;
}

export interface Schulung {
  id: string;
  mitarbeiterId: string;
  art: Schulungsart;
  titel: string;
  anbieter: string | null;
  datum: string;
  stunden: number | null;
  nachweisUrl: string | null;
  notiz: string | null;
}

export interface Checkpunkt {
  id: string;
  mitarbeiterId: string;
  typ: ChecklistenTyp;
  punkt: string;
  reihenfolge: number;
  erledigtAm: string | null;
}

export interface AppBenutzer {
  id: string;
  name: string;
  email: string;
  stellenbezeichnung: string;
}

export interface SfNutzer {
  id: string;
  name: string;
}

export interface PersonalDto {
  /** Darf alle Akten sehen und bearbeiten, Anträge entscheiden. */
  verwalten: boolean;
  /** Akte des angemeldeten Benutzers, falls verknüpft. */
  ichId: string | null;
  jahr: number;
  mitarbeiter: Mitarbeiter[];
  abwesenheiten: Abwesenheit[];
  jahreswerte: Jahreswert[];
  schulungen: Schulung[];
  checkpunkte: Checkpunkt[];
  /** Nur für Personalverantwortliche: App-Benutzer zum Verknüpfen. */
  benutzer: AppBenutzer[];
  sfNutzer: SfNutzer[];
}

export interface LeistungZeile {
  mitarbeiterId: string;
  name: string;
  sfUserId: string;
  aktivitaeten: number;
  termine: number;
  mandateNeu: number;
  abschluesse: number;
  provisionEur: number;
  kaufpreisEur: number;
  zielEur: number | null;
}

export interface LeistungDto {
  jahr: number;
  zeilen: LeistungZeile[];
  /** Mitarbeiter ohne Salesforce-Verknüpfung (erscheinen nicht in der Auswertung). */
  ohneSalesforce: string[];
}

export type PersonalAktion =
  | {
      typ: "mitarbeiter_speichern";
      mitarbeiter: Partial<Mitarbeiter> & { name: string };
    }
  | { typ: "mitarbeiter_loeschen"; id: string }
  | {
      typ: "abwesenheit_speichern";
      abwesenheit: {
        id?: string;
        mitarbeiterId: string;
        art: Abwesenheitsart;
        von: string;
        bis: string;
        halbtag: boolean;
        notiz: string | null;
      };
    }
  | {
      typ: "abwesenheit_entscheiden";
      id: string;
      status: "genehmigt" | "abgelehnt";
    }
  | { typ: "abwesenheit_loeschen"; id: string }
  | {
      typ: "jahreswert_speichern";
      mitarbeiterId: string;
      jahr: number;
      urlaubUebertrag: number;
      provisionszielEur: number | null;
    }
  | {
      typ: "schulung_speichern";
      schulung: Omit<Schulung, "id"> & { id?: string };
    }
  | { typ: "schulung_loeschen"; id: string }
  | {
      typ: "checkliste_starten";
      mitarbeiterId: string;
      checkliste: ChecklistenTyp;
    }
  | {
      typ: "checkpunkt_hinzufuegen";
      mitarbeiterId: string;
      checkliste: ChecklistenTyp;
      punkt: string;
    }
  | { typ: "checkpunkt_umschalten"; id: string; erledigt: boolean }
  | { typ: "checkpunkt_loeschen"; id: string };
