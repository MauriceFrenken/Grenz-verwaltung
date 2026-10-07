import type { BoardRepository } from "../repository";
import type { BoardDaten, Loan, ReviewItem } from "../typen";
import { erzeugeSeed } from "./seed";

/** In-Memory-Repository auf Basis der Seed-Daten. Änderungen gelten bis zum Neuladen. */
export class MockRepository implements BoardRepository {
  readonly quelle = "mock" as const;
  private daten: BoardDaten;
  private erledigt = new Set<string>();

  constructor(stichtag: string) {
    this.daten = erzeugeSeed(stichtag);
  }

  async laden(): Promise<BoardDaten> {
    return {
      ...this.daten,
      loans: [...this.daten.loans],
      reviewItems: this.daten.reviewItems.map((r) => ({
        ...r,
        status: this.erledigt.has(r.id) ? "erledigt" : r.status,
      })),
    };
  }

  async darlehenSpeichern(loans: Loan[]) {
    let neu = 0;
    let aktualisiert = 0;
    for (const loan of loans) {
      const idx = this.daten.loans.findIndex((l) => l.id === loan.id);
      if (idx >= 0) {
        this.daten.loans[idx] = loan;
        aktualisiert += 1;
      } else {
        this.daten.loans.push(loan);
        neu += 1;
      }
    }
    return { neu, aktualisiert };
  }

  async pruefStatusSetzen(id: string, status: ReviewItem["status"]) {
    if (status === "erledigt") this.erledigt.add(id);
    else this.erledigt.delete(id);
  }

  async erledigtePruefFaelle() {
    return [...this.erledigt];
  }
}
