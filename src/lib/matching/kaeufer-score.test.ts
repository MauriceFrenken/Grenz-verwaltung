import { describe, expect, it } from "vitest";

import { KEINE_SIGNALE, PUNKTE, kaeuferScore } from "./kaeufer-score";
import { bewerteProfil, type ObjektMerkmale, type ProfilZeile } from "./score";

const heute = new Date("2026-10-28");

const objekt: ObjektMerkmale = {
  objektart: "Mehrfamilienhaus",
  orte: ["Düsseldorf"],
  preis: 1_700_000,
  jahresmiete: null,
  einheiten: 9,
  baujahr: 1953,
  objektklasse: null,
};

const profil = (teil: Partial<ProfilZeile>): ProfilZeile => ({
  sf_id: "a0X",
  name: "Test",
  kontakt_sf_id: "003X",
  account_sf_id: "001X",
  assetklassen: null,
  nutzungsarten: ["Wohnen"],
  regionen: ["Düsseldorf"],
  volumen_min: 1_000_000,
  volumen_max: 5_000_000,
  faktor_max: null,
  einheiten_min: 6,
  baujahr_ab: null,
  baujahr_bis: null,
  investor_typ: null,
  ...teil,
});

const bewerte = (p: ProfilZeile, s: Partial<typeof KEINE_SIGNALE> = {}) =>
  kaeuferScore(
    objekt,
    bewerteProfil(objekt, p),
    { ...KEINE_SIGNALE, ...s },
    heute,
  );

const voll = {
  status: "aktiv",
  rueckmeldungen: 2,
  ansprechpartner: true,
  email: true,
  telefon: true,
};

describe("kaeuferScore", () => {
  it("verteilt genau 100 Punkte", () => {
    expect(Object.values(PUNKTE).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("setzt passende, aktive Investoren mit Rückmeldungen in den A-Kreis", () => {
    const b = bewerte(profil({}), voll);
    expect(b.kreis).toBe("A");
    expect(b.score).toBeGreaterThanOrEqual(80);
    expect(b.bausteine).toHaveLength(8);
    expect(b.bausteine.find((x) => x.id === "region")?.begruendung).toContain(
      "Düsseldorf",
    );
  });

  it("gleiche Passung ohne Reaktion und Kontaktdaten landet tiefer", () => {
    const a = bewerte(profil({}), voll);
    const b = bewerte(profil({}), {});
    expect(b.score).toBeLessThan(a.score);
    expect(b.kreis).not.toBe("A");
    expect(b.bausteine.find((x) => x.id === "kontakt")?.begruendung).toContain(
      "E-Mail",
    );
  });

  it("schließt DO_NOT_CONTACT, Absagen und falsche Nutzung aus", () => {
    expect(bewerte(profil({}), { ...voll, doNotContact: true })).toMatchObject({
      score: 0,
      kreis: "ausgeschlossen",
    });
    expect(
      bewerte(profil({}), { ...voll, mandatStatus: "Absage" }).ausschluss,
    ).toContain("abgesagt");
    expect(bewerte(profil({ nutzungsarten: ["Logistik"] }), voll).kreis).toBe(
      "ausgeschlossen",
    );
  });

  it("kein Interesse kostet Punkte und höchstens B-Kreis", () => {
    const b = bewerte(profil({}), { ...voll, status: "kein_interesse" });
    expect(b.kreis).toBe("B");
    expect(b.hinweise.join(" ")).toContain("Kein Interesse");
  });

  it("ohne Objektart und Region kein A-Kreis, Bemerkung zählt als Beleg", () => {
    const leer = profil({ nutzungsarten: null, regionen: null });
    expect(bewerte(leer, voll).kreis).not.toBe("A");
    const b = bewerte(leer, {
      ...voll,
      bemerkung: "MFH zum Aufteilen in Düsseldorf",
    });
    const objektart = b.bausteine.find((x) => x.id === "objektart")!;
    expect(objektart.belegt).toBe(true);
    expect(objektart.begruendung).toContain("Bemerkung");
    expect(b.bausteine.find((x) => x.id === "region")!.belegt).toBe(true);
  });

  it("fehlende Angaben zählen mit 40 Prozent", () => {
    const b = bewerte(profil({ volumen_min: null, volumen_max: null }), voll);
    const v = b.bausteine.find((x) => x.id === "volumen")!;
    expect(v.belegt).toBe(false);
    expect(v.punkte).toBe(6);
  });

  it("Preis weit außerhalb des Volumens deckelt auf C", () => {
    const b = bewerte(
      profil({ volumen_min: 10_000_000, volumen_max: 50_000_000 }),
      voll,
    );
    expect(b.kreis).toBe("C");
  });

  it("nutzt ohne Suchgebiet den NRW-Bezug der Liste oder den Firmensitz", () => {
    const ohne = profil({ regionen: null });
    const unbekannt = bewerte(ohne, {}).bausteine.find(
      (x) => x.id === "region",
    )!;
    expect(unbekannt.belegt).toBe(false);
    const nrw = bewerte(ohne, { nrwBezug: "region" }).bausteine.find(
      (x) => x.id === "region",
    )!;
    expect(nrw).toMatchObject({ belegt: true, punkte: 12 });
    const sitz = bewerte(ohne, { sitz: "Düsseldorf" }).bausteine.find(
      (x) => x.id === "region",
    )!;
    expect(sitz.begruendung).toContain("Sitz in Düsseldorf");
    expect(sitz.punkte).toBeGreaterThan(unbekannt.punkte);
  });
});
