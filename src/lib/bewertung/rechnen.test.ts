import { describe, expect, it } from "vitest";

import {
  bewerte,
  kmZwischen,
  quantil,
  type BewertungsObjekt,
  type Vergleich,
} from "./rechnen";

const KOELN = { lat: 50.9375, lng: 6.9603 };

const v = (id: string, p: Partial<Vergleich>): Vergleich => ({
  quelleId: id,
  quelle: "expose",
  preisart: "angebot",
  stichtag: "2026-06-01",
  adresse: null,
  plz: null,
  ort: "Köln",
  objektart: "Mehrfamilienhaus",
  baujahr: null,
  einheiten: null,
  flaeche: 1000,
  kaufpreis: 2_000_000,
  jahresmiete: 100_000,
  lat: KOELN.lat + 0.01,
  lng: KOELN.lng,
  ...p,
});

const objekt: BewertungsObjekt = {
  bezeichnung: "MFH Köln",
  objektart: "Mehrfamilienhaus",
  flaeche: 800,
  jahresmiete: 90_000,
  baujahr: 1965,
  einheiten: 10,
  ...KOELN,
};

const jetzt = new Date("2026-10-24T00:00:00Z");

describe("Hilfen", () => {
  it("Entfernung und Quantil", () => {
    expect(Math.round(kmZwischen(KOELN, { lat: 51.2277, lng: 6.7735 }))).toBe(
      35,
    ); // Düsseldorf
    expect(quantil([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantil([10, 20], 0.25)).toBe(12.5);
  });
});

describe("bewerte", () => {
  const daten = [
    v("a", { kaufpreis: 1_800_000 }), // Faktor 18, 1.800 €/m²
    v("b", { kaufpreis: 2_000_000 }), // 20
    v("c", { kaufpreis: 2_200_000 }), // 22
    v("fern", { lat: 51.2277, lng: 6.7735 }), // Düsseldorf, außerhalb 10 km
    v("buero", { objektart: "Bürogebäude" }),
    v("alt", { stichtag: "2020-01-01" }),
  ];

  it("filtert nach Entfernung, Nutzung und Alter und rechnet Spannen", () => {
    const e = bewerte(objekt, daten, undefined, jetzt);
    expect(e.vergleiche.map((x) => x.quelleId).sort()).toEqual(["a", "b", "c"]);
    const faktor = e.verfahren.find((x) => x.verfahren === "faktor")!;
    expect(faktor.basis).toBe("angebot");
    expect(faktor.kennwert).toEqual({ min: 19, mittel: 20, max: 21 });
    expect(faktor.wert.mittel).toBe(1_800_000);
    expect(faktor.wertNachAbschlag).toBeNull();
    expect(e.hinweise.join(" ")).toContain("Kein Abschlag gesetzt");
    expect(e.hinweise[0]).toContain("Kein Verkehrswertgutachten");
  });

  it("wendet einen Abschlag nur an, wenn er gesetzt ist", () => {
    const e = bewerte(
      objekt,
      daten,
      {
        radiusKm: 10,
        maxAlterMonate: 36,
        abschlagProzent: 10,
        abschlagGesetztVon: "Sebastian Grenz",
      },
      jetzt,
    );
    const faktor = e.verfahren.find((x) => x.verfahren === "faktor")!;
    expect(faktor.wertNachAbschlag?.mittel).toBe(1_620_000);
    expect(e.hinweise.join(" ")).toContain("gesetzt von Sebastian Grenz");
  });

  it("bevorzugt Kaufpreise vor Angeboten im Ergebnis", () => {
    const kauf = ["k1", "k2", "k3"].map((id, i) =>
      v(id, {
        preisart: "kauf",
        quelle: "objekt",
        kaufpreis: 1_500_000 + i * 100_000,
      }),
    );
    const e = bewerte(objekt, [...daten, ...kauf], undefined, jetzt);
    const kaufFaktor = e.verfahren.find(
      (x) => x.verfahren === "faktor" && x.basis === "kauf",
    )!;
    expect(kaufFaktor.anzahl).toBe(3);
    expect(e.ergebnis!.max).toBeLessThanOrEqual(1_500_000);
  });

  it("liefert keine Spanne bei zu wenig Vergleichen", () => {
    const e = bewerte(objekt, [v("a", {})], undefined, jetzt);
    expect(e.ergebnis).toBeNull();
    expect(e.hinweise.join(" ")).toContain("Weniger als 3");
  });
});
