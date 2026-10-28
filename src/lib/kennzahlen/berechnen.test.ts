import { describe, expect, it } from "vitest";

import { berechneKennzahlen, ohneDoppelte, type RohBuchung } from "./berechnen";
import { kategorisiere, ustZeitraumEnde, zerlege } from "./kategorien";

const GIRO = "DE43310605170097848017";
const TAGESGELD = "DE21310605170097848025";
const eigene = new Set([GIRO, TAGESGELD]);

function b(teil: Partial<RohBuchung>): RohBuchung {
  return {
    kontoIban: GIRO,
    buchungsdatum: "2026-03-01",
    betrag: 0,
    gegenkontoIban: null,
    auftraggeberName: null,
    verwendungszweck: null,
    ausPdfImport: false,
    ...teil,
  };
}

describe("kategorisiere", () => {
  it.each([
    [
      {
        betrag: 89250,
        auftraggeberName: "IFM Projekte GmbH",
        verwendungszweck:
          "RG AR26-010 - Vermittlungsprovision Karl-Anton-Str. 5 Ddorf",
      },
      "provision",
    ],
    [
      {
        betrag: 59000,
        auftraggeberName: "ROOM LIVINGS",
        verwendungszweck:
          "Rechnung Nr. AR26-011 Maklercourtage Objekt Bilker Allee 112",
      },
      "provision",
    ],
    [
      {
        betrag: 5000,
        gegenkontoIban: TAGESGELD,
        auftraggeberName: "Grenz & Co.",
      },
      "intern",
    ],
    [
      {
        betrag: -2422.34,
        auftraggeberName: "Sebastian Paul Grenz",
        verwendungszweck: "Lohn September",
      },
      "personal",
    ],
    [
      {
        betrag: -11232.94,
        auftraggeberName: "STEUERVERWALTUNG NRW",
        verwendungszweck: "Umsatzsteuer Aug. 26 Lohnsteuer 3.Vj.26",
      },
      "steuern",
    ],
    [
      {
        betrag: -1391.82,
        auftraggeberName: "Frenken Holding GmbH",
        verwendungszweck: "Zinsen 2025 gemäß Darlehensvertrag",
      },
      "darlehen",
    ],
    [
      {
        betrag: -357,
        auftraggeberName: "GRE Triton Grundbesitz GmbH",
        verwendungszweck: "Miete Auto BM-S-675",
      },
      "fahrzeug",
    ],
    [
      { betrag: -451.01, auftraggeberName: "Immobilien Scout Gmb" },
      "marketing",
    ],
    [
      {
        betrag: -15,
        auftraggeberName: "PayPal Europe",
        verwendungszweck: "Ihr Einkauf bei Stadt Koln",
      },
      "gebuehren",
    ],
    [
      {
        betrag: -38.1,
        auftraggeberName: "Abschluss",
        verwendungszweck: "Abschluss per 30.09.2026",
      },
      "bank",
    ],
    [
      {
        betrag: 367.05,
        auftraggeberName: "Abschluss",
        verwendungszweck: "Abschluss per 30.09.2026",
      },
      "zinsertrag",
    ],
    [
      { betrag: 301.61, auftraggeberName: "STEUERVERWALTUNG NRW" },
      "erstattung",
    ],
    [
      {
        betrag: 50000,
        auftraggeberName: "Grenz & Co. Immobilienberatungs - GmbH",
        verwendungszweck: "Überweisungsgutschrift",
      },
      "intern",
    ],
  ])("%o → %s", (teil, erwartet) => {
    expect(kategorisiere(b(teil), eigene)).toBe(erwartet);
  });
});

describe("ohneDoppelte", () => {
  it("nimmt PDF-Buchungen nur vor dem ersten EBICS-Tag", () => {
    const rows = [
      b({ buchungsdatum: "2026-10-01", ausPdfImport: true, betrag: -1 }),
      b({ buchungsdatum: "2026-10-20", ausPdfImport: true, betrag: -2 }),
      b({ buchungsdatum: "2026-10-20", ausPdfImport: false, betrag: -2 }),
    ];
    expect(ohneDoppelte(rows).map((r) => r.betrag)).toEqual([-1, -2]);
    expect(ohneDoppelte(rows).filter((r) => r.ausPdfImport)).toHaveLength(1);
  });
});

describe("zerlege", () => {
  it("teilt Sammelzahlungen ans Finanzamt nach Steuerart", () => {
    expect(
      zerlege(
        b({
          betrag: -11232.94,
          auftraggeberName: "STEUERVERWALTUNG NRW",
          verwendungszweck:
            "Stnr 215/5818/3961 Umsatzsteuer Aug. 26 9.049,96 Lohnsteuer 3.Vj.26 2.182,98 EREF: 2150",
        }),
        eigene,
      ),
    ).toEqual([
      { kategorie: "umsatzsteuer", betrag: -9049.96 },
      { kategorie: "personal", betrag: -2182.98 },
    ]);
  });

  it("erkennt USt-Erstattungen und Sondervorauszahlungen", () => {
    expect(
      zerlege(
        b({
          betrag: 301.61,
          auftraggeberName: "STEUERVERWALTUNG NRW",
          verwendungszweck: "StNr 215/5818/3961 Umsatzsteuer Juli 26 301,61",
        }),
        eigene,
      ),
    ).toEqual([{ kategorie: "umsatzsteuer", betrag: 301.61 }]);
    expect(
      zerlege(
        b({
          betrag: -15212.4,
          auftraggeberName: "STEUERVERWALTUNG NRW",
          verwendungszweck:
            "Stnr 215/5818/3961 Umsatzsteuer SVZ 26 1.739,00 Umsatzsteuer 1.Vj.26 13.473,40 EREF",
        }),
        eigene,
      ).map((t) => t.kategorie),
    ).toEqual(["umsatzsteuer", "umsatzsteuer"]);
  });

  it("lässt unklare Finanzamt-Zahlungen als Ertragsteuer", () => {
    expect(
      zerlege(b({ betrag: -900, auftraggeberName: "Finanzamt" }), eigene),
    ).toEqual([{ kategorie: "steuern", betrag: -900 }]);
  });
});

