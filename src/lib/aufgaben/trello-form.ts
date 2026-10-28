/**
 * Gemeinsame Form einer Karte bzw. Spalte für den Trello-Abgleich und die Entscheidung, welche
 * Seite gewinnt. Rein, ohne Netz und Datenbank, damit testbar.
 *
 * Abgeglichen werden Titel, Beschreibung, Fälligkeit, Spalte, Reihenfolge, Verantwortlicher
 * (über den Namen des Trello-Mitglieds), Priorität und Rücksprache (als Labels) und die Checkliste.
 * Rücksprachedatum und Mandat gibt es nur in der App.
 */

/** Trello verlangt positive Positionen, die App beginnt bei 1000 und darf negativ werden. */
export const POS_VERSATZ = 1_000_000;

export const LABEL_PRIO_HOCH = "Priorität hoch";
export const LABEL_PRIO_NIEDRIG = "Priorität niedrig";
export const LABEL_RS_PRAEFIX = "Rücksprache: ";

export type KartenForm = {
  titel: string;
  beschreibung: string;
  faellig: string | null;
  liste: string;
  pos: number;
  mitglied: string | null;
  prio: "hoch" | "normal" | "niedrig";
  rs: string;
  check: [string, boolean][];
};

export type ListenForm = { name: string; pos: number };

export function titelNorm(t: string): string {
  return t.trim().slice(0, 300);
}

export function textNorm(t: string): string {
  return t.replace(/\r\n/g, "\n").trim().slice(0, 10_000);
}

export function checkNorm(
  punkte: { text: string; erledigt: boolean }[],
): [string, boolean][] {
  return punkte
    .map((p): [string, boolean] => [p.text.trim().slice(0, 300), p.erledigt])
    .filter(([t]) => t.length > 0)
    .slice(0, 50);
}

export function posNachTrello(position: number): number {
  return Math.max(1, Math.round(position + POS_VERSATZ));
}

export function posAusTrello(pos: number): number {
  return pos - POS_VERSATZ;
}

/** Trello-Fälligkeit (UTC-Zeitpunkt) als Kalendertag in Berlin. */
export function datumAusTrello(due: string | null | undefined): string | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Kalendertag als Trello-Fälligkeit: 10:00 UTC liegt in Berlin immer am selben Tag. */
export function datumNachTrello(datum: string | null): string | null {
  return datum ? `${datum}T10:00:00.000Z` : null;
}

export function prioAusLabels(namen: string[]): KartenForm["prio"] {
  if (namen.includes(LABEL_PRIO_HOCH)) return "hoch";
  if (namen.includes(LABEL_PRIO_NIEDRIG)) return "niedrig";
  return "normal";
}

export function rsAusLabels(namen: string[]): string {
  const n = namen.find((x) => x.startsWith(LABEL_RS_PRAEFIX));
  return n ? n.slice(LABEL_RS_PRAEFIX.length).trim().slice(0, 200) : "";
}

/** Labels, die der Abgleich verwaltet; alle anderen Labels einer Karte bleiben unberührt. */
export function istVerwaltetesLabel(name: string): boolean {
  return (
    name === LABEL_PRIO_HOCH ||
    name === LABEL_PRIO_NIEDRIG ||
    name.startsWith(LABEL_RS_PRAEFIX)
  );
}

export function gewuenschteLabels(
  form: Pick<KartenForm, "prio" | "rs">,
): string[] {
  const namen: string[] = [];
  if (form.prio === "hoch") namen.push(LABEL_PRIO_HOCH);
  if (form.prio === "niedrig") namen.push(LABEL_PRIO_NIEDRIG);
  if (form.rs) namen.push(`${LABEL_RS_PRAEFIX}${form.rs}`);
  return namen;
}

/** Stabile Zeichenkette als Abgleichstand (kurz genug für die Datenbank). */
export function formHash(form: KartenForm | ListenForm): string {
  const s = JSON.stringify(form);
  // FNV-1a, zweimal mit unterschiedlichem Startwert: 16 Hex-Zeichen, kein node:crypto nötig.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export type Richtung = "gleich" | "nach_trello" | "aus_trello";

/**
 * Drei-Wege-Vergleich gegen den zuletzt abgeglichenen Stand. Ohne gespeicherten Stand
 * (erster Abgleich) oder wenn beide Seiten geändert wurden, gewinnt die jüngere Änderung.
 */
export function richtung(
  appHash: string,
  trelloHash: string,
  gespeichert: string | null,
  appGeaendert: string,
  trelloGeaendert: string,
): Richtung {
  if (appHash === trelloHash) return "gleich";
  if (gespeichert === appHash) return "aus_trello";
  if (gespeichert === trelloHash) return "nach_trello";
  return Date.parse(trelloGeaendert) > Date.parse(appGeaendert)
    ? "aus_trello"
    : "nach_trello";
}
