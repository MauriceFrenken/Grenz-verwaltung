import { describe, expect, it } from "vitest";

import type { MarktberichtDokument } from "@/lib/marktbericht/quellen";
import type { Benchmark } from "@/lib/marktbericht/typen";

import { neuesteVergleichswerte } from "./vergleichswerte";

function wert(teil: Partial<Benchmark>): Benchmark {
  return {
    id: "b",
    kennzahl: "Spitzenrendite Wohnen",
    region: "Düsseldorf",
    wert: 3.6,
    einheit: "%",
    quelle: "",
    stichtag: "2026-06-30",
    geprueft: true,
    ...teil,
  };
}

function dok(teil: Partial<MarktberichtDokument>): MarktberichtDokument {
  return {
    id: "d",
    quelleId: "jll",
    url: "https://example.org/bericht.pdf",
    titel: "Bericht",
    art: "pdf",
    stichtag: "2026-06-30",
    region: null,
    status: "ausgelesen",
    fehler: null,
    seiten: null,
    kennzahlen: [],
    gefundenAm: "2026-07-10",
    ausgelesenAm: "2026-07-10",
    ...teil,
  };
}

describe("neuesteVergleichswerte", () => {
  const namen = new Map([
    ["jll", "JLL"],
    ["bnp", "BNP Paribas RE"],
  ]);

  it("nimmt je Quelle nur den jüngsten Bericht und nur geprüfte Werte", () => {
    const werte = neuesteVergleichswerte(
      [
        dok({
          id: "alt",
          stichtag: "2025-12-31",
          kennzahlen: [wert({ wert: 3.8 })],
        }),
        dok({
          id: "neu",
          kennzahlen: [wert({}), wert({ kennzahl: "Miete", geprueft: false })],
        }),
      ],
      namen,
      "2026-10-28",
    );
    expect(werte).toHaveLength(1);
    expect(werte[0]).toMatchObject({
      wert: 3.6,
      quelle: "JLL",
      dokumentId: "neu",
    });
  });

  it("lässt Berichte älter als 18 Monate weg und sortiert Rheinland nach vorn", () => {
    const werte = neuesteVergleichswerte(
      [
        dok({
          quelleId: "bnp",
          stichtag: "2024-12-31",
          kennzahlen: [wert({})],
        }),
        dok({
          kennzahlen: [
            wert({
              region: "Deutschland",
              kennzahl: "Transaktionsvolumen Wohnen",
            }),
            wert({ region: "Köln" }),
          ],
        }),
      ],
      namen,
      "2026-10-28",
    );
    expect(werte.map((w) => w.region)).toEqual(["Köln", "Deutschland"]);
  });
});
