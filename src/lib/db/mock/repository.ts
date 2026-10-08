import { plusTage } from "@/lib/kalender";
import {
  naechsteBeschlussId,
  type AnkaufAusExposeEingabe,
  type BeschlussEingabe,
  type BoardRepository,
  type KontosaldoEingabe,
  type PlanpostenEingabe,
} from "../repository";
import type { AnkaufPhase } from "../transaktionen";
import type {
  Beschluss,
  BoardDaten,
  Loan,
  Machine,
  ReviewItem,
  Segment,
} from "../typen";
import { musterBeschluesse } from "./beschluesse";
import { erzeugeSeed } from "./seed";

function upsert<T extends { id: string }>(liste: T[], neu: T[]) {
  let anzahlNeu = 0;
  let aktualisiert = 0;
  for (const x of neu) {
    const idx = liste.findIndex((l) => l.id === x.id);
    if (idx >= 0) {
      liste[idx] = x;
      aktualisiert += 1;
    } else {
      liste.push(x);
      anzahlNeu += 1;
    }
  }
  return { neu: anzahlNeu, aktualisiert };
}

/** In-Memory-Repository auf Basis der Seed-Daten. Änderungen gelten bis zum Neuladen. */
export class MockRepository implements BoardRepository {
  readonly quelle = "mock" as const;
  private daten: BoardDaten;
  private erledigt = new Set<string>();
  private beschlussListe: Beschluss[];

  constructor(stichtag: string) {
    this.daten = erzeugeSeed(stichtag);
    this.beschlussListe = musterBeschluesse(this.daten);
  }

  async laden(): Promise<BoardDaten> {
    return {
      ...structuredClone(this.daten),
      reviewItems: this.daten.reviewItems.map((r) => ({
        ...r,
        status: this.erledigt.has(r.id) ? "erledigt" : r.status,
      })),
    };
  }

  async darlehenSpeichern(loans: Loan[]) {
    return upsert(this.daten.loans, loans);
  }

  async pruefStatusSetzen(id: string, status: ReviewItem["status"]) {
    if (status === "erledigt") this.erledigt.add(id);
    else this.erledigt.delete(id);
  }

  async erledigtePruefFaelle() {
    return [...this.erledigt];
  }

  async kontosaldoErfassen(e: KontosaldoEingabe) {
    const konto = this.daten.bankAccounts.find((k) => k.iban === e.iban);
    if (!konto) return;
    const fluss = this.daten.transactions
      .filter((t) => t.accountId === konto.id && t.bookingDate <= e.stichtag)
      .reduce((s, t) => s + t.amount, 0);
    konto.openingBalance = e.saldo - fluss;
    konto.saldoBekannt = true;
    konto.saldoStichtag = e.stichtag;
  }

  async mindestliquiditaetSetzen(companyId: string, betrag: number | null) {
    const c = this.daten.companies.find((x) => x.id === companyId);
    if (!c) return;
    c.minLiquidity = betrag ?? 0;
    c.minLiquidityGesetzt = betrag != null;
  }

  async segmentSetzen(companyId: string, segment: Segment) {
    const c = this.daten.companies.find((x) => x.id === companyId);
    if (c) c.segment = segment;
  }

  async planpostenAnlegen(e: PlanpostenEingabe) {
    this.daten.plannedPayments.push({
      id: `pp-${this.daten.plannedPayments.length + 1}`,
      companyId: e.companyId,
      date: e.datum,
      amount: e.betrag,
      label: e.bezeichnung,
      monthlyUntil: e.monatlichBis,
      category: e.kategorie === "projekt" ? "sonstiges" : e.kategorie,
    });
  }

  async ankaufStufeSetzen(ankaufId: string, phase: AnkaufPhase) {
    const a = this.daten.crm.ankaeufe.find((x) => x.id === ankaufId);
    if (!a) throw new Error(`Ankauf ${ankaufId} nicht gefunden`);
    a.phase = phase;
    a.phaseSeit = this.daten.stichtag;
  }

  async ankaufAusExpose(e: AnkaufAusExposeEingabe) {
    const id = `AK-${this.daten.stichtag.slice(0, 4)}-${String(this.daten.crm.ankaeufe.length + 1).padStart(3, "0")}`;
    this.daten.crm.ankaeufe.push({
      id,
      sfId: e.sfId,
      exposeId: e.exposeId,
      name: e.name,
      strasse: e.strasse,
      ort: e.ort,
      assetKlasse: "Wohnen",
      einheiten: e.einheiten,
      flaeche: e.flaeche,
      angebotspreis: e.angebotspreis ?? 0,
      jahresnettokaltmiete: e.jahresnettokaltmiete,
      makler: e.makler,
      phase: "bewertung",
      phaseSeit: this.daten.stichtag,
      naechsterSchritt: "Erstbewertung",
      naechsterSchrittAm: plusTage(this.daten.stichtag, 3),
      verantwortlich: "Max Mustermann",
      zielGesellschaftId: null,
      ekQuote: 0.25,
      ekQuoteGesetzt: false,
      notartermin: null,
      strategie: "bestand",
    });
    const ex = this.daten.crm.exposes.find((x) => x.id === e.exposeId);
    if (ex) ex.ankaufId = id;
    return id;
  }

  async maschinenSpeichern(maschinen: Machine[]) {
    return upsert(this.daten.machines, maschinen);
  }

  async beschluesse() {
    return {
      eintraege: structuredClone(this.beschlussListe),
      tabelleFehlt: false,
    };
  }

  async beschlussAnlegen(e: BeschlussEingabe) {
    const id = naechsteBeschlussId(
      this.beschlussListe.map((b) => b.id),
      e.rundeAm,
    );
    this.beschlussListe.push({ ...e, id, status: "offen", erledigtAm: null });
    return id;
  }

  async beschlussStatusSetzen(
    id: string,
    status: Beschluss["status"],
    am: string,
  ) {
    const b = this.beschlussListe.find((x) => x.id === id);
    if (!b) throw new Error(`Beschluss ${id} nicht gefunden`);
    b.status = status;
    b.erledigtAm = status === "erledigt" ? am : null;
  }
}
