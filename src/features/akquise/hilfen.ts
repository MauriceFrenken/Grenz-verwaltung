/** Hilfen der Akquise-Seiten (Datum, Diagrammgruppen). */

import type { Massnahme } from "@/lib/akquise/typen";
import { formatDate } from "@/lib/format";

export function datum(iso: string | null): string {
  return iso ? formatDate(iso.slice(0, 10)) : "–";
}

/** Fünf Gruppen für Diagramme (Farbpalette hat fünf Töne). */
export const GRUPPEN = [
  { id: "briefe", label: "Anschreiben", massnahmen: ["anschreiben"] },
  { id: "anrufe", label: "Anrufe", massnahmen: ["anruf"] },
  { id: "emails", label: "E-Mails", massnahmen: ["email"] },
  {
    id: "nachfassen",
    label: "Nachfassen & Rückmeldungen",
    massnahmen: ["nachfassen", "proaktiv", "rueckmeldung"],
  },
  {
    id: "termine",
    label: "Termine (Objektaufnahme, Besichtigung)",
    massnahmen: ["akquise_termin", "besichtigung"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  massnahmen: readonly Massnahme[];
}>;

export function gruppiereMonat(
  zeile: Partial<Record<Massnahme, number>>,
): Record<string, number> {
  return Object.fromEntries(
    GRUPPEN.map((g) => [
      g.id,
      g.massnahmen.reduce((s, m) => s + (zeile[m] ?? 0), 0),
    ]),
  );
}
