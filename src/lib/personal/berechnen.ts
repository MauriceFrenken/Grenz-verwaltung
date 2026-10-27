/**
 * Reine Rechenfunktionen des Personalbereichs: Feiertage NRW, Arbeitstage,
 * Urlaubskonto, Status der Pflichtschulungen und Standard-Checklisten.
 */

import type {
  Abwesenheit,
  ChecklistenTyp,
  Jahreswert,
  Mitarbeiter,
  Schulung,
} from "./typen";

/** ISO-Datum (YYYY-MM-DD) in UTC, damit Zeitzonen beim Zählen keine Rolle spielen. */
function tag(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plusTage(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Ostersonntag nach der Gaußschen Osterformel (gregorianisch). */
export function ostersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tagImMonat = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tagImMonat));
}

const feiertagCache = new Map<number, Map<string, string>>();

/** Gesetzliche Feiertage in Nordrhein-Westfalen (Sitz Düsseldorf). */
export function feiertageNrw(jahr: number): Map<string, string> {
  const vorhanden = feiertagCache.get(jahr);
  if (vorhanden) return vorhanden;
  const ostern = ostersonntag(jahr);
  const f = new Map<string, string>([
    [`${jahr}-01-01`, "Neujahr"],
    [iso(plusTage(ostern, -2)), "Karfreitag"],
    [iso(plusTage(ostern, 1)), "Ostermontag"],
    [`${jahr}-05-01`, "Tag der Arbeit"],
    [iso(plusTage(ostern, 39)), "Christi Himmelfahrt"],
    [iso(plusTage(ostern, 50)), "Pfingstmontag"],
    [iso(plusTage(ostern, 60)), "Fronleichnam"],
    [`${jahr}-10-03`, "Tag der Deutschen Einheit"],
    [`${jahr}-11-01`, "Allerheiligen"],
    [`${jahr}-12-25`, "1. Weihnachtstag"],
    [`${jahr}-12-26`, "2. Weihnachtstag"],
  ]);
  feiertagCache.set(jahr, f);
  return f;
}

export function feiertag(isoDatum: string): string | null {
  return (
    feiertageNrw(Number(isoDatum.slice(0, 4))).get(isoDatum.slice(0, 10)) ??
    null
  );
}

export function istWochenende(isoDatum: string): boolean {
  const w = tag(isoDatum).getUTCDay();
  return w === 0 || w === 6;
}

export function istArbeitstag(isoDatum: string): boolean {
  return !istWochenende(isoDatum) && feiertag(isoDatum) === null;
}

/**
 * Arbeitstage (Mo–Fr ohne Feiertage NRW) zwischen von und bis, beide einschließlich,
 * optional auf einen Zeitraum begrenzt. Ein Halbtag zählt 0,5.
 */
export function arbeitstage(
  von: string,
  bis: string,
  halbtag = false,
  grenze?: { von: string; bis: string },
): number {
  const start = grenze && grenze.von > von ? grenze.von : von;
  const ende = grenze && grenze.bis < bis ? grenze.bis : bis;
  if (ende < start) return 0;
  let n = 0;
  for (let d = tag(start); iso(d) <= ende; d = plusTage(d, 1)) {
    if (istArbeitstag(iso(d))) n++;
  }
  return halbtag ? n * 0.5 : n;
}

/** Tage von von bis bis einschließlich als ISO-Liste. */
export function tageZwischen(von: string, bis: string): string[] {
  const liste: string[] = [];
  for (let d = tag(von); iso(d) <= bis; d = plusTage(d, 1)) liste.push(iso(d));
  return liste;
}

/**
 * Urlaubsanspruch im Jahr. Im Ein- und Austrittsjahr anteilig ein Zwölftel je vollem
 * Beschäftigungsmonat (§5 BUrlG), auf halbe Tage aufgerundet.
 */
export function urlaubsanspruch(m: Mitarbeiter, jahr: number): number {
  const voll = m.urlaubstageJahr ?? 0;
  const start =
    m.eintrittAm && m.eintrittAm > `${jahr}-01-01`
      ? m.eintrittAm
      : `${jahr}-01-01`;
  const ende =
    m.austrittAm && m.austrittAm < `${jahr}-12-31`
      ? m.austrittAm
      : `${jahr}-12-31`;
  if (start === `${jahr}-01-01` && ende === `${jahr}-12-31`) return voll;
  if (ende < start) return 0;
  let monate = 0;
  for (let mon = 1; mon <= 12; mon++) {
    const erster = `${jahr}-${String(mon).padStart(2, "0")}-01`;
    const letzter = iso(new Date(Date.UTC(jahr, mon, 0)));
    if (start <= erster && ende >= letzter) monate++;
  }
  return Math.ceil(((voll * monate) / 12) * 2) / 2;
}

export interface Urlaubskonto {
  anspruch: number;
  uebertrag: number;
  genehmigt: number;
  beantragt: number;
  rest: number;
}

