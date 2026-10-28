import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { einschaetzungErstellen } from "@/lib/ki-tools/dateien/powerpoint";
import type { VergleichMitAbstand } from "@/lib/ki-tools/vergleiche";

import {
  eingabeAusSalesforce,
  einschaetzungDaten,
  STANDARD_EINSTELLUNGEN,
  vergleicheFuerFolie,
  wertindikation,
  type BewertungsEingabe,
  type BewertungsEntscheidung,
  type MarktReferenz,
} from "./bewertung";

const DUS = { lat: 51.2277, lng: 6.7735 };

const eingabe: BewertungsEingabe = {
  bezeichnung: "Bilker Allee 112",
  strasse: "Bilker Allee 112",
  plz: "40217",
  ort: "Düsseldorf",
  objektart: "Wohn- und Geschäftshaus",
  baujahr: 1958,
  grundstueck: 420,
  wohneinheiten: 9,
  gewerbeeinheiten: 1,
  flaecheWohnen: 640,
  flaecheGewerbe: 110,
  flaecheGesamt: null,
  mieteJahrIst: 112_000,
  mieteJahrSoll: 124_000,
  besonderheiten: ["Gewerbe im EG langfristig vermietet"],
  ...DUS,
};

const v = (
  id: string,
  p: Partial<VergleichMitAbstand>,
): VergleichMitAbstand => ({
  quelleId: id,
  quelle: "expose",
  preisart: "angebot",
  stichtag: "2026-08-01",
  adresse: `Musterstraße ${id}`,
  plz: "40215",
  ort: "Düsseldorf",
  objektart: "Wohn- und Geschäftshaus",
  baujahr: 1960,
  einheiten: 8,
  flaeche: 700,
  kaufpreis: 2_100_000,
  jahresmiete: 100_000,
  lat: DUS.lat + 0.01,
  lng: DUS.lng,
  km: 1.1,
  faktor: 21,
  preisM2: 3000,
  ...p,
});

const pool = [
  v("k1", {
    preisart: "kauf",
    quelle: "salesforce_deal",
    kaufpreis: 2_000_000,
    jahresmiete: 105_000,
  }),
  v("k2", {
    preisart: "kauf",
    quelle: "salesforce_deal",
    kaufpreis: 1_900_000,
    jahresmiete: 98_000,
  }),
  v("k3", {
    preisart: "kauf",
    quelle: "salesforce_deal",
    kaufpreis: 2_200_000,
    jahresmiete: 112_000,
  }),
  v("a1", { kaufpreis: 2_400_000 }),
  v("a2", { kaufpreis: 2_300_000 }),
  v("a3", { kaufpreis: 2_500_000 }),
];

const markt: MarktReferenz = {
  berichtId: "m1",
  titel: "Marktbericht 1. Halbjahr 2026",
  stichtag: "2026-06-30",
  teilmarkt: "Düsseldorf",
  faktor: { median: 21.7, p25: 19.8, p75: 23.4, n: 14 },
  preisM2: null,
  mieteM2: null,
  benchmarks: [],
};

const entscheidung: BewertungsEntscheidung = {
  empfaenger: "Familie Muster",
  datum: "2026-10-27",
  preisGrenz: null,
  preisAnmerkung: "",
  preisEigentuemer: 2_600_000,
  zusammenfassung: null,
  vorgehen: null,
};

const jetzt = new Date("2026-10-27T12:00:00Z");

