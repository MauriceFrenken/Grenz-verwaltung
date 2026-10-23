import { describe, expect, it } from "vitest";

import { berechneKennzahlen, ohneDoppelte, type RohBuchung } from "./berechnen";
import { kategorisiere } from "./kategorien";

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

describe("berechneKennzahlen", () => {
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
      b({
        buchungsdatum: "2026-09-30",
        betrag: -1000,
        auftraggeberName: "Sebastian Paul Grenz",
        verwendungszweck: "Lohn September",
      }),
      b({
        buchungsdatum: "2026-10-15",
        betrag: -900,
        auftraggeberName: "STEUERVERWALTUNG NRW",
      }),
    ],
  });

  it("rechnet Summen ohne interne Umbuchungen", () => {
    expect(ergebnis.einnahmen).toBe(11900);
    expect(ergebnis.ausgaben).toBe(1900);
    expect(ergebnis.ergebnis).toBe(10000);
    expect(ergebnis.steuern).toBe(900);
    expect(ergebnis.provisionNetto).toBe(10000);
    expect(ergebnis.provisionen[0].objekt).toBe("Musterstr. 1");
  });

  it("rechnet die Liquidität je Monatsende zurück", () => {
    const saldo = Object.fromEntries(
      ergebnis.monate.map((m) => [m.monat, m.saldo]),
    );
    expect(saldo["2026-10"]).toBe(6000);
    expect(saldo["2026-09"]).toBe(6900);
    expect(saldo["2026-02"]).toBe(-4000);
    expect(saldo["2026-11"]).toBeNull();
  });

  it("bildet Reichweite aus Ø Monatsausgaben", () => {
    expect(ergebnis.kostenProMonat).toBe(190);
    expect(ergebnis.reichweiteMonate).toBeCloseTo(31.58, 2);
  });
});
