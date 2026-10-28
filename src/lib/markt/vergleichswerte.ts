/** Zitierfähige Werte großer Häuser aus der Marktbericht-Bibliothek für Kennzahlen › Markt. */

import type { MarktberichtDokument } from "@/lib/marktbericht/quellen";
import { regionsRang } from "@/lib/marktbericht/quellen";
import type { Benchmark } from "@/lib/marktbericht/typen";

/** Ältere Berichte zitiert man im Gespräch nicht mehr. */
const HOECHSTALTER_TAGE = 548;
export const MAX_VERGLEICHSWERTE = 20;

/**
 * Je Quelle der jüngste ausgelesene Bericht der letzten 18 Monate, davon nur geprüfte Werte,
 * Rheinland vor Deutschland, dann nach Relevanz.
 */
export function neuesteVergleichswerte(
  dokumente: MarktberichtDokument[],
  quellenNamen: Map<string, string>,
  heute: string,
): Benchmark[] {
  const ab = new Date(`${heute}T00:00:00Z`);
  ab.setUTCDate(ab.getUTCDate() - HOECHSTALTER_TAGE);
  const grenze = ab.toISOString().slice(0, 10);
  const juengster = new Map<string, MarktberichtDokument>();
  for (const d of dokumente) {
    if (d.status !== "ausgelesen" || !d.stichtag || d.stichtag < grenze)
      continue;
    const j = juengster.get(d.quelleId);
    if (!j || d.stichtag > j.stichtag!) juengster.set(d.quelleId, d);
  }
  const gesehen = new Set<string>();
  const werte: Benchmark[] = [];
  for (const d of juengster.values()) {
    for (const b of d.kennzahlen) {
      if (!b.geprueft) continue;
      const schluessel = `${b.kennzahl}|${b.region}|${b.wert}`.toLowerCase();
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      werte.push({
        ...b,
        quelle: b.quelle || quellenNamen.get(d.quelleId) || d.titel,
        url: b.url ?? d.url,
        dokumentId: d.id,
      });
    }
  }
  return werte
    .sort(
      (a, b) =>
        regionsRang(a.region) - regionsRang(b.region) ||
        (b.relevanz ?? 50) - (a.relevanz ?? 50) ||
        b.stichtag.localeCompare(a.stichtag),
    )
    .slice(0, MAX_VERGLEICHSWERTE);
}
