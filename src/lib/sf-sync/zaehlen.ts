/**
 * Welche Zeilen aus sf_aktivitaeten als stattgefundene Aktivität zählen.
 *
 * - Offene Aufgaben sind Planung (auch vorbereitete Briefe), keine Aktivität.
 * - Eine in Salesforce protokollierte E-Mail steht oft doppelt im Cache: als Task
 *   (TaskSubtype „Email“, Betreff „E-Mail: …“) und als EmailMessage. Gezählt wird der
 *   Task; die EmailMessage nur, wenn es keinen passenden Task gibt (Salesforce archiviert
 *   Tasks nach einem Jahr, dann bleibt nur die EmailMessage).
 */

export type AktivitaetZumZaehlen = {
  sfTyp?: string | null;
  art: string | null;
  status?: string | null;
  betreff?: string | null;
  datum?: string | null;
};

/** Offene Aufgabe = Planung, keine stattgefundene Aktivität. */
export function istGeplant(a: AktivitaetZumZaehlen): boolean {
  return a.sfTyp === "Task" && a.status != null && a.status !== "Completed";
}

function emailBetreff(a: AktivitaetZumZaehlen): string {
  return (a.betreff ?? "")
    .replace(/^\s*e-?mail\s*:\s*/i, "")
    .trim()
    .toLowerCase();
}

function tagPlus(iso: string, n: number): string {
  const t = Date.parse(iso.slice(0, 10));
  return Number.isNaN(t)
    ? ""
    : new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** Stattgefundene Aktivitäten ohne Planung und ohne doppelte E-Mails. */
export function stattgefunden<T extends AktivitaetZumZaehlen>(liste: T[]): T[] {
  const erledigt = liste.filter((a) => !istGeplant(a));
  const emailTasks = new Set(
    erledigt
      .filter((a) => a.sfTyp === "Task" && a.art === "E-Mail")
      .map((a) => `${(a.datum ?? "").slice(0, 10)}|${emailBetreff(a)}`),
  );
  // Task-Datum (Fälligkeit 12:00 UTC) und Sendezeit können um einen Tag auseinanderliegen.
  const hatTask = (a: AktivitaetZumZaehlen) =>
    [-1, 0, 1].some((n) =>
      emailTasks.has(`${tagPlus(a.datum ?? "", n)}|${emailBetreff(a)}`),
    );
  return erledigt.filter((a) => a.sfTyp !== "EmailMessage" || !hatTask(a));
}

/** Wie `stattgefunden`, für Zeilen mit Spaltennamen aus sf_aktivitaeten (sf_typ). */
export function stattgefundenZeilen<
  T extends {
    sf_typ?: string | null;
    art: string | null;
    status?: string | null;
    betreff?: string | null;
    datum?: string | null;
  },
>(liste: T[]): T[] {
  const mitTyp = liste.map((zeile) => ({
    ...zeile,
    sfTyp: zeile.sf_typ,
    zeile,
  }));
  return stattgefunden(mitTyp).map((x) => x.zeile);
}
