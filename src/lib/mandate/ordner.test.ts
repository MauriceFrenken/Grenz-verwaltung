import { describe, expect, it } from "vitest";

import {
  besteOrdner,
  dateienFuerSteckbrief,
  kategorieFuer,
  normalisiereName,
  ordnerScore,
  zerlegeStrasse,
  type OrdnerDatei,
} from "./ordner";

const bilker = {
  strasse: "Bilker Allee 112",
  plz: "40217",
  ort: "Düsseldorf",
  mandatName: "M-10053",
};

describe("Adresse", () => {
  it("zerlegt Straße und Hausnummer", () => {
    expect(zerlegeStrasse("Bilker Allee 112")).toEqual({
      name: "Bilker Allee",
      nummer: "112",
    });
    expect(zerlegeStrasse("Im Hederichsfeld 14-16")).toEqual({
      name: "Im Hederichsfeld",
      nummer: "14",
    });
    expect(zerlegeStrasse("Moltkestraße 97a").nummer).toBe("97");
  });

  it("normalisiert Umlaute und Straße", () => {
    expect(normalisiereName("Jägerstraße 6")).toBe("jaegerstr 6");
    expect(normalisiereName("Duesseldorf_Jaegerstrasse-6")).toBe(
      "duesseldorf jaegerstr 6",
    );
  });
});

describe("ordnerScore", () => {
  const k = (name: string, pfad = "/00_Gruppe/02_Akquise") => ({
    id: name,
    name,
    pfad,
    webUrl: null,
    geaendertAm: null,
  });

  it("bevorzugt den aktuellen Ordner vor dem Archiv", () => {
    const aktuell = ordnerScore(k("Duesseldorf_Bilker-Allee-112"), bilker);
    const archiv = ordnerScore(
      k(
        "100. Bilker Alle 112, Düsseldorf",
        "/00_Gruppe/02_Akquise/99_Archiv/Akquise_Objekte_alt",
      ),
      bilker,
    );
    expect(aktuell).toBe(90);
    expect(archiv).toBeGreaterThanOrEqual(50);
    expect(archiv).toBeLessThan(aktuell);
  });

  it("ignoriert fremde Straßen", () => {
    expect(ordnerScore(k("Duesseldorf_Jaegerstrasse-6"), bilker)).toBe(0);
  });

  it("erkennt ASCII-Schreibweise der Straße", () => {
    expect(
      ordnerScore(k("Koeln_Bruehler-Strasse-1"), {
        strasse: "Brühler Straße 1",
        plz: null,
        ort: "Köln",
        mandatName: null,
      }),
    ).toBe(90);
  });

  it("sortiert und filtert Kandidaten", () => {
    const liste = besteOrdner(
      [k("Duesseldorf_Jaegerstrasse-6"), k("Duesseldorf_Bilker-Allee-112")],
      bilker,
    );
    expect(liste.map((x) => x.name)).toEqual(["Duesseldorf_Bilker-Allee-112"]);
  });
});

describe("Unterlagen", () => {
  it("ordnet Dateien ein", () => {
    expect(kategorieFuer("Kalkulation_DCF-Bilker-Allee-112.xlsx")).toBe(
      "kalkulation",
    );
    expect(kategorieFuer("Energieausweis 2024.pdf")).toBe("energieausweis");
    expect(kategorieFuer("Mieterliste_Stand_10-2026.xlsx")).toBe("mieterliste");
    expect(kategorieFuer("IMG_1234.HEIC")).toBe("fotos");
    expect(kategorieFuer("Wirtschaftsplan 2026.pdf")).toBe("betriebskosten");
    expect(kategorieFuer("EG.pdf", "03_Grundrisse")).toBe("plaene");
    expect(kategorieFuer("notiz.docx")).toBe("sonstiges");
  });

  it("wählt lesbare Unterlagen in fester Reihenfolge", () => {
    const d = (
      name: string,
      kategorie: OrdnerDatei["kategorie"],
      geaendertAm = "2026-01-01",
    ): OrdnerDatei => ({
      id: name,
      name,
      unterordner: "",
      groesse: 1000,
      geaendertAm,
      webUrl: null,
      kategorie,
    });
    const auswahl = dateienFuerSteckbrief([
      d("a.jpg", "fotos"),
      d("Kalkulation.xlsx", "kalkulation"),
      d("Expose_alt.pdf", "expose", "2025-01-01"),
      d("Expose_neu.pdf", "expose", "2026-05-01"),
      d("Expose_mittel.pdf", "expose", "2025-06-01"),
    ]);
    expect(auswahl.map((x) => x.name)).toEqual([
      "Expose_neu.pdf",
      "Expose_mittel.pdf",
      "Kalkulation.xlsx",
    ]);
  });
});
