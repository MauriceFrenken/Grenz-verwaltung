import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import type {
  Angabe,
  DcfDaten,
  ExposeDaten,
  KaufpreisDaten,
  MarktpreisDaten,
  Mieteinheit,
  MieterlisteDaten,
  Objekt,
} from "../typen";
import {
  dcfErstellen,
  kaufpreistoolErstellen,
  mietaufstellungErstellen,
} from "./excel";
import {
  einschaetzungErstellen,
  exposeErstellen,
  geschossAusName,
  type BildDatei,
} from "./powerpoint";

const vorlage = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, "..", "vorlagen", name)));
const ausgabe = process.env.KI_TOOLS_AUSGABE;
const ablegen = (name: string, daten: Uint8Array) => {
  if (!ausgabe) return;
  mkdirSync(ausgabe, { recursive: true });
  writeFileSync(join(ausgabe, name), daten);
};

const a = <T>(wert: T | null): Angabe<NonNullable<T>> =>
  ({
    wert: wert as NonNullable<T> | null,
    beleg: { art: "nutzer", hinweis: "Test" },
    geprueft: true,
  }) as Angabe<never>;

const objekt: Objekt = {
  objektart: a("Wohn- und Geschäftshaus"),
  strasse: a("Alter Grenzweg 39-41"),
  plz: a("51375"),
  ort: a("Leverkusen"),
  stadtteil: a("Schlebusch"),
};

const einheit = (
  lage: string,
  nutzung: Mieteinheit["nutzung"],
  flaeche: number | null,
  miete: number,
  extra: Partial<Mieteinheit> = {},
): Mieteinheit => ({
  lage,
  mieter: "",
  nutzung,
  belegung: "vermietet",
  flaeche,
  kaltmieteIst: miete,
  kaltmieteSoll: null,
  betriebskosten: null,
  heizkosten: null,
  vertragBeginn: null,
  laufzeit: "",
  info: "",
  beleg: null,
  geprueft: true,
  ...extra,
});

const einheiten: Mieteinheit[] = [
  einheit("39 EG li", "Wohnen", 65, 660),
  einheit("39 EG re", "Wohnen", 65, 409.58, {
    vertragBeginn: "2022-01-01",
    info: "Indexiert",
  }),
  einheit("39 1.OG li", "Wohnen", 65, 750),
  einheit("39 1.OG re", "Gewerbe", 58.75, 650, { mieter: "Praxis Dr. Muster" }),
  einheit("39 DG", "Wohnen", 58.75, 0, {
    belegung: "leer",
    kaltmieteSoll: 700,
  }),
  einheit("Stellplatz 1", "Stellplatz", null, 25),
  einheit("Garage 1", "Garagenstellplatz", null, 70),
];

function png(): BildDatei {
  // 1x1 PNG
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  return {
    name: "foto.png",
    daten: new Uint8Array(Buffer.from(b64, "base64")),
    endung: "png",
    breite: 1600,
    hoehe: 1000,
  };
}

describe("Excel-Ausgaben", () => {
  it("Mietaufstellung mit beliebiger Zeilenzahl und verschobenen Summenformeln", async () => {
    const d: MieterlisteDaten = { objekt, kaufpreis: a(1_975_000), einheiten };
    const datei = await mietaufstellungErstellen(
      vorlage("mietaufstellung.xlsx"),
      d,
    );
    ablegen("mietaufstellung.xlsx", datei);
    const zip = await JSZip.loadAsync(datei);
    const blatt = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const letzte = 6 + einheiten.length; // 13
    expect(blatt).toContain(`COUNTIF($G$7:$G$${letzte},"Wohnen")`);
    expect(blatt).toContain(`<c r="J${41 - 26 + einheiten.length}"`);
    expect(blatt).not.toContain("$G$32");
    expect(zip.file("xl/calcChain.xml")).toBeNull();
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain(
      'fullCalcOnLoad="1"',
    );
  });

  it("Kaufpreistool füllt die gelben Felder", async () => {
    const d: KaufpreisDaten = {
      objekt,
      flaecheWohnen: a(971.55),
      flaecheGewerbe: a(null),
      mieteMonatIst: a(17_517.23),
      mieteMonatSoll: a(null),
      marktmieteWohnen: a(25),
      marktmieteGewerbe: a(null),
      basisKaufpreis: a(4_000_000),
      schritt: a(200_000),
    };
    const datei = await kaufpreistoolErstellen(
      vorlage("kaufpreistool.xlsx"),
      d,
    );
    ablegen("kaufpreistool.xlsx", datei);
    const blatt = await (await JSZip.loadAsync(datei))
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    expect(blatt).toContain("Alter Grenzweg 39-41, 51375 Leverkusen");
    expect(blatt).toMatch(/<c r="B11" s="6"><v>4000000<\/v><\/c>/);
  });

  it("DCF im Grenz-Stil", async () => {
    const d = {
      objekt,
      kaufpreis: a(1_975_000),
      flaeche: a(1015),
      mieteJahrIst: a(124_513),
      mieteJahrMarkt: a(140_000),
      einheiten: a(16),
      mietsteigerung: a(0.02),
      anpassungJahre: a(5),
      mietausfall: a(0.02),
      verwaltungProEinheit: a(420),
      instandhaltungM2: a(14),
      nichtUmlagefaehig: a(0.01),
      kostensteigerung: a(0.02),
      diskontierung: a(0.05),
      exitFaktor: a(16),
      haltedauer: a(10),
      grunderwerbsteuer: a(0.065),
      notarGrundbuch: a(0.02),
      makler: a(0.0595),
    } as DcfDaten;
    const datei = await dcfErstellen(vorlage("mietaufstellung.xlsx"), d);
    ablegen("dcf.xlsx", datei);
    const blatt = await (await JSZip.loadAsync(datei))
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    expect(blatt).toContain("IRR(B46:L46)");
  });
});

