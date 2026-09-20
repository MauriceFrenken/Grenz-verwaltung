/** Query-Keys für Microsoft-Graph-/Postfach-Listen (Client-Cache). */
export const graphKeys = {
  all: ["graph"] as const,
  ablage: (userId: string, itemId: string | null) =>
    [...graphKeys.all, "ablage", userId, itemId ?? "root"] as const,
  dokumentPosteingang: (userId: string) =>
    [...graphKeys.all, "dokument-posteingang", userId] as const,
  exposePostfach: (userId: string) =>
    [...graphKeys.all, "expose-postfach", userId] as const,
  rechnungsfreigabe: (userId: string) =>
    [...graphKeys.all, "rechnungsfreigabe", userId] as const,
};

/** Solange frisch: Navigation zeigt Cache, kein Netzwerklauf. */
export const GRAPH_STALE_MS = 45_000;
/** Cache bleibt nach Verlassen der Seite im Speicher. */
export const GRAPH_GC_MS = 30 * 60_000;
