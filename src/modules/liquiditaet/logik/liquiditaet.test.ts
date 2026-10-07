import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import type { BoardDaten, Loan } from "@/lib/db/typen";
import { darlehenStand } from "@/modules/darlehen/logik/auswertung";
import { darlehenAuswerten } from "@/modules/darlehen/useDarlehen";
import { immobilienAuswerten } from "@/modules/immobilien/logik/objekte";
import {
  bestandJeGesellschaft,
  haupttreiber,
  kreisReihe,
  HORIZONT_TAGE,
  kontoSaldo,
  liquiditaetAuswerten,
  liquiditaetsAmpel,
  monatsVerlauf,
  planBewegungen,
  summe,
  tagesSalden,
  tragbaresEk,
} from "./liquiditaet";

const STICHTAG = "2026-10-07";
const d = erzeugeSeed(STICHTAG);
const dl = darlehenAuswerten(d);
const im = immobilienAuswerten(d, dl.staende);
const a = liquiditaetAuswerten(d, dl.staende, im.projekte);
const firma = (kurz: string) =>
  a.gesellschaften.find((g) => g.company.shortName === kurz)!;

describe("Liquidität: Ist", () => {
  it("Tagessalden je Konto stimmen mit dem Einzelsaldo überein", () => {
    const reihe = tagesSalden(d, "2026-03-01", STICHTAG);
    for (const k of d.bankAccounts) {
      const r = reihe.get(k.id)!;
      expect(r).toHaveLength(221);
      expect(r.at(-1)!.saldo).toBeCloseTo(kontoSaldo(d, k.id, STICHTAG), 2);
      expect(r.find((p) => p.datum === "2026-06-15")!.saldo).toBeCloseTo(
        kontoSaldo(d, k.id, "2026-06-15"),
        2,
      );
    }
  });

  it("Bestand je Gesellschaft summiert alle Konten (MH hat zwei)", () => {
    const b = bestandJeGesellschaft(d, STICHTAG);
    const mh =
      kontoSaldo(d, "k-mh", STICHTAG) + kontoSaldo(d, "k-mh-2", STICHTAG);
    expect(b.get("c-mh")).toBeCloseTo(mh, 2);
    expect(firma("MH").heute).toBeCloseTo(mh, 2);
  });
});

