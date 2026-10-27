import { describe, expect, it } from "vitest";

import type { Angabe, ExposeDaten } from "@/lib/ki-tools/typen";

import {
  exposeDateiname,
  fotosFuerExpose,
  freigabeGesperrt,
  pflichtangaben,
  salesforceUnterlage,
  unterlagenFuerExpose,
} from "./expose";
import type { OrdnerDatei } from "./ordner";

const datei = (
  name: string,
  kategorie: OrdnerDatei["kategorie"],
  geaendertAm = "2026-10-01",
): OrdnerDatei => ({
  id: name,
  name,
  unterordner: "",
  groesse: 1000,
  geaendertAm,
  webUrl: null,
  kategorie,
});

const a = <T>(wert: T | null): Angabe<T> => ({
  wert,
  beleg: null,
  geprueft: false,
});

function daten(teil: Partial<ExposeDaten> = {}): ExposeDaten {
  const leer = a<string>(null);
  const zahl = a<number>(null);
  return {
    objekt: {
      objektart: a("Wohn- und Geschäftshaus"),
      strasse: a("Bilker Allee 112"),
      plz: a("40217"),
      ort: a("Düsseldorf"),
      stadtteil: leer,
    },
    titelzeile: leer,
    kaufpreis: a(2_560_000),
    mieteJahrIst: a(120_000),
    mieteJahrSoll: zahl,
    vermietungsstand: zahl,
    provision: "kaeufer",
    grundstueck: zahl,
    bodenrichtwert: leer,
    flaecheGesamt: a(900),
    wohneinheiten: zahl,
    flaecheWohnen: zahl,
    gewerbeeinheiten: zahl,
    flaecheGewerbe: zahl,
    sonstigeFlaechen: zahl,
    stellplaetze: zahl,
    baujahr: leer,
    geschosse: leer,
    bauweise: leer,
    geschossdecken: leer,
    fenster: leer,
    heizsystem: leer,
    energietraeger: leer,
    baujahrHeizung: leer,
    balkone: leer,
    aufzug: leer,
    dachgeschoss: leer,
    denkmalschutz: leer,
    besonderheiten: [],
    mieter: [],
    erreichbarkeit: [],
    mikrolage: leer,
    ausweistyp: leer,
    energiekennwert: leer,
    effizienzklasse: leer,
    ...teil,
  };
}

describe("salesforceUnterlage", () => {
  it("schreibt belegbare Zeilen mit Seitenmarke", () => {
    const u = salesforceUnterlage(
      {
        kaufpreis: { wert: "2.560.000", quelle: null },
        adresse: { wert: "Bilker Allee 112, 40217 Düsseldorf", quelle: null },
      },
      "M-10053",
    );
    expect(u?.text).toContain("<<<PAGE 1>>>");
    expect(u?.text).toContain("Kaufpreis (€): 2.560.000");
    expect(u?.name).toBe("Salesforce M-10053");
  });

  it("liefert nichts ohne Werte", () => {
    expect(salesforceUnterlage({}, "M-1")).toBeNull();
  });
});

describe("Auswahl aus dem Objektordner", () => {
  it("nimmt altes Exposé und Mieterliste zuerst, je Kategorie höchstens zwei", () => {
    const auswahl = unterlagenFuerExpose([
      datei("Grundbuch.pdf", "grundbuch"),
      datei("Mieterliste.xlsx", "mieterliste"),
      datei("Expose alt.pdf", "expose", "2025-01-01"),
      datei("Expose neu.pdf", "expose", "2026-01-01"),
      datei("Expose ganz alt.pdf", "expose", "2020-01-01"),
      datei("Foto.jpg", "fotos"),
    ]);
    expect(auswahl.map((d) => d.name)).toEqual([
      "Expose neu.pdf",
      "Expose alt.pdf",
      "Mieterliste.xlsx",
      "Grundbuch.pdf",
    ]);
  });

  it("stellt das Titelbild vor Grundrisse", () => {
    const fotos = fotosFuerExpose([
      datei("Grundriss EG.png", "fotos"),
      datei("Innen 1.jpg", "fotos"),
      datei("Fassade.jpg", "fotos"),
      datei("Mieterliste.pdf", "mieterliste"),
    ]);
    expect(fotos.map((d) => d.name)).toEqual([
      "Fassade.jpg",
      "Innen 1.jpg",
      "Grundriss EG.png",
    ]);
  });
});

describe("pflichtangaben", () => {
  it("sperrt die Freigabe ohne Kaufpreis, warnt bei fehlendem Energieausweis", () => {
    const punkte = pflichtangaben(daten({ kaufpreis: a<number>(null) }));
    expect(freigabeGesperrt(punkte)).toEqual(["Kaufpreis"]);
    const energie = punkte.find((p) => p.label.startsWith("Energieausweis"));
    expect(energie?.ok).toBe(false);
    expect(energie?.sperrt).toBe(false);
  });

  it("ist vollständig mit allen Angaben", () => {
    const punkte = pflichtangaben(
      daten({
        ausweistyp: a("Verbrauchsausweis"),
        energiekennwert: a("132 kWh/(m²*a)"),
        energietraeger: a("Gas"),
        baujahr: a("1905"),
        effizienzklasse: a("E"),
      }),
    );
    expect(punkte.every((p) => p.ok)).toBe(true);
  });
});

it("benennt Dateien nach Straße und Version", () => {
  expect(
    exposeDateiname(
      { tool: "expose", daten: daten(), hinweise: [], verworfen: 0 },
      2,
      "pdf",
    ),
  ).toBe("GrenzCo_Expose_Bilker_Allee_112_v2.pdf");
});
