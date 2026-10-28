import { describe, expect, it } from "vitest";

import {
  bundesbankCsv,
  INDIKATOREN,
  indikatorStand,
  periodeText,
  vorjahresraten,
} from "./indikatoren";

describe("bundesbankCsv", () => {
  it("liest Monats-, Quartals- und Jahreswerte und überspringt Kopf und Bemerkungen", () => {
    const csv = [
      '"";BBDY1.Q.B10.N.G175.P0910.A;BBDY1.Q.B10.N.G175.P0910.A_FLAGS',
      "Einheit;Index;",
      "2026-Q1;218,0;",
      "2026-Q2;220,0;Vorläufiger Wert",
      "2025;30,6;",
      "2026-09;2,50;Bemerkung",
      '"";Bemerkung zu 2026-09: Ab 16. September 2,50%;',
      "2026-10;.;",
    ].join("\n");
    expect(bundesbankCsv(csv)).toEqual([
      { periode: "2026-Q1", wert: 218 },
      { periode: "2026-Q2", wert: 220 },
      { periode: "2025", wert: 30.6 },
      { periode: "2026-09", wert: 2.5 },
    ]);
  });
});

describe("vorjahresraten", () => {
  it("rechnet die Veränderung zum Wert ein Jahr zuvor", () => {
    const q = [100, 101, 102, 103, 105, 106].map((wert, i) => ({
      periode: `2025-Q${(i % 4) + 1}`,
      wert,
    }));
    expect(vorjahresraten(q, "Q")).toEqual([
      { periode: "2025-Q1", wert: 5 },
      { periode: "2025-Q2", wert: 5 },
    ]);
  });
});

describe("indikatorStand", () => {
  const def = (id: string) => INDIKATOREN.find((i) => i.id === id)!;

  it("zeigt Zinsen als Wert mit Vorjahreswert", () => {
    const werte = Array.from({ length: 13 }, (_, i) => ({
      periode: `2025-${String((i % 12) + 1).padStart(2, "0")}`,
      wert: 3 + i / 100,
    }));
    werte[12] = { periode: "2026-01", wert: 3.98 };
    const s = indikatorStand(def("bauzins"), werte)!;
    expect(s.wert).toBe(3.98);
    expect(s.periode).toBe("2026-01");
    expect(s.vorjahr).toBe(3);
  });

  it("zeigt Preisindizes als Veränderung zum Vorjahr", () => {
    const werte = [
      { periode: "2024", wert: 100 },
      { periode: "2025", wert: 103 },
    ];
    const s = indikatorStand(def("mieten_neu"), werte)!;
    expect(s.wert).toBe(3);
    expect(s.vorjahr).toBeNull();
  });

  it("gibt ohne Werte null zurück", () => {
    expect(indikatorStand(def("mfh_top7"), [])).toBeNull();
  });
});

describe("periodeText", () => {
  it("schreibt Perioden deutsch aus", () => {
    expect(periodeText("2026-Q2")).toBe("2. Quartal 2026");
    expect(periodeText("2026-08")).toBe("Aug. 2026");
    expect(periodeText("2025")).toBe("2025");
  });
});

describe("startPeriode", () => {
  it("passt den Beginn an die Frequenz an", async () => {
    const { startPeriode } = await import("./indikatoren");
    expect(startPeriode("M", 2020)).toBe("2020-01");
    expect(startPeriode("Q", 2020)).toBe("2020-Q1");
    expect(startPeriode("A", 2020)).toBe("2020");
  });
});
