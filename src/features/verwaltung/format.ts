const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const FLAECHE = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATUM = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export const PLATZHALTER = "–";

export function euro(wert: number | null | undefined): string {
  if (wert === null || wert === undefined) return PLATZHALTER;
  return EUR.format(wert);
}

export function flaeche(wert: number | null | undefined): string {
  if (wert === null || wert === undefined) return PLATZHALTER;
  return `${FLAECHE.format(wert)} m²`;
}

export function datum(wert: string | null | undefined): string {
  if (!wert) return PLATZHALTER;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? wert : DATUM.format(d);
}

export function text(wert: string | null | undefined): string {
  return wert?.trim() ? wert : PLATZHALTER;
}

const MONAT = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

/** "YYYY-MM" → "August 2026" */
export function monatLabel(zeitraum: string): string {
  if (!/^\d{4}-\d{2}$/.test(zeitraum)) return zeitraum;
  const d = new Date(`${zeitraum}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return zeitraum;
  const label = MONAT.format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const NUTZUNGSART_LABEL: Record<string, string> = {
  wohnen: "Wohnen",
  gewerbe: "Gewerbe",
  garage: "Garage",
  stellplatz: "Stellplatz",
  sonstiges: "Sonstiges",
};
