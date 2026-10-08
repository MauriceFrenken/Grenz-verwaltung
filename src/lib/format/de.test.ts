import { describe, expect, it } from "vitest";
import {
  euroKompaktTeile,
  datum,
  datumLang,
  euro,
  euroKompakt,
  euroMitVorzeichen,
  flaeche,
  monat,
  parseDeutscheZahl,
  parseDeutschesDatum,
  prozent,
  relativTage,
} from "./de";

describe("Format de-DE", () => {
  it("formatiert Beträge als 1.234,56 €", () => {
    expect(euro(1234.56)).toBe("1.234,56 €");
    expect(euro(-0.5)).toBe("-0,50 €");
    expect(euro(null)).toBe("–");
  });
  it("formatiert kompakt und mit Vorzeichen", () => {
    expect(euroKompakt(1_250_000)).toBe("1,3 Mio. €");
    expect(euroKompakt(345_000)).toBe("345 Tsd. €");
    expect(euroMitVorzeichen(10)).toBe("+10,00 €");
    expect(euroMitVorzeichen(-10)).toBe("−10,00 €");
  });
  it("formatiert Datum als TT.MM.JJJJ", () => {
    expect(datum("2026-10-07")).toBe("07.10.2026");
    expect(datum("")).toBe("–");
    expect(datumLang("2026-10-07")).toBe("Mittwoch, 7. Oktober 2026");
    expect(monat("2026-03")).toBe("März 2026");
  });
  it("formatiert Prozent und Fläche", () => {
    expect(prozent(0.0325)).toBe("3,25 %");
    expect(flaeche(72.5)).toBe("72,50 m²");
    expect(flaeche(80)).toBe("80 m²");
  });
  it("liest deutsche Zahlen und Daten", () => {
    expect(parseDeutscheZahl("1.234,56 €")).toBe(1234.56);
    expect(parseDeutscheZahl("3 %")).toBe(3);
    expect(parseDeutscheZahl("abc")).toBeNull();
    expect(parseDeutschesDatum("1.2.2026")).toBe("2026-02-01");
    expect(parseDeutschesDatum("31.02.2026")).toBeNull();
    expect(parseDeutschesDatum("2026-02-01")).toBe("2026-02-01");
  });
  it("beschreibt Fristen relativ", () => {
    expect(relativTage(0)).toBe("heute");
    expect(relativTage(5)).toBe("in 5 Tagen");
    expect(relativTage(-3)).toBe("seit 3 Tagen");
  });
});

describe("euroKompaktTeile", () => {
  it("trennt Zahl und Einheit", () => {
    expect(euroKompaktTeile(4_312_000)).toEqual({
      zahl: "4,3",
      einheit: "Mio. €",
    });
    expect(euroKompaktTeile(283_400)).toEqual({
      zahl: "283",
      einheit: "Tsd. €",
    });
    expect(euroKompaktTeile(-1_250_000)).toEqual({
      zahl: "−1,3",
      einheit: "Mio. €",
    });
    expect(euroKompaktTeile(null).einheit).toBe("");
  });
});
