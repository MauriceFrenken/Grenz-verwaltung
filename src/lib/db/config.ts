/**
 * Einzige Stelle, an der die Datenquelle des Boards umgeschaltet wird.
 * - VITE_BOARD_DATENQUELLE=mock | live setzt die Quelle ausdrücklich.
 * - Sonst: Demo-Modus (`npm run board`, VITE_BOARD_DEMO=1) und Tests nutzen
 *   Musterdaten, die App nutzt Bens Datenbank.
 */
import { heuteIso } from "@/lib/kalender";
import { LiveRepository } from "./live/repository";
import { MockRepository } from "./mock/repository";
import type { BoardRepository, Datenquelle } from "./repository";

export function konfigurierteDatenquelle(): Datenquelle {
  const env = import.meta.env ?? {};
  const wert = env.VITE_BOARD_DATENQUELLE as string | undefined;
  if (wert === "live" || wert === "mock") return wert;
  if (env.VITE_BOARD_DEMO === "1" || env.MODE === "test") return "mock";
  return "live";
}

let instanz: BoardRepository | null = null;

export function boardRepository(): BoardRepository {
  if (!instanz) {
    instanz =
      konfigurierteDatenquelle() === "live"
        ? new LiveRepository()
        : new MockRepository(heuteIso());
  }
  return instanz;
}

/** Nur für Tests. */
export function repositoryZuruecksetzen(repo: BoardRepository | null = null) {
  instanz = repo;
}
