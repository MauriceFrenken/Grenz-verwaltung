/**
 * Welche Zeilen aus sf_aktivitaeten als stattgefundene Aktivität zählen.
 *
 * - Offene Aufgaben sind Planung (auch vorbereitete Briefe), keine Aktivität.
 * - Jede in Salesforce protokollierte E-Mail existiert doppelt: als EmailMessage und als
 *   Task (TaskSubtype „Email“, verknüpft über ActivityId). Gezählt wird die EmailMessage,
 *   weil Salesforce Tasks nach einem Jahr archiviert und sie dann nicht mehr liefert.
 */

export type AktivitaetZumZaehlen = {
  sfTyp?: string | null;
  art: string | null;
  status?: string | null;
};

export function zaehltAlsAktivitaet(a: AktivitaetZumZaehlen): boolean {
  if (a.sfTyp === "Task") {
    if (a.art === "E-Mail") return false;
    return a.status === "Completed";
  }
  return true;
}
