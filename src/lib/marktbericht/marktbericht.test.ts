import { describe, expect, it } from "vitest";

import {
  angebotAus,
  angebotsmarkt,
  kaeuferindex,
  objektartGruppe,
  verteilung,
  volumenband,
  zahlAus,
  type ExposeZeile,
} from "./auswertung";
import { kacheln, kennzahlenText, unbelegteZahlen } from "./bericht";
import { bundesbankCsvWerte, zinsStand } from "./bundesbank";
import { quellenGenannt } from "./ki";
import { deutschland, standortZeilen } from "./standorte";
import { teilmarktAus } from "./teilmarkt";
import type { Benchmark, MarktberichtKennzahlen } from "./typen";

function expose(datum: string, f: Record<string, string | null>): ExposeZeile {
  return {
    eingegangen_am: `${datum}T08:00:00Z`,
    felder: Object.fromEntries(
      Object.entries(f).map(([k, v]) => [k, { value: v }]),
    ),
  };
}

describe("zahlAus", () => {
  it("liest deutsche Zahlen", () => {
    expect(zahlAus("2.560.000 €")).toBe(2_560_000);
    expect(zahlAus("rd. 454,5 m²")).toBe(454.5);
    expect(zahlAus("51346")).toBe(51346);
    expect(zahlAus("auf Anfrage")).toBeNull();
    expect(zahlAus(null)).toBeNull();
  });
});

describe("teilmarktAus", () => {
  it("ordnet nach Ort und PLZ zu", () => {
    expect(teilmarktAus("Köln", "51065")).toBe("Köln");
    expect(teilmarktAus("Düsseldorf", null)).toBe("Düsseldorf");
    expect(teilmarktAus(null, "40479")).toBe("Düsseldorf");
    expect(teilmarktAus("Leichlingen", "42799")).toBe("Übriges Rheinland");
    expect(teilmarktAus("Bergkamen", "59192")).toBe("Übriges NRW");
    expect(teilmarktAus("Mönchengladbach", null)).toBe("Übriges Rheinland");
    expect(teilmarktAus("Berlin", "10115")).toBe("Sonstige");
    expect(teilmarktAus(null, null)).toBe("Sonstige");
  });
});

describe("verteilung", () => {
  it("weist unter der Mindestfallzahl nichts aus", () => {
    expect(verteilung([20, 21, 22, 23])).toBeNull();
  });
  it("berechnet Median und Quartile", () => {
    expect(verteilung([18, 20, 22, 24, 26])).toEqual({
      median: 22,
      p25: 20,
      p75: 24,
      n: 5,
    });
  });
});

describe("angebotAus", () => {
  it("berechnet Faktor, Preis und Miete je m²", () => {
    const a = angebotAus(
      expose("2026-09-01", {
        stadt: "Köln",
        plz: "51065",
        angebotspreis: "1.200.000 €",
        jahresnettokaltmiete: "51.346 €",
        mietflaecheGesamt: "454",
        objektart: "Mehrfamilienhaus",
      }),
    );
    expect(a.teilmarkt).toBe("Köln");
    expect(a.faktor).toBeCloseTo(23.37, 2);
    expect(a.preisM2).toBeCloseTo(2643.17, 1);
    expect(a.mieteM2).toBeCloseTo(9.42, 2);
  });
  it("verwirft unplausible Faktoren", () => {
    const a = angebotAus(
      expose("2026-09-01", {
        angebotspreis: "1.200.000",
        jahresnettokaltmiete: "4.000",
      }),
    );
    expect(a.faktor).toBeNull();
  });
});

describe("angebotsmarkt", () => {
  it("gruppiert nach Teilmarkt und Periode", () => {
    const zeilen = Array.from({ length: 6 }, (_, i) =>
      expose("2026-03-0" + (i + 1), {
        stadt: "Düsseldorf",
        angebotspreis: String(2_000_000 + i * 100_000),
        jahresnettokaltmiete: "100000",
        mietflaecheGesamt: "800",
        objektart: i % 2 ? "Wohn- und Geschäftshaus" : "MFH",
      }),
    );
    zeilen.push(
      expose("2025-03-01", {
        stadt: "Köln",
        angebotspreis: "1000000",
        jahresnettokaltmiete: "50000",
      }),
    );
    const m = angebotsmarkt(
      zeilen,
      "2026-01-01",
      "2026-06-30",
      "2025-01-01",
      "2025-06-30",
    );
    const dus = m.zeilen.find((z) => z.teilmarkt === "Düsseldorf")!;
    expect(dus.angebote).toBe(6);
    expect(dus.faktor?.median).toBeCloseTo(22.5, 5);
    expect(m.zeilen.at(-1)!.teilmarkt).toBe("Gesamt");
    expect(m.vorperiode?.angebote).toBe(1);
    expect(m.vorperiode?.faktor).toBeNull();
    expect(m.objektarten).toEqual([
      { label: "Mehrfamilienhaus", wert: 3 },
      { label: "Wohn- und Geschäftshaus", wert: 3 },
    ]);
    expect(m.ersterEingang).toBe("2025-03-01");
  });
});

