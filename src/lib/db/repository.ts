/**
 * Repository-Schicht des Boards: ein Interface, zwei Implementierungen.
 * - MockRepository: fiktive Seed-Daten (Standard, heute aktiv)
 * - LiveRepository: Gerüst für Supabase-Schema `board`, wirft "nicht konfiguriert"
 */
import type { BoardDaten, Loan, ReviewItem } from "./typen";

export type Datenquelle = "mock" | "live";

export interface BoardRepository {
  readonly quelle: Datenquelle;
  /** Lädt den gesamten Datenbestand (Board-Datenmengen sind klein: < 10.000 Zeilen). */
  laden(): Promise<BoardDaten>;
  /** Darlehen anlegen/aktualisieren (z. B. aus Excel-Import), Schlüssel ist die Darlehens-ID. */
  darlehenSpeichern(
    loans: Loan[],
  ): Promise<{ neu: number; aktualisiert: number }>;
  /** Prüffall als erledigt markieren (oder wieder öffnen). */
  pruefStatusSetzen(id: string, status: ReviewItem["status"]): Promise<void>;
  /** Ids der erledigten Prüffälle (für generierte Prüffälle aus der Fachlogik). */
  erledigtePruefFaelle(): Promise<string[]>;
}

export class NichtKonfiguriertFehler extends Error {
  constructor(was: string) {
    super(`${was} ist nicht konfiguriert.`);
    this.name = "NichtKonfiguriertFehler";
  }
}
