/** Jahresziele von Grenz & Co. (Tabelle unternehmensziele). */

export const ZIEL_KENNZAHLEN = [
  {
    wert: "provision_netto",
    label: "Provision netto",
    einheit: "euro",
    hinweis: "Bezahlte Provision ohne USt",
  },
  {
    wert: "verkaeufe",
    label: "Verkäufe",
    einheit: "anzahl",
    hinweis: "Verkäufe mit bezahlter Rechnung",
  },
  {
    wert: "neue_mandate",
    label: "Neue Mandate",
    einheit: "anzahl",
    hinweis: "In Salesforce neu angelegte Mandate",
  },
] as const;

export type ZielKennzahl = (typeof ZIEL_KENNZAHLEN)[number]["wert"];

export function istZielKennzahl(wert: unknown): wert is ZielKennzahl {
  return ZIEL_KENNZAHLEN.some((k) => k.wert === wert);
}

export type ZieleDto = {
  jahr: number;
  /** false, solange die Migration 20261029100000_unternehmensziele fehlt. */
  tabelle: boolean;
  ziele: Record<ZielKennzahl, number | null>;
  /** Summe der Provisionsziele aus den Personalakten (Ersatz, wenn kein Unternehmensziel gesetzt ist). */
  mitarbeiterProvisionsziel: number | null;
};

/** Fortschritt 0–1 (gekappt bei 1), null ohne Ziel. */
export function zielerreichung(
  ist: number,
  ziel: number | null,
): number | null {
  if (!ziel || ziel <= 0) return null;
  return Math.min(1, Math.max(0, ist / ziel));
}

/** Anteil des Jahres, der bis `heute` (ISO) vergangen ist, 0–1. */
export function jahresanteil(heute: string): number {
  const jahr = Number(heute.slice(0, 4));
  const start = Date.UTC(jahr, 0, 1);
  const ende = Date.UTC(jahr + 1, 0, 1);
  const t = Date.parse(heute.slice(0, 10));
  return Math.min(1, Math.max(0, (t - start + 86_400_000) / (ende - start)));
}
