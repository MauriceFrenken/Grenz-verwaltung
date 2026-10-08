/**
 * Repository-Schicht des Boards: ein Interface, zwei Implementierungen.
 * - LiveRepository: Bens Tabellen im Schema `public` (Standard in der App)
 * - MockRepository: fiktive Seed-Daten (Demo-Modus `npm run board` und Tests)
 */
import type { AnkaufPhase } from "./transaktionen";
import type {
  Beschluss,
  BoardDaten,
  Loan,
  Machine,
  ReviewItem,
  Segment,
} from "./typen";

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

export type BeschlussEingabe = Omit<Beschluss, "id" | "status" | "erledigtAm">;

export interface BeschlussListe {
  eintraege: Beschluss[];
  /** Tabelle board_beschluesse fehlt (Migration noch nicht angewendet) */
  tabelleFehlt: boolean;
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

  // --- Wochenrunde ---------------------------------------------------------
  /** Alle Beschlüsse der Wochenrunden. */
  beschluesse(): Promise<BeschlussListe>;
  /** Beschluss anlegen; liefert die neue ID (BE-JJJJ-NNN). */
  beschlussAnlegen(eingabe: BeschlussEingabe): Promise<string>;
  /** Beschluss erledigen oder wieder öffnen. */
  beschlussStatusSetzen(
    id: string,
    status: Beschluss["status"],
    am: string,
  ): Promise<void>;
}

/** Nächste freie Beschluss-ID im Jahr des Datums. */
export function naechsteBeschlussId(
  vorhandene: string[],
  datum: string,
): string {
  const jahr = datum.slice(0, 4);
  const max = vorhandene
    .filter((id) => id.startsWith(`BE-${jahr}-`))
    .map((id) => Number(id.slice(8)))
    .reduce((a, b) => Math.max(a, b), 0);
  return `BE-${jahr}-${String(max + 1).padStart(3, "0")}`;
}

export class NichtKonfiguriertFehler extends Error {
  constructor(was: string) {
    super(`${was} ist nicht konfiguriert.`);
    this.name = "NichtKonfiguriertFehler";
  }
}