describe("PowerPoint-Ausgaben", () => {
  it("Exposé aus der Grenz-Vorlage", async () => {
    const d: ExposeDaten = {
      objekt,
      titelzeile: a("Wohn- und Geschäftshaus\nin Schlebusch"),
      kaufpreis: a(1_975_000),
      mieteJahrIst: a(null),
      mieteJahrSoll: a(null),
      vermietungsstand: a(null),
      provision: "kaeufer",
      grundstueck: a(1400),
      bodenrichtwert: a("520 €/m² (01.01.2026)"),
      flaecheGesamt: a(null),
      wohneinheiten: a(null),
      flaecheWohnen: a(null),
      gewerbeeinheiten: a(null),
      flaecheGewerbe: a(null),
      sonstigeFlaechen: a(null),
      stellplaetze: a(null),
      baujahr: a("1962"),
      geschosse: a("4"),
      bauweise: a("Massiv"),
      geschossdecken: a(null),
      fenster: a("Kunststoff / doppelt verglast"),
      heizsystem: a("Zentralheizung"),
      energietraeger: a("Gas"),
      baujahrHeizung: a("2018"),
      balkone: a(null),
      aufzug: a("Nein"),
      dachgeschoss: a(null),
      denkmalschutz: a("Nein"),
      besonderheiten: [
        a("Ruhige Seitenstraße"),
        a("Gaszentralheizung aus 2018"),
      ],
      mieter: einheiten,
      erreichbarkeit: [
        {
          ziel: "Hauptbahnhof Leverkusen",
          minuten: 12,
          verkehrsmittel: "ÖPNV",
          beleg: null,
          geprueft: false,
        },
      ],
      mikrolage: a("Schlebusch liegt im Nordosten von Leverkusen."),
      ausweistyp: a("Verbrauchsausweis"),
      energiekennwert: a("132 kWh/(m²*a)"),
      effizienzklasse: a("E"),
    };
    const bilder = [
      png(),
      { ...png(), name: "Grundriss EG.png" },
      { ...png(), name: "foto2.png" },
    ];
    const datei = await exposeErstellen(vorlage("expose.pptx"), d, bilder);
    ablegen("expose.pptx", datei);
    const zip = await JSZip.loadAsync(datei);
    const praes = await zip.file("ppt/presentation.xml")!.async("string");
    const anzahl = (praes.match(/<p:sldId /g) ?? []).length;
    expect(anzahl).toBeGreaterThan(8);
    const folie1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(folie1).toContain("Alter Grenzweg 39-41");
  });

  it("Vermarktungseinschätzung aus der Grenz-Vorlage", async () => {
    const o = {
      bezeichnung: "Alter Grenzweg 39-41",
      grundstueck: a(1400),
      wohneinheiten: a(13),
      gewerbeeinheiten: a("3 (Praxis, Büro)"),
      flaecheWohnen: a(832.5),
      flaecheGewerbe: a(182.5),
      mieteJahrIst: a(124_513),
      mieteJahrSoll: a(130_000),
      mieteM2Wohnen: a(9.55),
      mieteM2Gewerbe: a(8.73),
      besonderheiten: ["Mietsteigerungspotenzial", "Gepflegter Zustand"],
      preisGrenz: a(2_000_000),
      preisAnmerkung: "Stellplätze enthalten",
      preisEigentuemer: a(2_300_000),
    };
    const d: MarktpreisDaten = {
      empfaenger: "Familie Muster",
      datum: "2026-10-25",
      untertitel: "Wohn- und Geschäftshaus in Leverkusen-Schlebusch",
      objekte: [o],
      vergleiche: [
        {
          adresse: "Musterstraße 1, Leverkusen",
          objektart: "Wohnhaus",
          flaeche: 640,
          mieteJahr: 80_000,
          preis: 1_600_000,
          preisart: "kauf",
          datum: "2026-03-01",
          einordnung: ["Gepflegter Zustand"],
          beleg: { art: "web", url: "https://www.example.org/a", titel: null },
          geprueft: true,
        },
        {
          adresse: "Beispielweg 5, Leverkusen",
          objektart: "Wohn- und Geschäftshaus",
          flaeche: 900,
          mieteJahr: 110_000,
          preis: 2_100_000,
          preisart: "angebot",
          datum: null,
          einordnung: ["Seit 6 Monaten am Markt"],
          beleg: null,
          geprueft: false,
        },
      ],
      zusammenfassung: ["Einschätzung im Rahmen der Vergleichsobjekte"],
      vorgehen: ["Exklusive Beauftragung", "Strukturierter Bieterprozess"],
      intern: null,
    };
    const datei = await einschaetzungErstellen(
      vorlage("einschaetzung.pptx"),
      d,
      [png()],
    );
    ablegen("einschaetzung.pptx", datei);
    const zip = await JSZip.loadAsync(datei);
    expect(zip.file("ppt/slides/slide3.xml")).toBeNull();
    const folie7 = await zip.file("ppt/slides/slide7.xml")!.async("string");
    expect(folie7).toContain("2,0 Mio. €");
    expect(folie7).not.toContain("Marienstraße");
  });

  it("Geschoss aus Dateinamen", () => {
    expect(geschossAusName("Grundriss_2.OG.pdf")).toBe("2. OBERGESCHOSS");
    expect(geschossAusName("grundriss eg.jpg")).toBe("ERDGESCHOSS");
  });
});
