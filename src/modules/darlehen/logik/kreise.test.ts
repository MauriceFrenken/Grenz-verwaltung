import { describe, expect, it } from "vitest";
import type { Loan } from "@/lib/db/typen";
import { darlehenStand } from "./auswertung";
import {
  externeGeber,
  externeLaufzeiten,
  faelligkeitsProfil,
  internNetto,
  kreis,
  kreisSummen,
  verbindlichkeitenJeGesellschaft,
} from "./kreise";

const STICHTAG = "2026-10-15";

function dl(p: Partial<Loan>): Loan {
  return {
    id: "DL-2026-900",
    bankRef: null,
    kind: "intercompany",
    lenderCompanyId: "G-05",
    lenderPartyId: null,
    borrowerCompanyId: "G-04",
    borrowerPartyId: null,
    propertyId: null,
    principal: 100_000,
    disbursementDate: "2026-01-01",
    rate: 0.03,
    rateType: "fest",
    fixedUntil: null,
    maturityDate: null,
    repayment: { kind: "endfaellig" },
    frequency: "jaehrlich",
    dayCount: "30/360",
    status: "aktiv",
    guarantee: null,
    purpose: "",
    oneDriveUrl: null,
    istSaldo: null,
    istSaldoAm: null,
    hinweis: null,
    unklareBuchungen: 0,
    ...p,
  } as Loan;
}

const loans = [
  dl({
    id: "BK-1",
    kind: "bank",
    lenderCompanyId: null,
    lenderPartyId: "vb",
    borrowerCompanyId: "G-01",
    principal: 1_000_000,
    rate: 0.04,
    maturityDate: "2030-06-30",
  }),
  dl({
    id: "DL-P",
    kind: "sonstige",
    lenderCompanyId: null,
    lenderPartyId: "hbf",
    borrowerCompanyId: "G-05",
    principal: 300_000,
  }),
  dl({
    id: "DL-F",
    kind: "sonstige",
    lenderCompanyId: "G-05",
    borrowerCompanyId: null,
    borrowerPartyId: "xi",
    principal: 20_000,
  }),
  dl({ id: "DL-I", kind: "intercompany", principal: 100_000 }),
  dl({
    id: "DL-G",
    kind: "gesellschafter",
    lenderCompanyId: null,
    lenderPartyId: "mf",
    borrowerCompanyId: "G-05",
    principal: 20_000,
  }),
  dl({
    id: "DL-X",
    kind: "intercompany",
    status: "beendet",
    principal: 50_000,
  }),
];
const staende = loans.map((l) => darlehenStand(l, STICHTAG));

describe("Gliederung intern / extern", () => {
  it("ordnet Bank und Sonstige extern, Intercompany und Gesellschafter intern zu", () => {
    expect(loans.map((l) => kreis(l))).toEqual([
      "extern",
      "extern",
      "extern",
      "intern",
      "intern",
      "intern",
    ]);
  });

  it("summiert je Gruppe, ohne beendete Darlehen und ohne Forderungen an Dritte", () => {
    const s = kreisSummen(staende);
    expect(s.bank).toBe(1_000_000);
    expect(s.privat).toBe(300_000);
    expect(s.intern).toBe(120_000);
    expect(s.forderungenExtern).toBe(20_000);
    expect(s.zinsenBankPa).toBe(40_000);
    expect(s.zinsenExternPa).toBe(49_000);
    expect(s.anzahl).toEqual({ bank: 1, privat: 1, intern: 2 });
  });

  it("listet externe Geber absteigend mit gewichtetem Zins", () => {
    const g = externeGeber(staende);
    expect(g.map((z) => z.id)).toEqual(["vb", "hbf"]);
    expect(g[0].zinsSchnitt).toBeCloseTo(0.04);
  });

  it("stapelt Verbindlichkeiten je Gesellschaft", () => {
    const v = verbindlichkeitenJeGesellschaft(staende);
    expect(v[0]).toMatchObject({ companyId: "G-01", bank: 1_000_000 });
    expect(v.find((z) => z.companyId === "G-05")).toMatchObject({
      privat: 300_000,
      intern: 20_000,
    });
  });

  it("legt unbefristete Darlehen im Profil unter 'offen' ab", () => {
    const p = faelligkeitsProfil(staende, STICHTAG);
    expect(p.map((z) => z.jahr)).toEqual(["2030", "offen"]);
    expect(p[0].bank).toBe(1_000_000);
  });

  it("rechnet die interne Netto-Position je Beteiligtem", () => {
    const n = internNetto(staende);
    const g05 = n.find((z) => z.id === "G-05")!;
    expect(g05).toMatchObject({
      forderungen: 100_000,
      verbindlichkeiten: 20_000,
      netto: 80_000,
    });
    expect(n.at(-1)).toMatchObject({ id: "G-04", netto: -100_000 });
  });
});

describe("externe Laufzeiten", () => {
  it("stellt variable Darlehen voran und sortiert den Rest nach Ablauf", () => {
    const ls = [
      dl({
        id: "BK-F",
        kind: "bank",
        lenderCompanyId: null,
        lenderPartyId: "vb",
        borrowerCompanyId: "G-01",
        fixedUntil: "2031-01-30",
        maturityDate: "2040-01-30",
      }),
      dl({
        id: "BK-V",
        kind: "bank",
        lenderCompanyId: null,
        lenderPartyId: "vb",
        borrowerCompanyId: "G-01",
        rateType: "variabel",
      }),
      dl({
        id: "DL-P",
        kind: "sonstige",
        lenderCompanyId: null,
        lenderPartyId: "hbf",
        borrowerCompanyId: "G-05",
      }),
      dl({
        id: "DL-E",
        kind: "sonstige",
        lenderCompanyId: null,
        lenderPartyId: "bsf",
        borrowerCompanyId: "G-02",
        maturityDate: "2026-12-31",
      }),
      dl({ id: "DL-I", kind: "intercompany" }),
    ];
    const z = externeLaufzeiten(ls.map((l) => darlehenStand(l, STICHTAG)));
    expect(z.map((r) => [r.loan.id, r.art, r.bis])).toEqual([
      ["BK-V", "variabel", null],
      ["DL-E", "ende", "2026-12-31"],
      ["BK-F", "zinsbindung", "2031-01-30"],
      ["DL-P", "unbefristet", null],
    ]);
  });
});
