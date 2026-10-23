import { describe, expect, it } from "vitest";

import {
  berechneExposeAnalyse,
  stadtNormalisiert,
  zahl,
  type RohExpose,
} from "./berechnen";

function expose(
  id: string,
  eingegangenAm: string,
  werte: Record<string, string | null>,
  extra: Partial<RohExpose> = {},
): RohExpose {
  return {
    id,
    eingegangenAm,
    status: "analysiert",
    absenderName: null,
    betreff: null,
    exportiertAm: null,
    felder: Object.fromEntries(
      Object.entries(werte).map(([k, v]) => [k, { value: v }]),
    ),
    ...extra,
  };
}

describe("zahl", () => {
  it("liest deutsche und englische Schreibweisen", () => {
    expect(zahl("28884.6")).toBe(28884.6);
    expect(zahl("1.234.567")).toBe(1234567);
    expect(zahl("1.234,50 €")).toBe(1234.5);
    expect(zahl("454 m²")).toBe(454);
    expect(zahl(null)).toBeNull();
    expect(zahl("k. A.")).toBeNull();
  });
});

describe("stadtNormalisiert", () => {
  it("fasst Stadtteile zur Stadt zusammen", () => {
    expect(stadtNormalisiert("Mönchengladbach-Wickrath")).toBe(
      "Mönchengladbach",
    );
    expect(stadtNormalisiert("Köln (Ehrenfeld)")).toBe("Köln");
    expect(stadtNormalisiert(null)).toBeNull();
  });
});

describe("berechneExposeAnalyse", () => {
  const daten = berechneExposeAnalyse([
    expose("a", "2026-08-20T10:00:00Z", {
      stadt: "Düsseldorf",
      objektart: "Mehrfamilienhaus",
      makler: "Hammers & Heinz",
      angebotspreis: "2000000",
      jahresnettokaltmiete: "100000",
      mietflaecheGesamt: "1000",
      baujahr: "1911",
      energieausweis: "f",
      anzahlWohnungen: "12",
    }),
    expose("b", "2026-08-27T10:00:00Z", {
      stadt: "Düsseldorf-Bilk",
      objektart: "Mehrfamilienhaus",
      makler: "Hammers & Heinz",
      jahresnettokaltmiete: "60000",
      wohnflaeche: "500",
      baujahr: "1960",
    }),
    expose(
      "c",
      "2026-09-10T10:00:00Z",
      { stadt: "Köln", objektart: "Wohnanlage" },
      { status: "exportiert", exportiertAm: "2026-09-11T00:00:00Z" },
    ),
  ]);

  it("zählt Bestand und Pipeline", () => {
    expect(daten.anzahl).toBe(3);
    expect(daten.exportiert).toBe(1);
    expect(daten.mitMiete).toBe(2);
    expect(daten.mieteGesamt).toBe(160000);
  });

  it("rechnet Faktor, Rendite und Miete je m²", () => {
    expect(daten.medianFaktor).toBe(20);
    expect(daten.medianRendite).toBe(5);
    // 100000/12/1000 = 8,33 und 60000/12/500 = 10 → Median 9,17
    expect(daten.medianMieteQm).toBeCloseTo(9.17, 1);
  });

  it("gruppiert Städte, Makler und Klassen", () => {
    expect(daten.staedte[0]).toMatchObject({ name: "Düsseldorf", anzahl: 2 });
    expect(daten.makler[0]).toMatchObject({
      name: "Hammers & Heinz",
      anzahl: 2,
    });
    expect(daten.baujahre.find((b) => b.name === "bis 1918")?.anzahl).toBe(1);
    expect(daten.energie.find((e) => e.name === "F")?.anzahl).toBe(1);
    expect(daten.groessen.find((g) => g.name === "11–20 WE")?.anzahl).toBe(1);
  });

  it("füllt Wochen ohne Eingang mit 0", () => {
    expect(daten.wochen.map((w) => w.anzahl)).toEqual([1, 1, 0, 1]);
    expect(daten.wochen[3].exportiert).toBe(1);
  });
});