describe("objektartGruppe", () => {
  it("vereinheitlicht Bezeichnungen", () => {
    expect(objektartGruppe("Wohn-und Geschäftshaus")).toBe(
      "Wohn- und Geschäftshaus",
    );
    expect(objektartGruppe("Wohnanlage")).toBe("Mehrfamilienhaus");
    expect(objektartGruppe("Geschäftshaus")).toBe("Gewerbe");
    expect(objektartGruppe(null)).toBe("Ohne Angabe");
  });
});

describe("kaeuferindex", () => {
  it("zählt Volumenbänder und Regionen, ignoriert Kleinstbeträge", () => {
    expect(volumenband(null, 100_000)).toBeNull();
    expect(volumenband(1_500_000, 15_000_000)).toBe("10 bis 25 Mio. €");
    const k = kaeuferindex([
      {
        regionen: ["Köln", "Bonn"],
        assetklassen: ["Core (fertiges Produkt)"],
        investor_typ: "Family Office",
        volumen_min: "1500000",
        volumen_max: "15000000",
      },
      {
        regionen: ["Düsseldorf"],
        assetklassen: ["Value Add", "Core"],
        investor_typ: null,
        volumen_min: null,
        volumen_max: "3000000",
      },
      {
        regionen: [],
        assetklassen: [],
        investor_typ: null,
        volumen_min: null,
        volumen_max: "100000",
      },
    ]);
    expect(k.profile).toBe(3);
    expect(k.mitVolumen).toBe(2);
    expect(k.volumenbaender.map((v) => v.label)).toEqual([
      "2,5 bis 5 Mio. €",
      "10 bis 25 Mio. €",
    ]);
    expect(k.regionen.find((r) => r.label === "Köln")?.wert).toBe(1);
    expect(k.assetklassen.find((a) => a.label === "Core")?.wert).toBe(2);
  });
});

describe("Bundesbank", () => {
  const csv = `"";BBIM1.M.DE.B.A2C.P.R.A.2250.EUR.N;
Einheit;% p.a.;
2025-03;3,60;
2025-04;3,65;
2026-03;3,74;`;
  it("liest die CSV und rechnet die Veränderung in bp", () => {
    const werte = bundesbankCsvWerte(csv);
    expect(werte).toHaveLength(3);
    const s = zinsStand({
      id: "bauzins",
      label: "Bauzins",
      quelle: "",
      reihe: "",
      einheit: "%",
      werte,
    });
    expect(s).toEqual({ wert: 3.74, monat: "2026-03", deltaBp: 14 });
  });
});

describe("Prüfung der KI-Texte", () => {
  it("findet Zahlen, die nicht in den Kennzahlen stehen", () => {
    const kontext = "Faktor Median 21,4; Preis 2.540 €/m²; 2026";
    expect(
      unbelegteZahlen(
        "Der Faktor liegt bei 21,4 und 2.540 €/m² im Jahr 2026, in 3 Teilmärkten.",
        kontext,
      ),
    ).toEqual([]);
    expect(unbelegteZahlen("Faktor 22,9 statt 21,4.", kontext)).toEqual([
      "22,9",
    ]);
  });
});

function bm(
  kennzahl: string,
  region: string,
  wert: number,
  einheit: string,
  relevanz = 90,
  extra: Partial<Benchmark> = {},
): Benchmark {
  return {
    id: `${kennzahl}-${region}-${wert}`,
    kennzahl,
    region,
    wert,
    einheit,
    quelle: "Fremdes Haus",
    stichtag: "2026-06-30",
    geprueft: true,
    relevanz,
    ...extra,
  };
}

const KENNZAHLEN = {
  periode: { jahr: 2026, art: "H1" },
  von: "2026-01-01",
  bis: "2026-06-30",
  stichtag: "2026-06-30",
  vorlaeufig: false,
  angebot: {
    zeilen: [
      {
        teilmarkt: "Köln",
        angebote: 16,
        mitPreis: 7,
        faktor: { median: 23.6, p25: 21, p75: 23.9, n: 7 },
        preisM2: { median: 3000, p25: 2500, p75: 3200, n: 7 },
        mieteM2: null,
        volumen: 0,
      },
      {
        teilmarkt: "Gesamt",
        angebote: 36,
        mitPreis: 36,
        faktor: { median: 21.36, p25: 19, p75: 24, n: 32 },
        preisM2: { median: 2544, p25: 2000, p75: 3000, n: 36 },
        mieteM2: null,
        volumen: 0,
      },
    ],
    objektarten: [],
    vorperiode: null,
    ersterEingang: "2026-08-20",
  },
  zinsen: { reihen: [], fehler: null },
  kaeufer: {
    profile: 214,
    mitVolumen: 122,
    regionen: [],
    volumenbaender: [],
    assetklassen: [],
    investorTypen: [],
    medianVolumenMax: 10_000_000,
  },
  vermarktung: {
    neueMandate: 3,
    abschluesse: 1,
    abschlussVolumen: 0,
    verloren: 4,
  },
  vermarktungVorperiode: {
    neueMandate: 2,
    abschluesse: 0,
    abschlussVolumen: 0,
    verloren: 1,
  },
  radar: { kaeufer: 0, verkaeufer: 0, auswahl: [] },
} as unknown as MarktberichtKennzahlen;