export function urlaubskonto(
  m: Mitarbeiter,
  abwesenheiten: Abwesenheit[],
  jahreswerte: Jahreswert[],
  jahr: number,
): Urlaubskonto {
  const grenze = { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
  let genehmigt = 0;
  let beantragt = 0;
  for (const a of abwesenheiten) {
    if (a.mitarbeiterId !== m.id || a.art !== "urlaub") continue;
    const t = arbeitstage(a.von, a.bis, a.halbtag, grenze);
    if (a.status === "genehmigt") genehmigt += t;
    else if (a.status === "beantragt") beantragt += t;
  }
  const anspruch = urlaubsanspruch(m, jahr);
  const uebertrag =
    jahreswerte.find((j) => j.mitarbeiterId === m.id && j.jahr === jahr)
      ?.urlaubUebertrag ?? 0;
  return {
    anspruch,
    uebertrag,
    genehmigt,
    beantragt,
    rest: anspruch + uebertrag - genehmigt,
  };
}

/** Abwesenheit eines Mitarbeiters an einem Tag (abgelehnte zählen nicht). */
export function abwesenheitAm(
  mitarbeiterId: string,
  isoDatum: string,
  abwesenheiten: Abwesenheit[],
): Abwesenheit | null {
  return (
    abwesenheiten.find(
      (a) =>
        a.mitarbeiterId === mitarbeiterId &&
        a.status !== "abgelehnt" &&
        a.von <= isoDatum &&
        a.bis >= isoDatum,
    ) ?? null
  );
}

// ------------------------------------------------------------ Pflichtschulungen

export const SOLL_STUNDEN_34C = 20;

/** Dreijahreszeitraum der Weiterbildungspflicht (§15b MaBV, erster Zeitraum ab 2018). */
export function zeitraum34c(heute: string): { von: string; bis: string } {
  const jahr = Number(heute.slice(0, 4));
  const start = 2018 + Math.floor((jahr - 2018) / 3) * 3;
  return { von: `${start}-01-01`, bis: `${start + 2}-12-31` };
}

export type Ampel = "ok" | "offen" | "kritisch" | "entfaellt";

export interface Schulungsstatus {
  zeitraum: { von: string; bis: string };
  stunden34c: number;
  ampel34c: Ampel;
  letzteGwg: string | null;
  ampelGwg: Ampel;
  letzteDatenschutz: string | null;
  ampelDatenschutz: Ampel;
}

function monateBis(heute: string, ziel: string): number {
  const a = tag(heute);
  const b = tag(ziel);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
}

/** Datum ein Jahr vor heute. */
function vorEinemJahr(heute: string): string {
  return `${Number(heute.slice(0, 4)) - 1}${heute.slice(4, 10)}`;
}

/**
 * Weiterbildung §34c: 20 Stunden je Zeitraum; kritisch, wenn weniger als sechs Monate
 * bleiben. GwG-Unterweisung (§6 Abs. 2 Nr. 6 GwG) und Datenschutz: jährlich als Praxis.
 */
export function schulungsstatus(
  m: Mitarbeiter,
  schulungen: Schulung[],
  heute: string,
): Schulungsstatus {
  const zeitraum = zeitraum34c(heute);
  const eigene = schulungen.filter((s) => s.mitarbeiterId === m.id);
  const stunden34c = eigene
    .filter(
      (s) =>
        s.art === "weiterbildung_34c" &&
        s.datum >= zeitraum.von &&
        s.datum <= zeitraum.bis,
    )
    .reduce((s, x) => s + (x.stunden ?? 0), 0);
  const ampel34c: Ampel = !m.weiterbildungspflichtig
    ? "entfaellt"
    : stunden34c >= SOLL_STUNDEN_34C
      ? "ok"
      : monateBis(heute, zeitraum.bis) < 6
        ? "kritisch"
        : "offen";
  const letzte = (art: Schulung["art"]) =>
    eigene
      .filter((s) => s.art === art && s.datum <= heute)
      .map((s) => s.datum)
      .sort()
      .at(-1) ?? null;
  const jaehrlich = (d: string | null): Ampel =>
    d === null ? "kritisch" : d >= vorEinemJahr(heute) ? "ok" : "offen";
  const letzteGwg = letzte("gwg");
  const letzteDatenschutz = letzte("datenschutz");
  return {
    zeitraum,
    stunden34c,
    ampel34c,
    letzteGwg,
    ampelGwg: jaehrlich(letzteGwg),
    letzteDatenschutz,
    ampelDatenschutz: jaehrlich(letzteDatenschutz),
  };
}

// ------------------------------------------------------------ Checklisten

export const STANDARD_CHECKLISTEN: Record<ChecklistenTyp, string[]> = {
  onboarding: [
    "Arbeitsvertrag unterschrieben, Personalfragebogen an die Lohnbuchhaltung (Steuer-ID, SV-Nummer, Bankverbindung)",
    "Verpflichtung auf Vertraulichkeit und Datenschutz unterschrieben",
    "GwG-Unterweisung durchgeführt und hier als Schulung erfasst",
    "Microsoft-365-Konto, Postfach und E-Mail-Signatur eingerichtet",
    "Salesforce-Zugang angelegt und in der Akte verknüpft",
    "Zur Grenz & Co. App eingeladen",
    "Laptop, Telefon und Schlüssel ausgegeben",
    "Visitenkarten bestellt, Teamseite der Website ergänzt",
    "Einarbeitungsplan und Ansprechpartner festgelegt",
    "Gespräch zum Ende der Probezeit terminiert",
  ],
  offboarding: [
    "Kündigung oder Aufhebungsvertrag schriftlich, Austrittsdatum an die Lohnbuchhaltung",
    "Resturlaub geklärt (gewähren oder abgelten)",
    "Mandate, Leads und offene Aufgaben in Salesforce übergeben (Owner umstellen)",
    "Microsoft-365-Konto gesperrt, Postfach weitergeleitet",
    "Salesforce- und App-Zugang deaktiviert",
    "Laptop, Telefon und Schlüssel zurückerhalten",
    "Teamseite der Website und Signaturen angepasst",
    "Arbeitszeugnis erstellt",
    "Weiterbildungsnachweise archiviert (Aufbewahrung 5 Jahre, §15b MaBV)",
  ],
};
