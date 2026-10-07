import { NichtKonfiguriertFehler, type BoardRepository } from "../repository";
import type { BoardDaten, Loan, ReviewItem } from "../typen";

/**
 * Gerüst für die echte Datenquelle (Supabase, Schema `board`).
 *
 * TODO(live): Supabase-Client mit Benutzer-JWT, Abfragen je Tabelle,
 * Mapping snake_case → camelCase, RLS-Policies im Schema `board` prüfen.
 * Bis dahin wirft jede Methode "nicht konfiguriert".
 */
export class LiveRepository implements BoardRepository {
  readonly quelle = "live" as const;

  async laden(): Promise<BoardDaten> {
    throw new NichtKonfiguriertFehler("Die Live-Datenbank des Boards");
  }

  async darlehenSpeichern(
    _loans: Loan[],
  ): Promise<{ neu: number; aktualisiert: number }> {
    throw new NichtKonfiguriertFehler("Die Live-Datenbank des Boards");
  }

  async pruefStatusSetzen(
    _id: string,
    _status: ReviewItem["status"],
  ): Promise<void> {
    throw new NichtKonfiguriertFehler("Die Live-Datenbank des Boards");
  }

  async erledigtePruefFaelle(): Promise<string[]> {
    throw new NichtKonfiguriertFehler("Die Live-Datenbank des Boards");
  }
}