describe("Liquidität: Plan", () => {
  it("plant Mieten am 3. Werktag des Folgemonats", () => {
    const miete = a.bewegungen.filter((b) => b.kategorie === "miete");
    // November 2026: 1. ist Sonntag → Mo 2., Di 3., Mi 4.
    expect(miete.some((b) => b.datum === "2026-11-04")).toBe(true);
    expect(miete.some((b) => b.datum.startsWith("2026-10"))).toBe(false);
  });

  it("endet die Miete nach Fristende einer Kündigung (§ 573c BGB)", () => {
    const quelle = "lease:mv-IM-2018-002-WE03";
    const tage = a.bewegungen
      .filter((b) => b.quelle === quelle)
      .map((b) => b.datum);
    expect(tage).toHaveLength(0); // Fristende 31.10.2026, Oktober ist bereits bezahlt
    const ungekuendigt = a.bewegungen.filter(
      (b) => b.quelle === "lease:mv-IM-2018-002-WE01",
    );
    expect(ungekuendigt.length).toBeGreaterThanOrEqual(24);
  });

  it("bucht Bankdarlehen beim Nehmer als Ausgang in Höhe der Rate", () => {
    const s = dl.staende.find(
      (x) => x.loan.kind === "bank" && x.loan.repayment.kind === "annuitaet",
    )!;
    const rate = s.plan.find((z) => z.dueDate > STICHTAG)!;
    const b = a.bewegungen.find(
      (x) => x.quelle === `loan:${s.loan.id}` && x.datum === rate.dueDate,
    )!;
    expect(b.companyId).toBe(s.loan.borrowerCompanyId);
    expect(b.betrag).toBeCloseTo(-(rate.interest + rate.principal), 2);
    expect(b.ic).toBe(false);
  });

  it("spiegelt Intercompany-Darlehen und eliminiert interne Zahlungen konsolidiert", () => {
    const ic = a.bewegungen.filter((b) => b.ic);
    expect(ic.length).toBeGreaterThan(0);
    expect(ic.reduce((s, b) => s + b.betrag, 0)).toBeCloseTo(0, 2);

    const ids = new Set(a.freieIds);
    const konsolidiert = monatsVerlauf(
      summe(a.verlauf[0], ids),
      a.bewegungen,
      ids,
      STICHTAG,
      24,
      true,
    );
    const brutto = monatsVerlauf(
      summe(a.verlauf[0], ids),
      a.bewegungen,
      ids,
      STICHTAG,
      24,
      false,
    );
    // Salden identisch, aber Ein-/Auszahlungen konsolidiert kleiner
    expect(konsolidiert.at(-1)!.saldoEnde).toBeCloseTo(
      brutto.at(-1)!.saldoEnde,
      2,
    );
    expect(konsolidiert[1].ein).toBeLessThan(brutto[1].ein);
    expect(konsolidiert[1].jeKategorie.intercompany).toBeUndefined();
    // Monatssaldo = Summe der Tagessalden am Monatsende
    const ende = a.verlauf.find((p) => p.datum === "2027-09-30")!;
    expect(
      konsolidiert.find((z) => z.monat === "2027-09")!.saldoEnde,
    ).toBeCloseTo(summe(ende, ids), 2);
  });

  it("zahlt überfällige Eingangsrechnungen am nächsten Tag", () => {
    const ueberfaellig = d.invoices.find(
      (r) =>
        r.status === "offen" &&
        r.direction === "eingang" &&
        r.dueDate <= STICHTAG,
    )!;
    const b = a.bewegungen.find(
      (x) => x.quelle === `invoice:${ueberfaellig.id}`,
    )!;
    expect(b.datum).toBe("2026-10-08");
    expect(b.betrag).toBe(-ueberfaellig.amount);
  });

  it("führt Aufteiler-Darlehen zurück, prolongiert Bestandsdarlehen optional", () => {
    const aufteiler = a.bewegungen.find(
      (b) =>
        b.quelle === "loan:DL-2024-006" && b.label.startsWith("Rückzahlung"),
    )!;
    expect(aufteiler.betrag).toBeLessThan(-2_000_000);

    const bestand: Loan = {
      ...d.loans.find(
        (l) => l.kind === "bank" && l.propertyId === "IM-2018-002",
      )!,
      id: "DL-2026-099",
      principal: 500_000,
      disbursementDate: "2016-12-31",
      maturityDate: "2027-06-30",
      repayment: { kind: "endfaellig" },
      frequency: "quartalsweise",
    };
    const daten: BoardDaten = { ...d, loans: [bestand] };
    const staende = [darlehenStand(bestand, STICHTAG)];
    const mit = planBewegungen(daten, staende, []);
    expect(mit.refinanzierungen).toEqual([
      { loan: bestand, datum: "2027-06-30", betrag: 500_000 },
    ]);
    const ohne = planBewegungen(daten, staende, [], { prolongation: false });
    expect(ohne.refinanzierungen).toHaveLength(0);
    const summeMit = mit.bewegungen
      .filter((b) => b.quelle === "loan:DL-2026-099")
      .reduce((s, b) => s + b.betrag, 0);
    const summeOhne = ohne.bewegungen
      .filter((b) => b.quelle === "loan:DL-2026-099")
      .reduce((s, b) => s + b.betrag, 0);
    expect(summeMit - summeOhne).toBeCloseTo(500_000, 2);
  });
});

