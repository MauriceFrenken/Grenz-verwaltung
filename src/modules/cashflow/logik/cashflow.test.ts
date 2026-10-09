import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import type { BankAccount, Property, Transaction } from "@/lib/db/typen";
import { darlehenStand } from "@/modules/darlehen/logik/auswertung";
import { einordnen, kategorisieren, objektMuster } from "./einordnung";
import { cashflowAuswerten, cfMonate } from "./objektCashflow";

const objekt = (id: string, street: string, city: string): Property => ({
  id,
  ablageId: null,
  companyId: "G-01",
  name: street,
  street,
  zip: "40000",
  city,
  strategy: "bestand",
  strategyGesetzt: true,
  yearBuilt: null,
  purchaseDate: null,
  purchasePrice: null,
  marketValue: null,
  targetRentPerSqm: null,
  costPerSqmMonth: null,
  oneDriveUrl: "",
});
const objekte = [
  objekt("O-01", "Apollinarisstraße 18", "Düsseldorf"),
  objekt("O-04", "Königsberger Straße 2", "Hückelhoven"),
];
const konto: BankAccount = {
  id: "DE01",
  companyId: "G-01",
  iban: "DE01",
  bankName: "",
  label: "",
  openingBalance: 0,
  openingDate: "2026-01-01",
  saldoBekannt: true,
  saldoStichtag: null,
  zugang: "ebics",
  propertyId: "O-01",
};
let nr = 0;
const tx = (
  amount: number,
  counterpartyName: string,
  purpose = "",
  extra: Partial<Transaction> = {},
): Transaction => ({
  id: `t${++nr}`,
  accountId: "DE01",
  bookingDate: "2026-09-15",
  amount,
  counterpartyName,
  counterpartyIban: null,
  purpose,
  category: "sonstiges",
  propertyId: null,
  ...extra,
});
const kat = (t: Transaction) =>
  kategorisieren(t, new Set(["DE01"])).map((x) => x.k);

describe("Einordnung von Bankbuchungen", () => {
  it("erkennt typische Kostenarten", () => {
    expect(kat(tx(-120, "Stadtwerke Düsseldorf AG"))).toEqual(["versorger"]);
    expect(
      kat(tx(-80, "Landeshauptstadt Düsseldorf", "Kassenzeichen 1")),
    ).toEqual(["grundbesitz"]);
    expect(kat(tx(-300, "Provinzial Versicherung"))).toEqual(["versicherung"]);
    expect(kat(tx(-900, "Finanzamt Düsseldorf-Nord"))).toEqual(["steuern"]);
    expect(kat(tx(-250, "Müller Haustechnik GmbH"))).toEqual([
      "instandhaltung",
    ]);
    expect(kat(tx(650, "Max Mieter", "Miete Oktober"))).toEqual(["miete"]);
    expect(kat(tx(-10, "Kaufmann", "Unklar"))).toEqual(["sonstiges"]);
  });

  it("teilt eine Darlehensrate in Zins und Tilgung", () => {
    const teile = kategorisieren(
      tx(-1500, "Sparkasse", "RECHN.ZINS 1.000,00 TILG./ENTG. 500,00"),
      new Set(),
    );
    expect(teile).toEqual([
      { k: "zinsen", betrag: -1000 },
      { k: "tilgung", betrag: -500 },
    ]);
  });

  it("Umbuchungen in der Gruppe sind Intercompany, Gesellschafterdarlehen Finanzierung", () => {
    expect(kat(tx(-5000, "FRENKEN Holding GmbH", "Umbuchung"))).toEqual([
      "intercompany",
    ]);
    expect(kat(tx(20000, "FRENKEN Holding GmbH", "Darlehen Ankauf"))).toEqual([
      "finanzierung",
    ]);
  });

  it("Adresse im Verwendungszweck schlägt das Konto", () => {
    const re = objektMuster(objekte);
    expect(re.get("O-04")!.test("rechnung konigsberger str 2")).toBe(true);
    const [p] = einordnen(
      [tx(-400, "Dachdecker Schmitz", "Reparatur Königsberger Str. 2")],
      { accounts: [konto], properties: objekte },
    );
    expect(p).toMatchObject({ objektId: "O-04", zuordnung: "adresse" });
    const [q] = einordnen([tx(-400, "Dachdecker Schmitz", "Reparatur Dach")], {
      accounts: [konto],
      properties: objekte,
    });
    expect(q).toMatchObject({ objektId: "O-01", zuordnung: "konto" });
  });

  it("Steuern bleiben bei der Gesellschaft, auch auf dem Mietkonto", () => {
    const [p] = einordnen([tx(-900, "Finanzamt")], {
      accounts: [konto],
      properties: objekte,
    });
    expect(p.objektId).toBeNull();
  });
});

