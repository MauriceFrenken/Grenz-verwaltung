/**
 * Einzige Stelle, an der die Datenquelle des Boards umgeschaltet wird.
 * VITE_BOARD_DATENQUELLE=mock (Standard) | live
 */
import { heuteIso } from "@/lib/kalender";
import { LiveRepository } from "./live/repository";
import { MockRepository } from "./mock/repository";
import type { BoardRepository, Datenquelle } from "./repository";

export function konfigurierteDatenquelle(): Datenquelle {
  const wert =
    (import.meta.env?.VITE_BOARD_DATENQUELLE as string | undefined) ?? "mock";
  return wert === "live" ? "live" : "mock";
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
