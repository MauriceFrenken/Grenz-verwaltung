import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import {
  baumaschinenPruefFaelle,
  handelAuswerten,
  maschinenKennzahlen,
  plattformAuswerten,
} from "./baumaschinen";
import { importiereMaschinen } from "./import";

const STICHTAG = "2026-10-08";
const daten = erzeugeSeed(STICHTAG);

describe("Baumaschinenhandel", () => {
  it("rechnet Lagerwert nur über den Bestand (ohne Einkauf und Verkauft)", () => {
    const h = handelAuswerten(daten);
    const erwartet = h.maschinen
      .filter(
        (k) =>
          k.machine.status !== "verkauft" && k.machine.status !== "einkauf",
      )
      .reduce((s, k) => s + k.einstand, 0);
    expect(h.lagerwert).toBeCloseTo(erwartet, 2);
    expect(h.bestand.every((k) => k.machine.status !== "verkauft")).toBe(true);
  });

  it("Rohertrag einer verkauften Maschine = Verkaufspreis − Einstand", () => {
    const m = daten.machines.find((x) => x.status === "verkauft")!;
    const k = maschinenKennzahlen(m, daten.machineCosts, STICHTAG);
    expect(k.rohertrag).toBeCloseTo(m.verkaufspreis! - k.einstand, 2);
    expect(k.ampel).toBe("grau");
  });

  it("meldet Maschinen ab 180 Lagertagen als Prüffall", () => {
    const faelle = baumaschinenPruefFaelle(daten);
    for (const f of faelle) {
      const m = daten.machines.find((x) => x.id === f.refId)!;
      const k = maschinenKennzahlen(m, daten.machineCosts, STICHTAG);
      expect(k.lagerTage).toBeGreaterThanOrEqual(180);
    }
  });
});

describe("Plattform", () => {
  it("liefert je Plattform-Gesellschaft eine Auswertung", () => {
    const p = plattformAuswerten(daten);
    const anzahl = daten.companies.filter(
      (c) => c.segment === "baumaschinen_plattform",
    ).length;
    expect(p).toHaveLength(anzahl);
    for (const x of p) {
      if (x.bestand != null && x.burnRate)
        expect(x.runwayMonate).toBeCloseTo(x.bestand / x.burnRate, 0);
    }
  });
});

describe("Maschinen-Import", () => {
  const handel = daten.companies.filter(
    (c) => c.segment === "baumaschinen_handel",
  );
  const kontext = {
    companies: handel,
    vorhandeneIds: ["BM-2026-004"],
    stichtag: STICHTAG,
  };

  it("vergibt fehlende IDs fortlaufend und liest deutsche Zahlen und Daten", () => {
    const r = importiereMaschinen(
      [
        {
          Gesellschaft: handel[0].shortName,
          Hersteller: "Muster",
          Modell: "B 1",
          Status: "Lager",
          "Ankauf am": "01.09.2026",
          Einkaufspreis: "45.000,00",
        },
      ],
      kontext,
    );
    expect(r.fehler).toEqual([]);
    expect(r.gueltig[0].id).toBe("BM-2026-005");
    expect(r.gueltig[0].einkaufspreis).toBe(45000);
    expect(r.gueltig[0].ankaufAm).toBe("2026-09-01");
    expect(r.neu).toEqual(["BM-2026-005"]);
  });

  it("meldet fehlende Pflichtangaben je Zeile", () => {
    const r = importiereMaschinen(
      [{ Hersteller: "Muster", Modell: "B 2", Status: "verkauft" }],
      { ...kontext, companies: handel.slice(0, 1) },
    );
    expect(r.gueltig).toHaveLength(0);
    const felder = r.fehler.map((f) => f.feld);
    expect(felder).toContain("Ankauf am");
    expect(felder).toContain("Verkaufspreis");
  });
});
