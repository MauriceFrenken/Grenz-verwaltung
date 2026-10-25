import { describe, expect, it } from "vitest";

import {
  findeSfTreffer,
  normalisiereFirma,
  normalisiereUrl,
  pruefeFunde,
} from "./abgleich";
import type { RadarFund } from "./typen";

const fund = (teil: Partial<RadarFund>): RadarFund => ({
  akteur: "Beispiel Invest GmbH",
  akteurTyp: "Family Office",
  ereignis: "Kauft Wohnportfolio in Düsseldorf",
  transaktion: "Ankauf",
  objektart: "Mehrfamilienhaus",
  ort: "Düsseldorf",
  volumenEur: 12_000_000,
  ereignisAm: "2026-10-20",
  quelleUrl: "https://www.example.de/news/artikel-1",
  quelleTitel: "Artikel",
  quelleMedium: "Example",
  relevanz: 80,
  begruendung: "Passt zu Grenz",
  ...teil,
});

describe("normalisiereFirma", () => {
  it("entfernt Rechtsform und Branchenwörter", () => {
    expect(normalisiereFirma("Aurelis Real Estate GmbH & Co. KG")).toBe(
      "aurelis",
    );
    expect(normalisiereFirma("DIE Wohnbau AG")).toBe("die wohnbau");
  });
});

describe("findeSfTreffer", () => {
  const kontakte = [
    { sfId: "001A", name: "Aurelis Real Estate GmbH", firma: null },
    { sfId: "003B", name: "Max Muster", firma: "Rheinische Wohnwerte GmbH" },
    { sfId: "001C", name: "ABC AG", firma: null },
  ];

  it("findet gleichen Namen trotz anderer Rechtsform", () => {
    expect(findeSfTreffer("Aurelis Asset GmbH", kontakte)?.sfId).toBe("001A");
  });

  it("findet die Firma eines Kontakts", () => {
    expect(findeSfTreffer("Rheinische Wohnwerte", kontakte)?.sfId).toBe("003B");
  });

  it("trifft kurze Kürzel nicht als Teil", () => {
    expect(findeSfTreffer("ABC Wohnen Holding", kontakte)).toBeNull();
  });

  it("liefert null ohne Treffer", () => {
    expect(findeSfTreffer("Unbekannt Capital", kontakte)).toBeNull();
  });
});

describe("normalisiereUrl", () => {
  it("entfernt Fragment, Tracking und Schrägstrich", () => {
    expect(normalisiereUrl("https://x.de/a/?utm_source=nl&id=3#top")).toBe(
      "https://x.de/a?id=3",
    );
  });

  it("lehnt andere Protokolle ab", () => {
    expect(normalisiereUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("pruefeFunde", () => {
  const belegt = ["https://www.example.de/news/artikel-1/"];

  it("behält belegte Funde und begrenzt Werte", () => {
    const { gueltig, verworfen } = pruefeFunde(
      [fund({ relevanz: 140, volumenEur: -1, ereignisAm: "Oktober" })],
      belegt,
    );
    expect(verworfen).toBe(0);
    expect(gueltig[0]).toMatchObject({
      relevanz: 100,
      volumenEur: null,
      ereignisAm: null,
      quelleUrl: "https://www.example.de/news/artikel-1",
    });
  });

  it("verwirft erfundene Quellen und Dubletten", () => {
    const { gueltig, verworfen } = pruefeFunde(
      [
        fund({}),
        fund({ akteur: "Beispiel Invest AG" }),
        fund({ quelleUrl: "https://erfunden.de/x" }),
      ],
      belegt,
    );
    expect(gueltig).toHaveLength(1);
    expect(verworfen).toBe(2);
  });
});