describe("ustZeitraumEnde", () => {
  it.each([
    ["Umsatzsteuer Aug. 26 9.049,96 Lohnsteuer 3.Vj.26", "2026-08"],
    ["Umsatzsteuer 4.Vj.25 10.555,26", "2025-12"],
    ["Umsatzsteuer SVZ 26 1.739,00 Umsatzsteuer 1.Vj.26 13.473,40", "2026-03"],
    ["Umsatzsteuer Mai 26 890,71", "2026-05"],
    ["Lohnsteuer Jan. 26 727,66", null],
  ])("%s → %s", (zweck, erwartet) => {
    expect(ustZeitraumEnde(zweck)).toBe(erwartet);
  });
});

describe("berechneKennzahlen", () => {
  const lohn = (monat: string) =>
    b({
      buchungsdatum: `2026-${monat}-30`,
      betrag: -1000,
      auftraggeberName: "Sebastian Paul Grenz",
      verwendungszweck: "Lohn",
    });
  const buero = (monat: string) =>
    b({
      buchungsdatum: `2026-${monat}-02`,
      betrag: -119,
      auftraggeberName: "Office Club AG",
    });
  const ergebnis = berechneKennzahlen({
    jahr: 2026,
    heute: "2026-10-23",
    konten: [
      {
        iban: GIRO,
        bezeichnung: "Firmenkonto",
        saldo: 1000,
        saldoStichtag: "2026-10-23",
      },
      {
        iban: TAGESGELD,
        bezeichnung: "Tagesgeld",
        saldo: 5000,
        saldoStichtag: "2026-10-23",
      },
    ],
    buchungen: [
      b({
        buchungsdatum: "2026-03-24",
        betrag: 11900,
        auftraggeberName: "IFM",
        verwendungszweck: "Vermittlungsprovision Musterstr. 1",
      }),
      b({
        buchungsdatum: "2026-05-15",
        betrag: 3000,
        gegenkontoIban: TAGESGELD,
      }),
      b({
        kontoIban: TAGESGELD,
        buchungsdatum: "2026-05-15",
        betrag: -3000,
        gegenkontoIban: GIRO,
      }),
      lohn("07"),
      lohn("08"),
      lohn("09"),
      buero("07"),
      buero("08"),
      buero("09"),
      b({
        buchungsdatum: "2026-09-30",
        betrag: -10,
        auftraggeberName: "Kapitalertragsteuer",
        verwendungszweck: "Kapitalertragsteuer aus EUR 40,00 Habenzins",
      }),
      b({
        buchungsdatum: "2026-10-15",
        betrag: -900,
        auftraggeberName: "STEUERVERWALTUNG NRW",
        verwendungszweck:
          "Umsatzsteuer Aug. 26 700,00 Lohnsteuer 3.Vj.26 200,00",
      }),
    ],
  });

  it("rechnet netto, USt als durchlaufenden Posten", () => {
    expect(ergebnis.einnahmen).toBe(10000);
    expect(ergebnis.ausgaben).toBe(3510);
    expect(ergebnis.ergebnis).toBe(6490);
    expect(ergebnis.steuern).toBe(10);
    expect(ergebnis.ustSaldo).toBe(700);
    expect(ergebnis.provisionNetto).toBe(10000);
    expect(ergebnis.provisionBrutto).toBe(11900);
    expect(ergebnis.provisionen[0].objekt).toBe("Musterstr. 1");
  });

  it("rechnet die Liquidität je Monatsende zurück", () => {
    const saldo = Object.fromEntries(
      ergebnis.monate.map((m) => [m.monat, m.saldo]),
    );
    expect(saldo["2026-10"]).toBe(6000);
    expect(saldo["2026-09"]).toBe(6900);
    expect(saldo["2026-02"]).toBe(-1633);
    expect(saldo["2026-11"]).toBeNull();
  });

  it("bildet die Runway aus Liquidität netto und aktuellen Fixkosten", () => {
    const r = ergebnis.runway;
    expect(r.ustOffenAb).toBe("2026-09");
    expect(r.offeneUst).toBe(-19);
    expect(r.liquiditaetNetto).toBe(6019);
    expect(r.fixProMonat).toBe(1100);
    expect(r.variabelProMonat).toBe(0);
    expect(r.ertragsteuern12Monate).toBe(10);
    expect(r.monate).toBeCloseTo(5.47, 2);
    expect(r.reichtBis).toBe("2027-03");
    expect(ergebnis.reichweiteMonate).toBe(r.monate);
    expect(r.verlauf[0]).toEqual({
      monat: "2026-10",
      nurFix: 6019,
      mitVariabel: 6019,
    });
    expect(r.verlauf.at(-1)?.nurFix).toBe(0);
  });
});
