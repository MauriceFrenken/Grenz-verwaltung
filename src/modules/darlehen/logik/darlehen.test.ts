/**
 * Die 10 verbindlichen Testfälle aus docs/modul-darlehen.md (T1–T10) plus Ergänzungen.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import type { BankAccount, Loan, Transaction } from "@/lib/db/typen";
import { excelLesen } from "@/lib/integrations/excel";
import {
  abgleichen,
  abgleichsQuote,
  sollZahlungen,
  type SollZahlung,
} from "./abgleich";
import { darlehenStand, faelligkeiten, matrix } from "./auswertung";
import { importiereDarlehen } from "./import";
import { restschuld, zinsplan, zinstage } from "./zinsplan";

function darlehen(p: Partial<Loan>): Loan {
  return {
    id: "DL-2026-900",
    bankRef: null,
    kind: "bank",
    lenderCompanyId: null,
    lenderPartyId: "p-bank",
    borrowerCompanyId: "c-a",
    borrowerPartyId: null,
    propertyId: null,
    principal: 100_000,
    disbursementDate: "2026-01-31",
    rate: 0.036,
    rateType: "fest",
    fixedUntil: null,
    maturityDate: "2036-01-31",
    repayment: { kind: "annuitaet", installment: 500 },
    frequency: "monatlich",
    dayCount: "30/360",
    status: "aktiv",
    guarantee: null,
    purpose: "Test",
    oneDriveUrl: null,
    ...p,
  };
}

describe("Zinsplan", () => {
  it("T1 Annuität monatlich 30/360 ohne Rumpfperiode", () => {
    const plan = zinsplan(darlehen({}));
    expect(plan[0]).toMatchObject({
      periodStart: "2026-01-31",
      periodEnd: "2026-02-28",
      days: 30,
      interest: 300,
      principal: 200,
      payment: 500,
      balanceAfter: 99_800,
      stub: false,
    });
    expect(plan[1].interest).toBe(299.4);
    // Restschuld am Ende vollständig getilgt
    expect(plan.at(-1)!.balanceAfter).toBe(0);
  });

  it("T2 Rumpfperiode am Anfang: nur Zinsen, Tilgung ab erster voller Periode", () => {
    const plan = zinsplan(
      darlehen({
        principal: 2_400_000,
        rate: 0.0185,
        disbursementDate: "2016-04-15",
        maturityDate: "2046-04-30",
        repayment: { kind: "annuitaet", installment: 7700 },
      }),
    );
    expect(plan[0]).toMatchObject({
      days: 15,
      interest: 1850,
      principal: 0,
      stub: true,
    });
    expect(plan[1]).toMatchObject({
      days: 30,
      interest: 3700,
      principal: 4000,
      stub: false,
    });
  });

  it("T3 Rumpfperiode am Ende, endfällig, act/360 quartalsweise", () => {
    const plan = zinsplan(
      darlehen({
        principal: 1_000_000,
        rate: 0.04,
        disbursementDate: "2026-03-31",
        maturityDate: "2026-11-15",
        repayment: { kind: "endfaellig" },
        frequency: "quartalsweise",
        dayCount: "act/360",
      }),
    );
    expect(
      plan.map((z) => [z.periodEnd, z.days, z.interest, z.principal]),
    ).toEqual([
      ["2026-06-30", 91, 10_111.11, 0],
      ["2026-09-30", 92, 10_222.22, 0],
      ["2026-11-15", 46, 5_111.11, 1_000_000],
    ]);
    expect(plan[2].stub).toBe(true);
  });

  it("T4 Intercompany act/365 jährlich, unbefristet, mit Anfangs-Rumpfperiode", () => {
    const plan = zinsplan(
      darlehen({
        kind: "intercompany",
        principal: 450_000,
        rate: 0.03,
        disbursementDate: "2019-03-15",
        maturityDate: null,
        repayment: { kind: "endfaellig" },
        frequency: "jaehrlich",
        dayCount: "act/365",
      }),
      { bis: "2026-12-31" },
    );
    expect(plan[0]).toMatchObject({
      periodEnd: "2019-12-31",
      days: 291,
      interest: 10_763.01,
      stub: true,
    });
    const z2025 = plan.find((z) => z.periodEnd === "2025-12-31")!;
    expect(z2025).toMatchObject({ days: 365, interest: 13_500, principal: 0 });
    expect(plan.at(-1)!.periodEnd).toBe("2026-12-31");
  });

  it("T5 Schaltjahr: act/365 rechnet 366 Tage", () => {
    const plan = zinsplan(
      darlehen({
        kind: "intercompany",
        principal: 450_000,
        rate: 0.03,
        disbursementDate: "2019-03-15",
        maturityDate: null,
        repayment: { kind: "endfaellig" },
        frequency: "jaehrlich",
        dayCount: "act/365",
      }),
      { bis: "2026-12-31" },
    );
    expect(plan.find((z) => z.periodEnd === "2024-12-31")).toMatchObject({
      days: 366,
      interest: 13_536.99,
    });
    // 30/360 kennt kein Schaltjahr
    expect(zinstage("2023-12-31", "2024-12-31", "30/360")).toBe(360);
  });

  it("T6 Ratentilgung: konstante Tilgung, sinkende Zinsen", () => {
    const loan = darlehen({
      principal: 400_000,
      rate: 0.042,
      disbursementDate: "2023-09-15",
      maturityDate: "2036-09-30",
      repayment: { kind: "ratentilgung", principalPerPeriod: 2_500 },
    });
    const plan = zinsplan(loan);
    expect(plan[0]).toMatchObject({ interest: 700, principal: 0, stub: true });
    expect(plan[1]).toMatchObject({
      interest: 1400,
      principal: 2500,
      balanceAfter: 397_500,
    });
    expect(plan[2]).toMatchObject({ interest: 1391.25, principal: 2500 });
    expect(restschuld(loan, plan, "2023-11-15")).toBe(397_500);
  });
});

describe("Abgleich Soll-Zinsen gegen Kontoumsätze", () => {
  const konten: BankAccount[] = [
    {
      id: "k-a",
      companyId: "c-a",
      iban: "DE00A",
      bankName: "X",
      label: "",
      openingBalance: 0,
      openingDate: "2026-01-01",
    },
  ];
  const soll: SollZahlung = {
    id: "DL-2026-900#3",
    loanId: "DL-2026-900",
    nr: 3,
    dueDate: "2026-06-30",
    amount: 6_750,
    interest: 6_750,
    principal: 0,
    payerCompanyId: "c-a",
    payeeName: "Muster Holding GmbH",
    payeeIban: "DE00HOLDING",
    referenzen: ["DL-2026-900"],
  };
  const tx = (p: Partial<Transaction>): Transaction => ({
    id: "tx-1",
    accountId: "k-a",
    bookingDate: "2026-07-02",
    amount: -6_750,
    counterpartyName: "Muster Holding GmbH",
    counterpartyIban: "DE00HOLDING",
    purpose: "Zinsen DL-2026-900 Q2/2026",
    category: "intercompany",
    propertyId: null,
    ...p,
  });

  it("T7 grün: Betrag, Datum ± 5 Tage und ID im Verwendungszweck", () => {
    const [e] = abgleichen([soll], [tx({})], konten, "2026-07-20");
    expect(e.ampel).toBe("gruen");
    expect(e.abweichungTage).toBe(2);
    // ohne ID, aber richtige Gegenpartei: ebenfalls grün
    const [ohneId] = abgleichen(
      [soll],
      [tx({ purpose: "Zinsen Q2" })],
      konten,
      "2026-07-20",
    );
    expect(ohneId.ampel).toBe("gruen");
  });

  it("T8 gelb: Betrag weicht ab oder Datum außerhalb ± 5 Tage", () => {
    const [betrag] = abgleichen(
      [soll],
      [tx({ amount: -6_700 })],
      konten,
      "2026-07-20",
    );
    expect(betrag.ampel).toBe("gelb");
    expect(betrag.gruende).toContain("Betrag weicht ab");
    expect(betrag.abweichungBetrag).toBe(-50);
    const [spaet] = abgleichen(
      [soll],
      [tx({ bookingDate: "2026-07-09" })],
      konten,
      "2026-07-20",
    );
    expect(spaet.ampel).toBe("gelb");
    expect(spaet.gruende[0]).toMatch(/\+9 Tage/);
  });

  it("T9 rot nach Fälligkeit + 5 Tagen ohne Umsatz, vorher grau", () => {
    expect(abgleichen([soll], [], konten, "2026-07-06")[0].ampel).toBe("rot");
    expect(abgleichen([soll], [], konten, "2026-07-05")[0].ampel).toBe("grau");
    // Umsatz einer anderen Gesellschaft oder ohne Bezug zählt nicht
    const fremd = tx({ accountId: "k-fremd" });
    const ohneBezug = tx({
      id: "tx-2",
      counterpartyName: "Stadtwerke",
      counterpartyIban: null,
      purpose: "Abschlag",
    });
    expect(
      abgleichen([soll], [fremd, ohneBezug], konten, "2026-07-20")[0].ampel,
    ).toBe("rot");
  });

  it("ordnet jeden Umsatz nur einmal zu und stiehlt nicht die Zahlung des Nachbarmonats", () => {
    const juli = { ...soll, id: "DL-2026-900#4", nr: 4, dueDate: "2026-07-31" };
    // Juni fehlt, Juli wurde pünktlich gezahlt
    const e = abgleichen(
      [soll, juli],
      [tx({ bookingDate: "2026-07-31" })],
      konten,
      "2026-08-20",
    );
    expect(e.map((x) => x.ampel)).toEqual(["rot", "gruen"]);
    expect(abgleichsQuote(e)).toBe(0.5);
  });
});

describe("Excel-Import", () => {
  it("T10 importiert die Testdatei: gültige Zeilen übernommen, fehlerhafte mit Meldung abgewiesen", () => {
    const seed = erzeugeSeed("2026-10-07");
    const zeilen = excelLesen(
      readFileSync("docs/testdaten/testdaten_darlehensregister.xlsx"),
    );
    expect(zeilen).toHaveLength(29);
    const e = importiereDarlehen(zeilen, {
      companies: seed.companies,
      parties: seed.parties,
      propertyIds: seed.properties.map((p) => p.id),
      vorhandeneIds: seed.loans.map((l) => l.id),
    });
    expect(e.gueltig).toHaveLength(27);
    expect(e.aktualisiert).toHaveLength(25);
    expect(e.neu).toEqual(["DL-2026-026", "DL-2026-027"]);
    expect(e.fehler.map((f) => f.zeile)).toEqual(
      expect.arrayContaining([29, 30]),
    );
    expect(e.fehler.find((f) => f.zeile === 29)?.meldung).toMatch(
      /DL-JJJJ-NNN/,
    );
    expect(e.fehler.filter((f) => f.zeile === 30).map((f) => f.feld)).toEqual(
      expect.arrayContaining(["Darlehensnehmer", "Auszahlung"]),
    );
    // Rundreise: importiertes Darlehen entspricht dem Seed-Darlehen
    const original = seed.loans.find((l) => l.id === "DL-2016-001")!;
    const importiert = e.gueltig.find((l) => l.id === "DL-2016-001")!;
    expect({ ...importiert, oneDriveUrl: null }).toEqual({
      ...original,
      oneDriveUrl: null,
    });
    // Kurzname und Standard-Zinsmethode für interne Darlehen
    const neu = e.gueltig.find((l) => l.id === "DL-2026-027")!;
    expect(neu).toMatchObject({
      borrowerCompanyId: "c-mbt",
      lenderPartyId: "p-max",
      dayCount: "act/365",
      rate: 0.03,
    });
  });

  it("meldet doppelte IDs", () => {
    const seed = erzeugeSeed("2026-10-07");
    const zeile = {
      "Darlehens-ID": "DL-2026-050",
      Art: "IC",
      Darlehensgeber: "MH",
      Darlehensnehmer: "MI",
      Betrag: 1000,
      Auszahlung: "01.01.2026",
      "Zinssatz %": 3,
    };
    const e = importiereDarlehen([zeile, zeile], {
      companies: seed.companies,
      parties: seed.parties,
      propertyIds: [],
      vorhandeneIds: [],
    });
    expect(e.gueltig).toHaveLength(0);
    expect(e.fehler[0].meldung).toMatch(/mehrfach/);
  });
});

describe("Auswertung auf Seed-Daten", () => {
  const stichtag = "2026-10-07";
  const d = erzeugeSeed(stichtag);
  const staende = d.loans.map((l) => darlehenStand(l, stichtag));

  it("findet die eingebauten Abweichungen im Abgleich", () => {
    const plaene = new Map(staende.map((s) => [s.loan.id, s.plan]));
    const soll = sollZahlungen(
      d.loans,
      plaene,
      { companies: d.companies, parties: d.parties, accounts: d.bankAccounts },
      "2025-10-07",
      stichtag,
    );
    const e = abgleichen(soll, d.transactions, d.bankAccounts, stichtag);
    const status = (id: string) =>
      e.filter((x) => x.soll.loanId === id).map((x) => x.ampel);
    expect(status("DL-2023-016")).toContain("rot");
    expect(status("DL-2022-013").at(-1)).toBe("rot");
    expect(status("DL-2024-014")).toContain("gelb");
    expect(status("DL-2024-020")).toContain("gelb");
    expect(status("DL-2021-012").every((a) => a === "gruen")).toBe(true);
    expect(status("DL-2016-001").every((a) => a === "gruen")).toBe(true);
    expect(abgleichsQuote(e)!).toBeGreaterThan(0.85);
  });

  it("markiert Zinsbindungsenden und Fälligkeiten", () => {
    expect(staende.find((s) => s.loan.id === "DL-2016-001")!.ampel).toBe("rot");
    expect(staende.find((s) => s.loan.id === "DL-2018-002")!.ampel).toBe(
      "gelb",
    );
    const f = faelligkeiten(staende, stichtag);
    expect(f[0].datum <= f.at(-1)!.datum).toBe(true);
    expect(f.find((x) => x.loan.id === "DL-2024-006")!.restschuld).toBe(
      2_000_000,
    );
  });

  it("baut die Matrix Geber × Nehmer nur aus internen Darlehen", () => {
    const m = matrix(staende);
    expect(m.zellen.get("c-mh|c-mb")!.anzahl).toBe(2);
    expect(m.geber).not.toContain("p-vb1");
  });
});