describe("Bewertung Mandatsakte", () => {
  it("Vorbelegung aus Salesforce mit Herkunft", () => {
    const {
      eingabe: e,
      herkunft,
      preisEigentuemer,
    } = eingabeAusSalesforce(
      { sf_id: "a0M1", name: "M-0042" },
      {
        sf_id: "a011",
        strasse: "Bilker Allee 112",
        plz: "40217",
        ort: "Düsseldorf",
        wohnflaeche_m2: 640,
        jahresnettokaltmiete: 112000,
        geo_lat: 51.2,
        geo_lng: 6.7,
        sf_daten: { Purchase_price_expectations__c: 2600000 },
      },
    );
    expect(e.bezeichnung).toBe("Bilker Allee 112");
    expect(e.flaecheWohnen).toBe(640);
    expect(e.lat).toBe(51.2);
    expect(herkunft.mieteJahrIst).toContain("Rental_income__c");
    expect(herkunft.flaecheGewerbe).toBeUndefined();
    expect(preisEigentuemer).toBe(2_600_000);
  });

  it("Kaufpreise wiegen doppelt, Marktbericht fließt als Angebotsniveau ein", () => {
    const ind = wertindikation(
      eingabe,
      pool,
      [],
      markt,
      STANDARD_EINSTELLUNGEN,
      jetzt,
    );
    const ids = ind.methoden.map((m) => m.id);
    expect(ids).toContain("faktor-kauf");
    expect(ids).toContain("faktor-angebot");
    expect(ids).toContain("markt-faktor");
    expect(ind.methoden.find((m) => m.id === "faktor-kauf")!.gewicht).toBe(2);
    expect(ind.spanne).not.toBeNull();
    expect(ind.spanne!.min).toBeLessThan(ind.spanne!.max);
    expect(ind.vorschlag! % 50_000).toBe(0);
    // Markt: 21,7 × 112.000 € = 2,43 Mio. €
    expect(
      ind.methoden.find((m) => m.id === "markt-faktor")!.wert.mittel,
    ).toBeCloseTo(2_430_400, -2);
  });

  it("Ausgeschlossene Vergleiche zählen nicht, Abschlag nur auf Angebote", () => {
    const ohne = wertindikation(
      eingabe,
      pool,
      ["k1", "k2"],
      null,
      STANDARD_EINSTELLUNGEN,
      jetzt,
    );
    expect(ohne.methoden.some((m) => m.id === "faktor-kauf")).toBe(false);
    const mit = wertindikation(
      eingabe,
      pool,
      [],
      markt,
      {
        ...STANDARD_EINSTELLUNGEN,
        abschlagProzent: 10,
        abschlagGesetztVon: "Test",
      },
      jetzt,
    );
    const ohneAbschlag = wertindikation(
      eingabe,
      pool,
      [],
      markt,
      STANDARD_EINSTELLUNGEN,
      jetzt,
    );
    const kauf = (i: typeof mit) =>
      i.methoden.find((m) => m.id === "faktor-kauf")!.wert.mittel;
    const ang = (i: typeof mit) =>
      i.methoden.find((m) => m.id === "markt-faktor")!.wert.mittel;
    expect(kauf(mit)).toBe(kauf(ohneAbschlag));
    expect(ang(mit)).toBeCloseTo(ang(ohneAbschlag) * 0.9, 0);
  });

  it("Ohne Miete und Fläche keine Spanne", () => {
    const ind = wertindikation(
      {
        ...eingabe,
        mieteJahrIst: null,
        flaecheWohnen: null,
        flaecheGewerbe: null,
      },
      pool,
      [],
      markt,
      STANDARD_EINSTELLUNGEN,
      jetzt,
    );
    expect(ind.spanne).toBeNull();
    expect(ind.vorschlag).toBeNull();
  });

  it("Folie zeigt gewählte Vergleiche, sonst Kaufpreise zuerst", () => {
    const ind = wertindikation(
      eingabe,
      pool,
      [],
      markt,
      STANDARD_EINSTELLUNGEN,
      jetzt,
    );
    expect(
      vergleicheFuerFolie(ind.vergleiche, null).every(
        (x) => x.preisart === "kauf",
      ),
    ).toBe(true);
    expect(
      vergleicheFuerFolie(ind.vergleiche, ["a2"]).map((x) => x.quelleId),
    ).toEqual(["a2"]);
  });

  it("Einschätzung in der Original-Vorlage", async () => {
    const ind = wertindikation(
      eingabe,
      pool,
      [],
      markt,
      STANDARD_EINSTELLUNGEN,
      jetzt,
    );
    const d = einschaetzungDaten(
      eingabe,
      ind,
      markt,
      STANDARD_EINSTELLUNGEN,
      entscheidung,
      null,
    );
    expect(d.objekte[0].preisGrenz.wert).toBe(ind.vorschlag);
    expect(d.zusammenfassung.length).toBeGreaterThan(1);
    const vorlage = new Uint8Array(
      readFileSync(
        join(__dirname, "..", "ki-tools", "vorlagen", "einschaetzung.pptx"),
      ),
    );
    const datei = await einschaetzungErstellen(vorlage, d, []);
    const ausgabe = process.env.KI_TOOLS_AUSGABE;
    if (ausgabe) {
      mkdirSync(ausgabe, { recursive: true });
      writeFileSync(join(ausgabe, "bewertung-einschaetzung.pptx"), datei);
    }
    const zip = await JSZip.loadAsync(datei);
    const folie7 = await zip.file("ppt/slides/slide7.xml")!.async("string");
    expect(folie7).toContain("Familie Muster");
    expect(folie7).not.toContain("Rentmeister");
    const folie1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(folie1).toContain("Bilker Allee 112");
    expect(folie1).not.toContain("Kronenstraße");
  });
});
