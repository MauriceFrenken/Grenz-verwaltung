import type { BoardDaten } from "@/lib/db/typen";

/** Transaktionspipeline aus dem Board-Datenbestand (live: Bens Tabellen). */
export function useCrmDaten(daten: BoardDaten | undefined) {
  return { data: daten?.crm };
}
