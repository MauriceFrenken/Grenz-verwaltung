/** Reine Hilfen des Aufgabenboards: Sortierung, Einfügeposition, Fälligkeit, Filter. */

import type { Aufgabe, ChecklistenPunkt, Filter, Spalte } from "./typen";

const ABSTAND = 1000;

export function nachPosition<T extends { position: number }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => a.position - b.position);
}

/**
 * Position für ein Element, das in eine sortierte Liste an Index `index` eingefügt wird
 * (ohne das Element selbst). Mittelwert der Nachbarn, damit nur eine Zeile geändert wird.
 */
export function positionZwischen(
  sortiert: { position: number }[],
  index: number,
): number {
  const vor = sortiert[index - 1]?.position;
  const nach = sortiert[index]?.position;
  if (vor === undefined && nach === undefined) return ABSTAND;
  if (vor === undefined) return (nach as number) - ABSTAND;
  if (nach === undefined) return vor + ABSTAND;
  return (vor + nach) / 2;
}

/** Tage bis zur Fälligkeit (negativ = überfällig), bezogen auf das Datum `heute` (YYYY-MM-DD). */
export function tageBisFaellig(faelligAm: string, heute: string): number {
  const t = (s: string) =>
    Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(faelligAm) - t(heute)) / 86_400_000);
}

export type FaelligStand = "ueberfaellig" | "heute" | "bald" | "spaeter" | null;

export function faelligStand(
  a: Pick<Aufgabe, "faelligAm">,
  spalte: Pick<Spalte, "erledigt"> | undefined,
  heute: string,
): FaelligStand {
  if (!a.faelligAm || spalte?.erledigt) return null;
  const tage = tageBisFaellig(a.faelligAm, heute);
  if (tage < 0) return "ueberfaellig";
  if (tage === 0) return "heute";
  if (tage <= 3) return "bald";
  return "spaeter";
}

export function heuteIso(jetzt = new Date()): string {
  const d = new Date(jetzt.getTime() - jetzt.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 10);
}

export function checklistenStand(punkte: ChecklistenPunkt[]): {
  erledigt: number;
  gesamt: number;
} {
  return {
    erledigt: punkte.filter((p) => p.erledigt).length,
    gesamt: punkte.length,
  };
}

export function passtZuFilter(
  a: Aufgabe,
  spalte: Spalte | undefined,
  f: Filter,
  heute: string,
): boolean {
  if (
    f.person === "ohne"
      ? a.verantwortlichId !== null
      : f.person && a.verantwortlichId !== f.person
  ) {
    return false;
  }
  if (f.ruecksprache && a.ruecksprache !== f.ruecksprache) return false;
  if (f.nurUeberfaellig && faelligStand(a, spalte, heute) !== "ueberfaellig")
    return false;
  const q = f.suche.trim().toLowerCase();
  if (
    q &&
    !`${a.titel}\n${a.beschreibung}\n${a.ruecksprache}`
      .toLowerCase()
      .includes(q)
  ) {
    return false;
  }
  return true;
}

/** Rücksprachen für den Filter, neueste zuerst. */
export function ruecksprachen(aufgaben: Aufgabe[]): string[] {
  const neueste = new Map<string, string>();
  for (const a of aufgaben) {
    if (!a.ruecksprache) continue;
    const datum = a.ruecksprachAm ?? a.createdAt;
    const bisher = neueste.get(a.ruecksprache);
    if (!bisher || datum > bisher) neueste.set(a.ruecksprache, datum);
  }
  return [...neueste.entries()]
    .sort((x, y) => y[1].localeCompare(x[1]))
    .map(([r]) => r);
}

/** Zeilen einer Rücksprache-Notiz in Aufgabentitel: eine Aufgabe je Zeile, Aufzählungszeichen weg. */
export function aufgabenAusNotiz(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((z) =>
      z.replace(/^\s*(?:[-*•–]|\d+[.)]|\[\s?[xX]?\s?\])\s*/, "").trim(),
    )
    .filter((z) => z.length > 0)
    .map((z) => z.slice(0, 300));
}
