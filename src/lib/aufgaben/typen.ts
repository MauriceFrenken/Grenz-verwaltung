/** Aufgabenboard (Kanban im Trello-Stil) für die in Rücksprachen festgelegten Aufgaben. */

export type Prioritaet = "hoch" | "normal" | "niedrig";

export const PRIORITAETEN: { wert: Prioritaet; label: string }[] = [
  { wert: "hoch", label: "Hoch" },
  { wert: "normal", label: "Normal" },
  { wert: "niedrig", label: "Niedrig" },
];

export type ChecklistenPunkt = { id: string; text: string; erledigt: boolean };

export type Spalte = {
  id: string;
  titel: string;
  position: number;
  /** Karten hier gelten als erledigt. */
  erledigt: boolean;
};

export type Aufgabe = {
  id: string;
  spalteId: string;
  position: number;
  titel: string;
  beschreibung: string;
  verantwortlichId: string | null;
  faelligAm: string | null;
  prioritaet: Prioritaet;
  ruecksprache: string;
  ruecksprachAm: string | null;
  mandatSfId: string | null;
  checkliste: ChecklistenPunkt[];
  erledigtAm: string | null;
  erstelltVon: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Person = { id: string; name: string; initialen: string };
export type MandatKurz = { sfId: string; name: string };

export type Board = {
  spalten: Spalte[];
  aufgaben: Aufgabe[];
  personen: Person[];
  mandate: MandatKurz[];
};

/** Felder, die beim Anlegen und Bearbeiten einer Karte gesetzt werden. */
export type AufgabeFelder = {
  titel: string;
  beschreibung: string;
  verantwortlichId: string | null;
  faelligAm: string | null;
  prioritaet: Prioritaet;
  ruecksprache: string;
  ruecksprachAm: string | null;
  mandatSfId: string | null;
  checkliste: ChecklistenPunkt[];
};

export type Filter = {
  suche: string;
  /** "" = alle, "ohne" = niemand zugewiesen, sonst Profil-ID. */
  person: string;
  /** "" = alle Rücksprachen. */
  ruecksprache: string;
  nurUeberfaellig: boolean;
};

export const FILTER_LEER: Filter = {
  suche: "",
  person: "",
  ruecksprache: "",
  nurUeberfaellig: false,
};