describe("Cashflow je Objekt", () => {
  it("Monate: zwölf abgeschlossene plus der laufende", () => {
    const m = cfMonate("2026-10-09");
    expect(m).toHaveLength(13);
    expect(m[0]).toBe("2025-10");
    expect(m[12]).toBe("2026-10");
  });

  it("rechnet aus Musterdaten NOI, Kapitaldienst und Plan konsistent", () => {
    const daten = erzeugeSeed("2026-06-30");
    const staende = daten.loans.map((l) => darlehenStand(l, daten.stichtag));
    const a = cashflowAuswerten(daten, staende);
    expect(a.objekte.length).toBeGreaterThan(0);
    for (const o of a.objekte) {
      const s = o.summe.summen;
      expect(s.noi).toBeCloseTo(s.einnahmen + s.bewirtschaftung, 1);
      expect(s.cfNachKd).toBeCloseTo(s.noi + s.kapitaldienst, 1);
      expect(o.plan.noi).toBeLessThanOrEqual(o.plan.sollMiete);
    }
    const summeObjekte = a.objekte.reduce(
      (x, o) => x + o.summe.summen.netto,
      0,
    );
    expect(a.portfolio.summe.summen.netto).toBeCloseTo(summeObjekte, 0);
  });
});

describe("Einordnung: Fälle aus den echten Buchungen", () => {
  it("Rückzahlung eines Gruppendarlehens inkl. Zinsen ist Finanzierung, nicht Zins", () => {
    expect(
      kat(
        tx(
          498263.56,
          "Frenken Holding GmbH",
          "Rückzahlung Darlehn vom 06.08.2024 inkl. Zinsen",
        ),
      ),
    ).toEqual(["finanzierung"]);
    expect(
      kat(tx(-4500, "Frenken Immobilien GmbH", "Zinszahlungen Darlehn 150k")),
    ).toEqual(["zinsen"]);
    expect(
      kat(tx(4500, "Frenken Capital Management", "Zinszahlungen Darlehn 150k")),
    ).toEqual(["intercompany"]);
  });

  it("Grunderwerbsteuer gehört zum Ankauf, eingehender Kaufpreis ist Verkauf", () => {
    expect(
      kat(
        tx(
          -45175,
          "Finanzverwaltung NRW",
          "Grunderwerbsteuer Bendemannstraße 19A",
        ),
      ),
    ).toEqual(["ankauf"]);
    expect(
      kat(tx(69000, "Rosa Frey", "Teilkaufpreis Kaufvertrag UVZ 2649/2025")),
    ).toEqual(["verkauf"]);
  });

  it("Adresse einer fremden Gesellschaft ordnet kein Objekt zu", () => {
    const holding: BankAccount = {
      ...konto,
      id: "DE05",
      iban: "DE05",
      companyId: "G-05",
      propertyId: null,
    };
    const [p] = einordnen(
      [
        tx(-100000, "MTF Capital GmbH", "Darlehn Ankauf Apollinarisstraße 18", {
          accountId: "DE05",
        }),
      ],
      { accounts: [konto, holding], properties: objekte },
    );
    expect(p).toMatchObject({ kategorie: "finanzierung", objektId: null });
  });
});
