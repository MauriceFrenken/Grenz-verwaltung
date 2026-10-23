import { describe, expect, it } from "vitest";

import { berechneMakler, type Datenstand } from "./berechnen";

const staende: Datenstand[] = [
  {
    schluessel: "mandate",
    stand: "2026-10-23",
    quelle: "Import.xlsx · SF Mandate",
    daten: [
      {
        mandat: "M-1",
        phase: "Beauftragung",
        objekt: "A",
        expose_preis_eur: 2000000,
        prognose_provision_eur: 100000,
        erstellt: "2026-02-01",
      },
      {
        mandat: "M-2",
        phase: "Beauftragung",
        objekt: "B",
        erstellt: "2026-05-01",
      },
      { mandat: "M-3", phase: "Gewonnen", erstellt: "2025-07-10" },
      { mandat: "M-4", phase: "Verloren", erstellt: "2025-08-10" },
      { mandat: "M-5", phase: "Verloren", erstellt: "2025-08-11" },
      { mandat: "M-6", erstellt: "2025-08-12" },
      {
        mandat: "T",
        phase: "Gewonnen",
        ist_test: true,
        erstellt: "2025-08-12",
      },
    ],
  },
  {
    schluessel: "mandate",
    stand: "2026-01-01",
    quelle: "alt",
    daten: [{ mandat: "ALT", phase: "Gewonnen" }],
  },
  {
    schluessel: "deals",
    stand: "2026-10-23",
    quelle: null,
    daten: [
      {
        name: "Opp. X",
        phase: "Invoice Paid",
        kaufpreis_eur: 1000000,
        close_date: "2025-08-01",
      },
      { name: "Opp. Y", phase: "Closed Lost", close_date: "2025-09-01" },
      { name: "Opp. Z", phase: "Data Room", close_date: "2026-08-31" },
    ],
  },
  {
    schluessel: "kampagnen",
    stand: "2026-10-23",
    quelle: null,
    daten: [
      {
        name: "Vermarktung A",
        kontakte: 10,
        Gesendet: 5,
        Interesse: 2,
        Kaufangebot: 1,
        Absage: 2,
      },
      { name: "Weihnachtskarte", kontakte: 20, Gesendet: 20 },
    ],
  },
];

describe("berechneMakler", () => {
  const d = berechneMakler(staende, "2026-10-23");

  it("nimmt je Schlüssel nur den jüngsten Stand und ignoriert Tests", () => {
    expect(d.pipeline.map((p) => p.mandat)).toEqual(["M-1", "M-2"]);
    expect(d.phasen.find((p) => p.phase === "Gewonnen")?.anzahl).toBe(1);
    expect(d.phasen.find((p) => p.phase === "ohne Phase")?.anzahl).toBe(1);
  });

  it("rechnet Pipeline und Gewinnquote", () => {
    expect(d.kacheln.pipelineProvision).toBe(100000);
    expect(d.kacheln.beauftragtOhnePreis).toBe(1);
    expect(d.kacheln.gewinnquote).toBe(33);
    expect(d.kacheln.offeneDeals).toBe(1);
    expect(d.dealsJeJahr).toEqual([
      { jahr: "2025", kaufpreis: 1000000, gewonnen: 1, verloren: 1 },
    ]);
  });

  it("baut den Vermarktungs-Funnel kumulativ, nur aus Vermarktungen", () => {
    expect(d.funnel.map((f) => f.anzahl)).toEqual([10, 5, 3, 1, 1]);
  });
});
