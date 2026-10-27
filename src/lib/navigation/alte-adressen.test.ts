import { describe, expect, it } from "vitest";

import { neueAdresse } from "./alte-adressen";

describe("neueAdresse", () => {
  it("führt alte Akquise-Seiten auf die zusammengelegte Seite", () => {
    expect(neueAdresse("/verkaeufer")).toEqual({ pfad: "/akquise/radar" });
    expect(
      neueAdresse("/verkaeufer", new URLSearchParams("tab=salesforce")),
    ).toEqual({ pfad: "/akquise/potenzial" });
    expect(neueAdresse("/akquise/salesforce")).toEqual({ pfad: "/akquise" });
    expect(neueAdresse("/akquise/salesforce/anschreiben/")).toEqual({
      pfad: "/akquise/anschreiben",
    });
    expect(neueAdresse("/akquise/salesforce/wiedervorlagen")).toEqual({
      pfad: "/aufgaben",
    });
  });

  it("führt alte Reiter der Mandatsakte zum Exposé", () => {
    expect(neueAdresse("/mandate/a0X1/bewertung")).toEqual({
      pfad: "/mandate/a0X1",
    });
    expect(neueAdresse("/mandate/a0X1/exposes")).toEqual({
      pfad: "/mandate/a0X1/expose",
    });
    expect(neueAdresse("/mandate/a0X1/dokument/42")).toEqual({
      pfad: "/mandate/a0X1/expose",
    });
  });

  it("kennt Kennzahlen-Ziele mit Reiter und lässt Unbekanntes in Ruhe", () => {
    expect(neueAdresse("/ebics")).toEqual({
      pfad: "/kennzahlen",
      suche: { tab: "liquiditaet" },
    });
    expect(neueAdresse("/gibt-es-nicht")).toBeNull();
    expect(neueAdresse("/mandate/a0X1/interessenten")).toBeNull();
  });
});
