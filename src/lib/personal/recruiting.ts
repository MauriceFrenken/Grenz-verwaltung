/** Recruiting: Typen und Regeln (Pipeline-Phasen, Löschfristen). Ohne Server-Abhängigkeiten. */

import type { Vertragsart } from "./typen";

export const STELLENSTATUS = {
  entwurf: "Entwurf",
  offen: "Ausgeschrieben",
  pausiert: "Pausiert",
  besetzt: "Besetzt",
  geschlossen: "Geschlossen",
} as const;
export type Stellenstatus = keyof typeof STELLENSTATUS;

/** Phasen der Bewerber-Pipeline in der Reihenfolge des Kanban-Boards. */
export const PHASEN = {
  eingang: "Eingang",
  sichtung: "Sichtung",
  gespraech: "Gespräch",
  angebot: "Angebot",
  eingestellt: "Eingestellt",
  abgesagt: "Abgesagt",
} as const;
export type Phase = keyof typeof PHASEN;
export const PHASEN_REIHE = Object.keys(PHASEN) as Phase[];
/** Mit diesen Phasen ist das Verfahren abgeschlossen; ab dann läuft die Löschfrist. */
export const ABGESCHLOSSEN: Phase[] = ["eingestellt", "abgesagt"];

export const QUELLEN = [
  "StepStone",
  "Indeed",
  "LinkedIn",
  "Website",
  "Empfehlung",
  "Initiativbewerbung",
  "Hochschule",
  "Personalvermittlung",
  "Sonstige",
];

/** Monate nach Abschluss, bis Bewerberdaten gelöscht werden (AGG-Klagefristen plus Puffer). */
export const LOESCHFRIST_MONATE = 6;

export interface Stelle {
  id: string;
  titel: string;
  standort: string | null;
  vertragsart: Vertragsart;
  wochenstunden: number | null;
  startAb: string | null;
  status: Stellenstatus;
  aufgaben: string | null;
  anforderungen: string | null;
  angebot: string | null;
  anzeigeText: string | null;
  kanaele: string | null;
  verantwortlichId: string | null;
  erstelltAm: string;
}

export interface Bewerber {
  id: string;
  stelleId: string | null;
  name: string;
  email: string | null;
  telefon: string | null;
  quelle: string | null;
  phase: Phase;
  reihenfolge: number;
  bewertung: number | null;
  eingegangenAm: string;
  verfuegbarAb: string | null;
  gehaltsvorstellung: string | null;
  unterlagenUrl: string | null;
  naechsterTermin: string | null;
  notizen: string | null;
  absageGrund: string | null;
  abgeschlossenAm: string | null;
  talentpoolBis: string | null;
  mitarbeiterId: string | null;
}

export interface BewerberEreignis {
  id: string;
  bewerberId: string;
  art: "notiz" | "phase" | "termin";
  text: string;
  vonName: string | null;
  am: string;
}

export interface RecruitingDto {
  stellen: Stelle[];
  bewerber: Bewerber[];
  ereignisse: BewerberEreignis[];
}

export interface AnzeigenEntwurf {
  titel: string;
  text: string;
}

export type RecruitingAktion =
  | { typ: "stelle_speichern"; stelle: Partial<Stelle> & { titel: string } }
  | { typ: "stelle_loeschen"; id: string }
  | {
      typ: "bewerber_speichern";
      bewerber: Partial<Bewerber> & { name: string };
    }
  | {
      typ: "bewerber_verschieben";
      id: string;
      phase: Phase;
      /** IDs der Zielspalte in neuer Reihenfolge (inklusive des verschobenen). */
      reihe?: string[];
      absageGrund?: string | null;
    }
  | { typ: "bewerber_notiz"; id: string; text: string }
  | { typ: "bewerber_loeschen"; id: string }
  | { typ: "bewerber_loeschen_faellig" }
  | {
      typ: "bewerber_einstellen";
      id: string;
      eintrittAm: string | null;
      vertragsart: Vertragsart;
      wochenstunden: number | null;
      position: string | null;
    };

function plusMonate(iso: string, monate: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monate);
  const letzter = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return d.toISOString().slice(0, 10);
}

/**
 * Ab wann die Bewerberdaten gelöscht werden müssen: 6 Monate nach Abschluss, bei
 * Einwilligung in den Talentpool zum vereinbarten Datum (wenn später). null = Verfahren läuft.
 */
export function loeschenAb(b: Bewerber): string | null {
  if (!ABGESCHLOSSEN.includes(b.phase) || !b.abgeschlossenAm) return null;
  const frist = plusMonate(b.abgeschlossenAm, LOESCHFRIST_MONATE);
  return b.talentpoolBis && b.talentpoolBis > frist ? b.talentpoolBis : frist;
}

export function loeschfaellig(b: Bewerber, heute: string): boolean {
  const ab = loeschenAb(b);
  return ab !== null && ab <= heute;
}

/** Tage seit Eingang (für die Karten im Board). */
export function tageSeit(iso: string, heute: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${heute}T00:00:00Z`) -
        Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) /
        86_400_000,
    ),
  );
}
