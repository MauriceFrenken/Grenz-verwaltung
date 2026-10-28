/** Aufgabenboard (Kanban im Trello-Stil) für die in Rücksprachen festgelegten Aufgaben. */

export type Prioritaet = "hoch" | "normal" | "niedrig";

export const PRIORITAETEN: { wert: Prioritaet; label: string }[] = [
  { wert: "hoch", label: "Hoch" },
  { wert: "normal", label: "Normal" },
  { wert: "niedrig", label: "Niedrig" },
];

/** Strategische Themenfelder, nach denen das Board gruppiert und gefiltert wird. */
export const THEMENFELDER = [
  { wert: "strategie", label: "Strategie & Wachstum", kurz: "Strategie" },
  { wert: "akquise", label: "Akquise & Mandate", kurz: "Akquise" },
  {
    wert: "vermarktung",
    label: "Vermarktung & Investoren",
    kurz: "Vermarktung",
  },
  { wert: "marke", label: "Marketing & Marke", kurz: "Marke" },
  { wert: "personal", label: "Personal & Team", kurz: "Personal" },
  {
    wert: "organisation",
    label: "Organisation & Prozesse",
    kurz: "Organisation",
  },
  { wert: "digital", label: "Digitalisierung & App", kurz: "Digital" },
  { wert: "finanzen", label: "Finanzen & Controlling", kurz: "Finanzen" },
] as const;

/** "" = noch keinem Themenfeld zugeordnet. */
export type Themenfeld = (typeof THEMENFELDER)[number]["wert"] | "";

export function themenfeldLabel(t: Themenfeld, kurz = false): string {
  const f = THEMENFELDER.find((x) => x.wert === t);
  if (!f) return "Ohne Themenfeld";
  return kurz ? f.kurz : f.label;
}

export function istThemenfeld(wert: unknown): wert is Themenfeld {
  return wert === "" || THEMENFELDER.some((f) => f.wert === wert);
}

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
  themenfeld: Themenfeld;
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

export type TrelloStatus = {
  verbunden: boolean;
  boardUrl: string | null;
  letzterAbgleich: string | null;
  fehler: string | null;
};

export type Board = {
  spalten: Spalte[];
  aufgaben: Aufgabe[];
  personen: Person[];
  mandate: MandatKurz[];
  trello: TrelloStatus;
  /** false, solange die Migration für Themenfelder fehlt. */
  themenfelder: boolean;
};

/** Felder, die beim Anlegen und Bearbeiten einer Karte gesetzt werden. */
export type AufgabeFelder = {
  titel: string;
  beschreibung: string;
  verantwortlichId: string | null;
  faelligAm: string | null;
  prioritaet: Prioritaet;
  themenfeld: Themenfeld;
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
  /** null = alle, "" = ohne Themenfeld. */
  themenfeld: Themenfeld | null;
  nurUeberfaellig: boolean;
};

export const FILTER_LEER: Filter = {
  suche: "",
  person: "",
  ruecksprache: "",
  themenfeld: null,
  nurUeberfaellig: false,
};
