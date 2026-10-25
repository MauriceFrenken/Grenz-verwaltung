import { describe, expect, it } from "vitest";

import { fundeFiltern, passungRecherche, type EntdeckterInvestor } from "./entdeckung";

function fund(teil: Partial<EntdeckterInvestor>): EntdeckterInvestor {
  return {
    firma: "Rheinwohnen GmbH",
    ort: "Köln",
    webseite: null,
    typ: "Bestandshalter",
    nutzungen: ["Wohnen"],
    volumenMin: 2_000_000,
    volumenMax: 15_000_000,
    regionen: ["Köln"],
    nrw: true,
    beleg: "03/2026 Ankauf MFH in Köln",
    quelleUrl: "https://example.de/news/ankauf",
    letzteAktivitaet: null,
    ...teil,
  };
}

describe("fundeFiltern", () => {
  it("behält nur Funde mit belegter Quelle", () => {
    const r = fundeFiltern([fund({}), fund({ firma: "Andere AG", quelleUrl: "https://erfunden.de/x" })], ["https://example.de/news/ankauf/"], new Set());
    expect(r.map((f) => f.firma)).toEqual(["Rheinwohnen GmbH"]);
  });

  it("wirft bekannte Firmen und Doppelte raus", () => {
    const urls = ["https://example.de/news/ankauf"];
    expect(fundeFiltern([fund({})], urls, new Set(["rheinwohnen"]))).toHaveLength(0);
    expect(fundeFiltern([fund({}), fund({ firma: "Rheinwohnen GmbH & Co. KG" })], urls, new Set())).toHaveLength(1);
  });
});

describe("passungRecherche", () => {
  it("bewertet NRW, Wohnen, Volumen und Typ", () => {
    expect(passungRecherche(fund({}))).toBe(90);
    expect(passungRecherche(fund({ nrw: false, nutzungen: ["Büro"], volumenMin: 50_000_000, typ: null }))).toBe(0);
  });
});