describe("Liquidität: Warnungen und Szenario", () => {
  it("Ampel nach Mindestliquidität", () => {
    expect(liquiditaetsAmpel(100, 99, 200)).toBe("rot");
    expect(liquiditaetsAmpel(100, 140, 200)).toBe("gelb");
    expect(liquiditaetsAmpel(100, 200, 90)).toBe("gelb");
    expect(liquiditaetsAmpel(100, 150, 150)).toBe("gruen");
  });

  it("warnt bei der Beteiligungsgesellschaft (Plattform-Burn) innerhalb von 13 Wochen", () => {
    const mbt = firma("MBT");
    expect(mbt.ampel).toBe("rot");
    expect(mbt.ersteUnterschreitung! <= "2027-01-06").toBe(true);
    expect(a.verlauf).toHaveLength(
      a.verlauf.findIndex((p) => p.datum === a.bis) + 1,
    );
    expect(a.verlauf.length).toBeGreaterThan(HORIZONT_TAGE);
  });

  it("Makler zählt nicht zur freien Gruppenliquidität", () => {
    const mm = d.companies.find((c) => c.separateArea)!;
    expect(a.freieIds).not.toContain(mm.id);
    expect(a.mindestFrei).toBe(
      d.companies
        .filter((c) => !c.separateArea)
        .reduce((s, c) => s + c.minLiquidity, 0),
    );
  });

  it("Szenario Ankauf senkt die Salden ab dem Ankaufsdatum um das Eigenkapital", () => {
    const mit = liquiditaetAuswerten(d, dl.staende, im.projekte, {
      szenario: { ek: 800_000, datum: "2026-12-15", companyId: "c-mh" },
    });
    const vorher = (v: typeof a, tag: string) =>
      summe(
        v.verlauf.find((p) => p.datum === tag)!,
        v.freieIds,
      );
    expect(vorher(mit, "2026-12-14")).toBeCloseTo(vorher(a, "2026-12-14"), 2);
    expect(vorher(a, "2026-12-15") - vorher(mit, "2026-12-15")).toBeCloseTo(
      800_000,
      2,
    );
    expect(vorher(a, a.bis) - vorher(mit, mit.bis)).toBeCloseTo(800_000, 2);
    const mh = mit.gesellschaften.find((g) => g.company.id === "c-mh")!;
    expect(mh.tief24.saldo).toBeLessThan(firma("MH").tief24.saldo);
  });

  it("tragbares Eigenkapital ist der kleinste Abstand zur Mindestliquidität ab Ankauf", () => {
    const reihe = [
      { datum: "2026-11-01", wert: 100 },
      { datum: "2026-12-01", wert: 900 },
      { datum: "2027-01-01", wert: 400 },
      { datum: "2027-02-01", wert: 700 },
    ];
    expect(tragbaresEk(reihe, "2026-12-01", 250)).toBe(150);
    expect(tragbaresEk(reihe, "2026-11-01", 250)).toBe(0);
    // Gegenprobe am Seed: genau dieser Betrag hält die Gruppe auf Mindestniveau
    const frei = kreisReihe(a.verlauf, a.freieIds);
    const ek = tragbaresEk(frei, "2027-01-15", a.mindestFrei);
    expect(ek).toBeGreaterThan(0);
    const test = liquiditaetAuswerten(d, dl.staende, im.projekte, {
      szenario: { ek, datum: "2027-01-15", companyId: "c-mh" },
    });
    const tief = Math.min(
      ...kreisReihe(test.verlauf, test.freieIds)
        .filter((p) => p.datum >= "2027-01-15")
        .map((p) => p.wert),
    );
    expect(tief).toBeCloseTo(a.mindestFrei, 0);
  });

  it("nennt den größten Abfluss vor einer Unterschreitung als Treiber", () => {
    const mv = firma("MV");
    expect(mv.ersteUnterschreitung).not.toBeNull();
    const t = haupttreiber(
      a.bewegungen,
      new Set(["c-mv"]),
      mv.ersteUnterschreitung!,
    );
    expect(t?.quelle).toBe("loan:DL-2024-006");
  });
});
