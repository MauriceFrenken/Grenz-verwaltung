import { describe, expect, it } from "vitest";

import {
  historieTreffer,
  marktPassung,
  nutzungsNaehe,
  regionsNaehe,
  type MandatKurz,
  type RadarKaeufer,
} from "./zusatz";

const objekt = {
  objektart: "Mehrfamilienhaus",
  orte: ["Düsseldorf", "Stadtbezirk 3"],
  preis: 2_175_000,
};

describe("Nähe", () => {
  it("vergleicht Nutzungen", () => {
    expect(nutzungsNaehe("Mehrfamilienhaus", "Wohnportfolio (Altbau)")).toBe(1);
    expect(nutzungsNaehe("Mehrfamilienhaus", "Wohn-und Geschäftshaus")).toBe(1);
    expect(nutzungsNaehe("Mehrfamilienhaus", "Logistikimmobilie")).toBe(0);
    expect(nutzungsNaehe("Mehrfamilienhaus", null)).toBeNull();
  });

  it("vergleicht Regionen", () => {
    expect(regionsNaehe(objekt.orte, "Düsseldorf-Flingern")).toBe(1);
    expect(regionsNaehe(objekt.orte, "NRW (Rheinland, Ruhrgebiet)")).toBe(0.6);
    expect(regionsNaehe(objekt.orte, "Bielefeld und Hamm")).toBe(0);
    expect(regionsNaehe(objekt.orte, "bundesweit")).toBe(0.3);
  });
});

describe("marktPassung", () => {
  const basis: RadarKaeufer = {
    id: "1",
    akteur: "Benini Real Estate",
    akteurTyp: "Bestandshalter",
    ereignis: "Kauf MFH",
    objektart: "Mehrfamilienhaus",
    ort: "Düsseldorf-Flingern",
    volumenEur: null,
    ereignisAm: "2026-10-20",
    createdAt: "2026-10-25T04:00:00Z",
    relevanz: 90,
    quelleUrl: "https://example.org/a",
    quelleTitel: null,
    quelleMedium: null,
    sfKontaktSfId: null,
    sfBekanntAls: null,
    status: "neu",
  };

  it("bewertet passende Käufer hoch und Logistik niedrig", () => {
    const heute = new Date("2026-10-25");
    const gut = marktPassung(basis, objekt, heute);
    const schlecht = marktPassung(
      {
        ...basis,
        objektart: "Logistikimmobilie",
        ort: "Köln-Marsdorf",
        relevanz: 20,
      },
      objekt,
      heute,
    );
    expect(gut.score).toBe(92);
    expect(gut.gruende).toContain("aktiv in Düsseldorf-Flingern");
    expect(schlecht.score).toBeLessThan(30);
  });
});

describe("historieTreffer", () => {
  const mandate = new Map<string, MandatKurz>([
    [
      "A",
      {
        sfId: "A",
        name: "M-1",
        objektart: "Mehrfamilienhaus",
        ort: "Düsseldorf",
        preis: 2_000_000,
      },
    ],
    [
      "B",
      {
        sfId: "B",
        name: "M-2",
        objektart: "Bürogebäude",
        ort: "Köln",
        preis: 9_000_000,
      },
    ],
    [
      "X",
      {
        sfId: "X",
        name: "M-aktuell",
        objektart: "Mehrfamilienhaus",
        ort: "Düsseldorf",
        preis: 2_175_000,
      },
    ],
  ]);

  it("rankt Interessenten ähnlicher Mandate und lässt das aktuelle Mandat aus", () => {
    const t = historieTreffer(
      objekt,
      "X",
      [
        {
          kontaktSfId: "k1",
          mandatSfId: "A",
          stufe: "Kaufangebot",
          datum: null,
        },
        { kontaktSfId: "k1", mandatSfId: "A", stufe: "Interesse", datum: null },
        { kontaktSfId: "k2", mandatSfId: "B", stufe: "Interesse", datum: null },
        { kontaktSfId: "k3", mandatSfId: "X", stufe: "Interesse", datum: null },
      ],
      mandate,
    );
    expect(t.map((x) => x.kontaktSfId)).toEqual(["k1", "k2"]);
    expect(t[0].score).toBe(100);
    expect(t[0].objekte[0].stufe).toBe("Kaufangebot");
    expect(t[1].score).toBeLessThan(30);
  });
});
