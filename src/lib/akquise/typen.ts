/**
 * Akquise (Verkäuferseite): Rohdaten aus Salesforce und die ausgewerteten Sichten
 * für Verkäufer-Potenzial, Anschreiben, Aktivitäten, Wiedervorlagen und Maßnahmen.
 */

/** Art einer Aktivität, aus Betreff und Aufgabentyp abgeleitet (siehe klassifizieren.ts). */
export type Massnahme =
  | "anschreiben"
  | "kein_anschreiben"
  | "retoure"
  | "rueckmeldung"
  | "anruf"
  | "email"
  | "nachfassen"
  | "proaktiv"
  | "akquise_termin"
  | "besichtigung"
  | "sonstiges";

export type Bereich = "akquise" | "vermarktung" | "allgemein";

/** Person hinter einer Aktivität (Salesforce Who: Lead oder Kontakt). */
export type RohPerson = {
  id: string;
  typ: "Lead" | "Contact";
  name: string | null;
  firma: string | null;
  ort: string | null;
  strasse: string | null;
  accountId: string | null;
  leadStatus: string | null;
  leadQuelle: string | null;
  absagegrund: string | null;
  bewertung: string | null;
  nichtKontaktieren: boolean;
  konvertiert: boolean;
};

export type RohAufgabe = {
  id: string;
  typ: "Task" | "Event";
  betreff: string;
  subtyp: string | null;
  status: string | null;
  faelligAm: string | null;
  erledigtAm: string | null;
  erstelltAm: string;
  bearbeiter: string | null;
  wer: RohPerson | null;
  worauf: { typ: string; id: string; name: string | null } | null;
};

export type RohMandat = {
  id: string;
  name: string;
  phase: string | null;
  verlustgrund: string | null;
  erstelltAm: string;
  geaendertAm: string;
  eigentuemer: string | null;
  accountId: string | null;
  ansprechpartner: string | null;
  objekt: string | null;
};

export type RohKauf = {
  id: string;
  name: string;
  abschlussAm: string | null;
  kaufpreis: number | null;
  kaeufer: string | null;
  accountId: string | null;
  objekt: string | null;
};

export type Rohdaten = {
  aufgaben: RohAufgabe[];
  mandate: RohMandat[];
  kaeufe: RohKauf[];
  /** Recherche-Pool der Eigentümer-Leads (Uploads) nach Status. */
  leadPool: Array<{ status: string; anzahl: number }>;
};

export type Ergebnis =
  | "mandat"
  | "interesse"
  | "kontakt"
  | "absage"
  | "erstkontakt"
  | "aussortiert"
  | "miteigentuemer"
  | "retoure"
  | "keine";

export type SfVerweis = { id: string; typ: string };

export type PotenzialSignal = { text: string; punkte: number };

export type PotenzialEintrag = {
  schluessel: string;
  name: string;
  firma: string | null;
  ort: string | null;
  quelle: "Eigentümer-Lead" | "Kontakt" | "Mandat" | "Käufer";
  score: number;
  signale: PotenzialSignal[];
  letzteAktivitaetAm: string | null;
  naechsterSchritt: string;
  sf: SfVerweis;
};

export type KohortenZeile = {
  monat: string;
  angeschrieben: number;
  reaktion: number;
  interesse: number;
  absage: number;
};

export type NachfassEintrag = {
  lead: SfVerweis;
  name: string;
  firma: string | null;
  ort: string | null;
  strasse: string | null;
  letzterBriefAm: string;
  anzahlBriefe: number;
  quelle: string | null;
};

export type Wiedervorlage = {
  id: string;
  betreff: string;
  massnahme: Massnahme;
  faelligAm: string | null;
  ueberfaelligTage: number | null;
  bearbeiter: string | null;
  wer: string | null;
  firma: string | null;
  sf: SfVerweis | null;
};

export type AktivitaetZeile = {
  id: string;
  datum: string;
  massnahme: Massnahme;
  bereich: Bereich;
  betreff: string;
  wer: string | null;
  bearbeiter: string | null;
};

/** Kompakte Aktivität: Tag, Maßnahme, Bereich, Person. */
export type VerlaufEintrag = { d: string; m: Massnahme; b: Bereich; p: string };

export type AktivitaetenFilter = {
  /** Anzahl Monate bis einschließlich des laufenden Monats. */
  monate: number;
  person: string | null;
  bereich: Bereich | null;
};

export type AktivitaetenSicht = {
  jeMonat: Array<{ monat: string } & Partial<Record<Massnahme, number>>>;
  summen: Array<{
    massnahme: Massnahme;
    zeitraum: number;
    vorzeitraum: number;
  }>;
  jePerson: Array<
    { person: string; gesamt: number } & Partial<Record<Massnahme, number>>
  >;
  jeBereich: Array<{ bereich: Bereich; anzahl: number }>;
  personen: string[];
};

export type AkquiseDto = {
  stand: string;
  anschreiben: {
    /** Erledigte „Send Letter“-Aufgaben gelten als versendet. */
    versendet12m: number;
    versendet: number;
    /** Offene „Send Letter“-Aufgaben: vorbereitet, nicht als versendet markiert. */
    offen: number;
    leadsAngeschrieben: number;
    leadsNurVorbereitet: number;
    reaktionsquote: number | null;
    interessequote: number | null;
    nachfassquote: number | null;
    mehrfachAngeschrieben: number;
    bewusstNichtAngeschrieben: number;
    retouren: number;
    ergebnisse: Array<{ ergebnis: Ergebnis; anzahl: number }>;
    absagegruende: Array<{ grund: string; anzahl: number }>;
    kohorten: KohortenZeile[];
    nachQuelle: Array<{
      quelle: string;
      angeschrieben: number;
      reaktion: number;
    }>;
    nachOrt: Array<{ ort: string; angeschrieben: number; reaktion: number }>;
    briefeJeMonat: Array<{ monat: string; versendet: number; offen: number }>;
  };
  aktivitaeten: {
    /** Alle stattgefundenen Aktivitäten, kompakt, zum Filtern im Browser. */
    verlauf: VerlaufEintrag[];
    letzte: AktivitaetZeile[];
  };
  wiedervorlagen: {
    gesamt: number;
    ueberfaellig: number;
    liste: Wiedervorlage[];
  };
  nachfassen: { gesamt: number; liste: NachfassEintrag[] };
  potenzial: PotenzialEintrag[];
  pool: Array<{ status: string; label: string; anzahl: number }>;
  mandate: {
    akquisition: number;
    einwertung: number;
    beauftragt12m: number;
    verloren: number;
  };
  kaeuferBestand: number;
};
