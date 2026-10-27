import { describe, expect, it } from "vitest";

import {
  entwurfBerechnen,
  inhaltBauen,
  inhaltPruefen,
  monatPlus,
  monatsgrenzen,
  vormonat,
  type EntwurfEingabe,
} from "./berechnen";
import type { BerichtFormular } from "./typen";

function eingabe(teil: Partial<EntwurfEingabe> = {}): EntwurfEingabe {
  return {
    periode: "2026-09",
    art: "ist",
    heute: "2026-10-05",
    finanzen: {
      monat: { einnahmen: 119000, ausgaben: 40000, provisionen: 119000, saldo: 142000 },
      kontenMitSaldo: 2,
      saldoStichtag: "2026-10-04",
    },
    unternehmenszahlen: [],
    personal: [
      { eintrittAm: "2024-01-01", austrittAm: null, vertragsart: "vollzeit" },
      { eintrittAm: "2026-09-15", austrittAm: null, vertragsart: "teilzeit" },
      { eintrittAm: "2026-10-01", austrittAm: null, vertragsart: "vollzeit" },
      { eintrittAm: "2023-01-01", austrittAm: "2026-08-31", vertragsart: "vollzeit" },
      { eintrittAm: "2025-01-01", austrittAm: null, vertragsart: "freie_mitarbeit" },
    ],
    mandate: [
      { name: "M1", status: "Beauftragung", angebotspreis: 2_000_000, beauftragtAm: "2026-05-01" },
      { name: "M2", status: "Beauftragung", angebotspreis: null, beauftragtAm: null },
      { name: "M3", status: "Beauftragung", angebotspreis: 5_000_000, beauftragtAm: "2026-10-02" },
      { name: "M4", status: "Akquisition", angebotspreis: 1_000_000, beauftragtAm: null },
      { name: "Test SG", status: "Beauftragung", angebotspreis: 9_000_000, beauftragtAm: null },
    ],
    deals: [
      { name: "D1", gewonnen: true, abschlussAm: "2026-09-10", provision: 30_000, kaufpreis: 1_000_000 },
      { name: "D2", gewonnen: true, abschlussAm: "2026-09-20", provision: 60_000, kaufpreis: 2_000_000 },
      { name: "D3", gewonnen: false, abschlussAm: "2026-09-20", provision: null, kaufpreis: null },
      { name: "D4", gewonnen: true, abschlussAm: "2026-08-20", provision: 10_000, kaufpreis: 500_000 },
    ],
    salesforceStand: "2026-10-05T05:30:00Z",
    ...teil,
  };
}

describe("Monatshilfen", () => {
  it("rechnet Vormonat und Monatsgrenzen", () => {
    expect(vormonat("2026-10-27")).toBe("2026-09");
    expect(vormonat("2026-01-03")).toBe("2025-12");
    expect(monatPlus("2026-01", -1)).toBe("2025-12");
    expect(monatPlus("2026-11", 3)).toBe("2027-02");
    expect(monatsgrenzen("2026-02")).toEqual({ start: "2026-02-01", ende: "2026-02-28" });
  });
});

describe("entwurfBerechnen", () => {
  it("leitet Ist-Werte aus Bank, Personal und Salesforce ab", () => {
    const { werte } = entwurfBerechnen(eingabe());
    expect(werte.umsatz.wert).toBe(100000);
    expect(werte.umsatz.automatisch).toBe(true);
    expect(werte.liquiditaet.wert).toBe(142000);
    expect(werte.mitarbeiter.wert).toBe(2);
    expect(werte.mandate.wert).toBe(2);
    expect(werte.pipeline.wert).toBe(2_000_000);
    expect(werte.abschluesse.wert).toBe(2);
    expect(werte.provisionsquote.wert).toBe(3);
    expect(werte.forderungen.wert).toBeNull();
    expect(werte.ergebnis.wert).toBeNull();
    expect(werte.ebitda.wert).toBeNull();
    expect(werte.rohertrag.wert).toBeNull();
  });

  it("bevorzugt Monatswerte aus der BWA", () => {
    const { werte } = entwurfBerechnen(
      eingabe({
        unternehmenszahlen: [
          { quelle: "manuell", kennzahl: "umsatz", betrag: 1, dokumentRef: null },
          { quelle: "bwa", kennzahl: "umsatz", betrag: 84500, dokumentRef: "BWA 09/2026" },
          { quelle: "bwa", kennzahl: "ergebnis", betrag: 18900, dokumentRef: null },
        ],
      }),
    );
    expect(werte.umsatz.wert).toBe(84500);
    expect(werte.umsatz.quelle).toContain("BWA");
    expect(werte.ergebnis.wert).toBe(18900);
  });

  it("lässt Stichtagswerte älterer Monate leer", () => {
    const { werte } = entwurfBerechnen(eingabe({ periode: "2026-06" }));
    expect(werte.mandate.wert).toBeNull();
    expect(werte.pipeline.wert).toBeNull();
    expect(werte.abschluesse.automatisch).toBe(true);
  });

  it("erfindet ohne Daten nichts", () => {
    const { werte } = entwurfBerechnen(
      eingabe({ finanzen: null, personal: null, mandate: [], deals: [] }),
    );
    for (const w of Object.values(werte)) expect(w.wert).toBeNull();
  });

  it("lässt Planwerte leer", () => {
    const { werte } = entwurfBerechnen(eingabe({ art: "plan" }));
    for (const w of Object.values(werte)) {
      expect(w.wert).toBeNull();
      expect(w.automatisch).toBe(false);
    }
  });
});

describe("Inhalt", () => {
  const formular: BerichtFormular = {
    periode: "2026-09",
    art: "ist",
    werte: {
      umsatz: 84500,
      rohertrag: null,
      ebitda: null,
      ergebnis: 18900,
      liquiditaet: 142000,
      mitarbeiter: 6,
      mandate: 14,
      pipeline: 38_500_000,
      abschluesse: 2,
      provisionsquote: 3.1,
      forderungen: null,
    },
    kommentar: "  Lage gut  ",
  };

  it("baut das Format der Schnittstelle", () => {
    const inhalt = inhaltBauen(formular, {
      von: "Sebastian Grenz",
      am: "2026-10-05T09:12:00.000Z",
    });
    expect(inhalt).toEqual({
      version: 1,
      periode: "2026-09",
      art: "ist",
      umsatz: 84500,
      rohertrag: null,
      ebitda: null,
      ergebnis: 18900,
      liquiditaet: 142000,
      mitarbeiter: 6,
      kennzahlen: {
        mandate: 14,
        pipeline: 38_500_000,
        abschluesse: 2,
        provisionsquote: 3.1,
        forderungen: null,
      },
      kommentar: "Lage gut",
      freigegeben_von: "Sebastian Grenz",
      freigegeben_am: "2026-10-05T09:12:00.000Z",
      absender: "grenz-verwaltung",
    });
    expect(inhaltPruefen(inhalt, "2026-10-05")).toEqual([]);
  });

  it("meldet alle Fehler", () => {
    const fehler = inhaltPruefen(
      {
        version: 2,
        periode: "2026-12",
        art: "ist",
        umsatz: "viel",
        kennzahlen: { mandate: 1, kunden: 3 },
        freigegeben_von: "",
        freigegeben_am: "gestern",
        absender: "andere",
        iban: "DE00",
      },
      "2026-10-05",
    );
    expect(fehler.length).toBe(8);
  });
});