const WERTE = [
  bm("Rohertragsfaktor Mietwohnhausgrundstücke 2025", "Köln", 21, "Faktor", 95),
  bm(
    "Marktübliche Einstiegsfaktoren Mehrfamilienhaus Bestand",
    "Düsseldorf",
    18,
    "Faktor (Spanne 18–21)",
  ),
  bm("Bereinigter Kaufpreis Mietwohnhausgrundstücke", "Köln", 2991, "€/m²"),
  bm(
    "Durchschnittlicher Kaufpreis Mietwohnhäuser (Liegenschaftszinsauswertung)",
    "Bonn",
    2544,
    "€/m²",
  ),
  bm("Median-Angebotsmiete Neuvermietung Wohnen", "Köln", 17.01, "€/m²", 92, {
    veraenderung: "+4,5% y/y",
  }),
  bm(
    "Ø-Angebotsmiete Bestandswohnungen Altstadt",
    "Düsseldorf-Altstadt",
    18.14,
    "€/m²",
  ),
  bm("Spitzenrendite Büro", "Köln", 4.6, "%"),
  bm("Transaktionsvolumen Zinshäuser", "Köln", 1.07, "Mrd. €", 100),
  bm("Spitzenrendite Wohnen", "Top-7", 3.4, "%", 70),
];

describe("Standorte", () => {
  it("ordnet Vergleichswerte den Städten und Kennzahlen zu", () => {
    const [koeln, duesseldorf, bonn] = standortZeilen(KENNZAHLEN, WERTE);
    expect(koeln.markt.faktor?.text).toBe("21,0");
    expect(koeln.markt.kaufpreis?.text).toBe("2.991 €/m²");
    expect(koeln.markt.miete?.veraenderung).toBe("+4,5% y/y");
    expect(koeln.markt.umsatz?.text).toBe("1,07 Mrd. €");
    expect(koeln.markt.rendite).toBeUndefined();
    expect(koeln.bruttorendite).toBe(4.2);
    expect(duesseldorf.markt.faktor?.text).toBe("18–21");
    // Stadtteilwerte zählen nicht für die Stadt.
    expect(duesseldorf.markt.miete).toBeUndefined();
    expect(bonn.markt.kaufpreis?.text).toBe("2.544 €/m²");
    expect(bonn.markt.liegenschaftszins).toBeUndefined();
    expect(deutschland(WERTE).rendite?.text).toBe("3,4 %");
  });

  it("Kacheln und KI-Kontext nennen keine fremden Herausgeber", () => {
    const liste = kacheln(KENNZAHLEN, WERTE);
    expect(liste.length).toBeLessThanOrEqual(6);
    expect(liste[0]).toMatchObject({
      wert: "21,0",
      label: "Kaufpreisfaktor Köln",
    });
    expect(liste.some((k) => k.label === "Bruttorendite im Angebot")).toBe(
      true,
    );
    expect(JSON.stringify(liste)).not.toContain("Fremdes Haus");
    const kontext = kennzahlenText(KENNZAHLEN, WERTE);
    expect(kontext).not.toContain("Fremdes Haus");
    expect(kontext).not.toContain("Mandate");
    expect(kontext).toContain("Bruttorendite 4,2 %");
  });
});

describe("quellenGenannt", () => {
  it("findet fremde Quellen, aber nicht „lautet“", () => {
    expect(
      quellenGenannt({
        einleitung: "Laut JLL steigen die Mieten.",
        ausblick: "Unsere These lautet: stabile Faktoren.",
      }),
    ).toHaveLength(1);
    expect(
      quellenGenannt({ angebot: "Der Gutachterausschuss meldet Faktor 21." }),
    ).toHaveLength(1);
    expect(quellenGenannt({ angebot: "Wir sehen Faktor 21 in Köln." })).toEqual(
      [],
    );
  });

  it("prüft auch die Kernaussagen über den Abschnitten", () => {
    expect(
      quellenGenannt({
        schlagzeilen: { angebot: "Savills sieht Köln vor Düsseldorf" },
      }),
    ).toHaveLength(1);
  });
});
