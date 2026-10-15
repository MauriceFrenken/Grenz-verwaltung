import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import type { BankAccount, Property, Transaction } from "@/lib/db/typen";
import { darlehenStand } from "@/modules/darlehen/logik/auswertung";
import { einordnen, kategorisieren, objektMuster } from "./einordnung";
import {
  abdeckung,
  cashflowAuswerten,
  cfMonate,
  mieteTeilen,
  periodisieren,
} from "./objektCashflow";

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

describe("Zinsen und Nettomieten (Korrektur 12.10.2026)", () => {
  it("teilt eine Darlehensbuchung nach den Anteilen aus dem Register", () => {
    expect(
      kategorisieren(
        tx(
          -72616.63,
          "Frenken Immobilien GmbH",
          "Rückführung Darlehn inkl. Zinsen",
          {
            category: "darlehen",
            interestPart: 5950.63,
            principalPart: 66666,
          },
        ),
        new Set(),
      ),
    ).toEqual([
      { k: "zinsen", betrag: -5950.63 },
      { k: "finanzierung", betrag: -66666 },
    ]);
    // Quartalszins an die Schwestergesellschaft, Text ohne „Zins“
    expect(
      kat(
        tx(-2625, "Frenken Immobilien GmbH", "Darlehn Kalkumer Straße 78", {
          category: "darlehen",
          interestPart: 2625,
        }),
      ),
    ).toEqual(["zinsen"]);
  });

  it("Umsatzsteuer der Bank auf Darlehenszinsen zählt zu den Zinsen", () => {
    expect(
      kat(
        tx(-874.29, "19,0% UST-UMBUCHUNG", "IBAN DE95 aus netto 4.601,50", {
          category: "darlehen",
          propertyId: "O-01",
        }),
      ),
    ).toEqual(["zinsen"]);
  });

  it("der Darlehensgeber bucht nicht aufs Objekt des Nehmers", () => {
    const holding: BankAccount = {
      ...konto,
      id: "DE05",
      iban: "DE05",
      companyId: "G-05",
      propertyId: null,
    };
    const [p] = einordnen(
      [
        tx(2625, "Frenken Immobilien GmbH", "Darlehn 18.12.2024", {
          accountId: "DE05",
          category: "darlehen",
          propertyId: "O-01",
        }),
      ],
      { accounts: [konto, holding], properties: objekte },
    );
    expect(p.objektId).toBeNull();
  });

  it("Mieteingang wird in Netto-Kaltmiete und Umlagen geteilt", () => {
    const [p] = einordnen([tx(1000, "Max Mieter", "Miete Oktober")], {
      accounts: [konto],
      properties: objekte,
    });
    const teile = mieteTeilen([p], () => ({ warm: 1000, kalt: 800 }));
    expect(teile.map((x) => [x.kategorie, x.betrag])).toEqual([
      ["miete", 800],
      ["umlagen", 200],
    ]);
  });
});

describe("Periodisierung von Jahres- und Quartalskosten", () => {
  const posten = (
    t: Transaction,
    ctx = { accounts: [konto], properties: objekte },
  ) => einordnen([t], ctx)[0];

  it("verteilt eine Versicherung nach dem Zeitraum im Verwendungszweck", () => {
    const p = posten(
      tx(
        -1200,
        "LVM Versicherung",
        "Sachversicherung Zeitraum 12.05.2026-12.05.2027",
        {
          bookingDate: "2026-07-01",
        },
      ),
    );
    expect(p.kategorie).toBe("versicherung");
    const m = abdeckung(p)!;
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2026-05");
    expect(m[11]).toBe("2027-04");
  });

  it("Grundsteuer gilt für das Kalenderquartal, Versicherung ohne Zeitraum 12 Monate", () => {
    const g = posten(
      tx(-300, "Landeshauptstadt Düsseldorf", "Grundsteuer B 2026", {
        bookingDate: "2026-08-17",
      }),
    );
    expect(abdeckung(g)).toEqual(["2026-07", "2026-08", "2026-09"]);
    const v = posten(
      tx(-600, "Provinzial Versicherung", "Wohngebäude", {
        bookingDate: "2026-02-01",
      }),
    );
    expect(abdeckung(v)).toHaveLength(12);
    // kleine Gebühr der Stadt außerhalb der Fälligkeiten bleibt im Monat
    const k = posten(
      tx(-55, "Landeshauptstadt Düsseldorf", "Kassenzeichen 5328", {
        bookingDate: "2026-03-03",
      }),
    );
    expect(abdeckung(k)).toBeNull();
  });

  it("feste Kosten des Objekts bestimmen den Rhythmus", () => {
    const w = posten(
      tx(-679.5, "Norbert Brandschutztechnik", "Wartung Rauchmelder", {
        bookingDate: "2026-01-10",
      }),
    );
    expect(abdeckung(w)).toBeNull();
    expect(
      abdeckung(w, [
        {
          objektId: "O-01",
          kostenart: "Wartung",
          betrag: 679.5,
          rhythmus: "jaehrlich",
          faelligAb: null,
          umlagefaehig: true,
        },
      ]),
    ).toHaveLength(12);
  });

  it("Monatskosten sind gleichmäßig, die Bank stimmt über die Abgrenzung", () => {
    const p = posten(
      tx(-1200, "LVM Versicherung", "Wohngebäude", {
        bookingDate: "2026-01-05",
      }),
    );
    const teile = periodisieren([p]);
    const kosten = teile.filter((x) => x.kategorie === "versicherung");
    expect(kosten).toHaveLength(12);
    expect(kosten.every((x) => x.betrag === -100)).toBe(true);
    const summe = teile.reduce((a, x) => a + x.betrag, 0);
    expect(summe).toBeCloseTo(-1200, 2);
    // im Zahlungsmonat: 100 Kosten, 1.100 Abgrenzung
    const jan = teile.filter((x) => x.monat === "2026-01");
    expect(
      jan
        .filter((x) => x.kategorie === "abgrenzung")
        .reduce((a, x) => a + x.betrag, 0),
    ).toBeCloseTo(-1100, 2);
  });

  it("Zahlungen vor dem Zeitraum wirken nur mit ihren Monatsanteilen", () => {
    const p = posten(
      tx(-1200, "LVM Versicherung", "Wohngebäude", {
        bookingDate: "2025-07-01",
      }),
    );
    const teile = periodisieren([], [], [p]);
    const okt = teile.filter((x) => x.monat === "2025-10");
    expect(okt.map((x) => [x.kategorie, x.betrag])).toEqual([
      ["versicherung", -100],
      ["abgrenzung", 100],
    ]);
  });
});
