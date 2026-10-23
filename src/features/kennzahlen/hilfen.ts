/** Formatierung und Farben der Kennzahlen-Reiter. */

/** Kategorienfarben in fester Reihenfolge (geprüft auf Farbsehschwäche). */
export const VIZ = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
] as const;

export const MONAT_KURZ = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

/** „2026-03“ → „Mär 26“ (mit Jahr) oder „Mär“. */
export function monatLabel(monat: string, mitJahr = false): string {
  const name = MONAT_KURZ[Number(monat.slice(5, 7)) - 1] ?? monat;
  return mitJahr ? `${name} ${monat.slice(2, 4)}` : name;
}

export function euroKurz(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio €`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)} T€`;
  return `${Math.round(n)} €`;
}

export function prozent(n: number | null, stellen = 0): string {
  if (n === null || Number.isNaN(n)) return "–";
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: stellen, minimumFractionDigits: stellen })} %`;
}

export const zelle = "whitespace-nowrap px-2 py-2";
export const zelleRechts =
  "whitespace-nowrap px-2 py-2 text-right tabular-nums";

/** Zahl mit höchstens einer Nachkommastelle, z. B. „19“ oder „8,9“. */
export function zahl1(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}
