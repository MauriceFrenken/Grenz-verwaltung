/**
 * Repository-Schicht des Boards: ein Interface, zwei Implementierungen.
 * - LiveRepository: Bens Tabellen im Schema `public` (Standard in der App)
 * - MockRepository: fiktive Seed-Daten (Demo-Modus `npm run board` und Tests)
 */
import type { AnkaufPhase } from "./transaktionen";
import type { BoardDaten, Loan, Machine, ReviewItem, Segment } from "./typen";

export type Datenquelle = "mock" | "live";

export interface KontosaldoEingabe {
  iban: string;
  companyId: string;
  stichtag: string;
  saldo: number;
  bankName?: string | null;
}

export interface PlanpostenEingabe {
  companyId: string;
  datum: string;
  betrag: number;
  bezeichnung: string;
  kategorie:
    | "personal"
    | "steuern"
    | "rechnung"
    | "ankauf"
    | "verkauf"
    | "projekt"
    | "intercompany"
    | "sonstiges";
  monatlichBis: string | null;
}

export interface AnkaufAusExposeEingabe {
  exposeId: string;
  name: string;
  strasse: string;
  ort: string;
  angebotspreis: number | null;
  jahresnettokaltmiete: number | null;
  flaeche: number | null;
  einheiten: number | null;
  makler: string | null;
  sfId: string | null;
}

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

  // --- Datengrundlage ------------------------------------------------------
  /** Kontostand eines Kontos zu einem Stichtag manuell erfassen. */
  kontosaldoErfassen(eingabe: KontosaldoEingabe): Promise<void>;
  /** Mindestliquidität einer Gesellschaft festlegen (null = nicht festgelegt). */
  mindestliquiditaetSetzen(
    companyId: string,
    betrag: number | null,
  ): Promise<void>;
  /** Segment einer Gesellschaft ändern. */
  segmentSetzen(companyId: string, segment: Segment): Promise<void>;
  /** Planposten für die Liquiditätsplanung anlegen. */
  planpostenAnlegen(eingabe: PlanpostenEingabe): Promise<void>;

  // --- Transaktionen -------------------------------------------------------
  /** Stufe eines Ankaufs ändern. */
  ankaufStufeSetzen(ankaufId: string, phase: AnkaufPhase): Promise<void>;
  /** Exposé aus dem Postfach als Ankauf in die Pipeline übernehmen. */
  ankaufAusExpose(eingabe: AnkaufAusExposeEingabe): Promise<string>;

  // --- Baumaschinen --------------------------------------------------------
  /** Maschinen anlegen/aktualisieren (Import), Schlüssel ist die Maschinen-ID. */
  maschinenSpeichern(
    maschinen: Machine[],
  ): Promise<{ neu: number; aktualisiert: number }>;
}

export class NichtKonfiguriertFehler extends Error {
  constructor(was: string) {
    super(`${was} ist nicht konfiguriert.`);
    this.name = "NichtKonfiguriertFehler";
  }
}
