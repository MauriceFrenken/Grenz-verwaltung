/** Jahresziele von Grenz & Co. (Tabelle unternehmensziele). */

export const ZIEL_KENNZAHLEN = [
  {
    wert: "provision_netto",
    label: "Provision netto",
    einheit: "euro",
    hinweis: "Provisionseingänge auf dem Konto ohne USt",
  },
  {
    wert: "verkaeufe",
    label: "Verkäufe",
    einheit: "anzahl",
    hinweis: "Provisionseingänge auf dem Konto",
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

/**
 * Jahresziele, solange in der Tabelle nichts eingetragen ist.
 * 2026: 500 T€ Provision netto (Vorgabe Maurice, 29.10.2026). Bei Ø 50 T€ netto je Verkauf
 * (2026 bisher: 75 / 49,6 / 22,3 T€) sind das 10 Verkäufe; bei rund jedem dritten Mandat
 * mit Abschluss braucht es dafür 36 neue Mandate (3 je Monat, 2025 waren es 37).
 * 2027: dieselbe Messlatte, bis es eine eigene Planung gibt.
 */
export const STANDARD_ZIELE: Record<number, Record<ZielKennzahl, number>> = {
  2026: { provision_netto: 500_000, verkaeufe: 10, neue_mandate: 36 },
  2027: { provision_netto: 500_000, verkaeufe: 10, neue_mandate: 36 },
};

export type ZielQuelle = "eingetragen" | "mitarbeiter" | "standard";

export type ZieleDto = {
  jahr: number;
  /** false, solange die Migration 20261029100000_unternehmensziele fehlt. */
  tabelle: boolean;
  /** Wirksames Ziel: eingetragen, sonst Summe der Mitarbeiterziele (nur Provision), sonst Standard. */
  ziele: Record<ZielKennzahl, number | null>;
  quelle: Record<ZielKennzahl, ZielQuelle | null>;
  /** Nur die in der Tabelle eingetragenen Werte (für den Pflege-Dialog). */
  eingetragen: Record<ZielKennzahl, number | null>;
  /** Summe der Provisionsziele aus den Personalakten (Ersatz, wenn kein Unternehmensziel gesetzt ist). */
  mitarbeiterProvisionsziel: number | null;
};

/** Eingetragene Werte mit Mitarbeiterzielen und Standardwerten zu wirksamen Zielen verbinden. */
export function wirksameZiele(
  jahr: number,
  eingetragen: Record<ZielKennzahl, number | null>,
  mitarbeiterProvisionsziel: number | null,
): Pick<ZieleDto, "ziele" | "quelle"> {
  const ziele = {} as ZieleDto["ziele"];
  const quelle = {} as ZieleDto["quelle"];
  for (const { wert: k } of ZIEL_KENNZAHLEN) {
    const ma = k === "provision_netto" ? mitarbeiterProvisionsziel : null;
    const std = STANDARD_ZIELE[jahr]?.[k] ?? null;
    if (eingetragen[k] != null) {
      ziele[k] = eingetragen[k];
      quelle[k] = "eingetragen";
    } else if (ma != null) {
      ziele[k] = ma;
      quelle[k] = "mitarbeiter";
    } else if (std != null) {
      ziele[k] = std;
      quelle[k] = "standard";
    } else {
      ziele[k] = null;
      quelle[k] = null;
    }
  }
  return { ziele, quelle };
}

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
