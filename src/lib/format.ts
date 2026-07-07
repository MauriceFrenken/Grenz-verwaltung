// Formatierer für de-DE. Zahlen mit Komma-Dezimaltrennung, € als Suffix.
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

const eurFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat("de-DE");

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return eurFormatter.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return numberFormatter.format(value);
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return intFormatter.format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  try {
    return format(parseISO(iso), "dd.MM.yyyy", { locale: de });
  } catch {
    return "–";
  }
}

export function formatMonth(iso: string | null | undefined): string {
  if (!iso) return "–";
  try {
    return format(parseISO(iso + "-01"), "MMMM yyyy", { locale: de });
  } catch {
    return iso;
  }
}

export function formatFlaeche(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined) return "–";
  return `${formatNumber(m2)} m²`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return `${Math.round(value * 100)} %`;
}