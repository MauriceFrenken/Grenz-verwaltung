import { describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));

import { anreicherungsVorschlaege, quellenErgaenzung, type InvestorBestand, type PruefErgebnis } from "./pruefung";

const ergebnis = (teil: Partial<PruefErgebnis> = {}): PruefErgebnis => ({
  schluessel: "acc:001A",
  status: "aktiv",
  begruendung: "Website aktiv.",
  quelleUrl: "https://firma.de",
  webseite: "https://firma.de",
  ankaufsprofilUrl: "https://firma.de/ankauf",
  ankaufsprofilKurz: "Wohnen in NRW ab 5 Mio. €",
  aktiv2026: true,
  letzteAktivitaet: null,
  profil: { nutzungen: ["Wohnen", "Logistik"], volumenMin: 5_000_000, volumenMax: 30_000_000, regionen: ["NRW"], faktorMax: 22, einheitenMin: null },
  kontakte: [
    { name: "Anna Muster", funktion: "Leiterin Ankauf", email: "A.Muster@firma.de", telefon: "+49 211 1", quelleUrl: "https://firma.de/team" },
    { name: null, funktion: null, email: "ankauf@firma.de", telefon: null, quelleUrl: "https://firma.de/kontakt" },
  ],
  ...teil,
});

const bestand = (teil: Partial<InvestorBestand> = {}): InvestorBestand => ({
  acc: "001A",
  firma: "Firma GmbH",
  profilSfId: null,
  nutzungen: [],
  volumenMin: null,
  volumenMax: null,
  faktorMax: null,
  einheitenMin: null,
  bekannteEmails: new Set(),
  ...teil,
});

describe("anreicherungsVorschlaege", () => {
  it("schlägt ohne Ankaufsprofil ein neues vor, nur mit Salesforce-Nutzungsarten", () => {
    const v = anreicherungsVorschlaege(ergebnis(), bestand());
    const profil = v.find((x) => x.art === "neues_profil")!;
    expect(profil.schluessel).toBe("web_profil:001A");
    expect(profil.neuer_wert).toMatchObject({ nutzungen: ["Wohnen"], volumen_min: 5_000_000, faktor_max: 22 });
    expect(profil.beleg).toContain("https://firma.de/ankauf");
  });

  it("füllt bei vorhandenem Profil nur leere Kriterien", () => {
    const v = anreicherungsVorschlaege(ergebnis(), bestand({ profilSfId: "a0X1", nutzungen: ["Wohnen"], faktorMax: 20 }));
    expect(v.map((x) => x.feld).sort()).toEqual(["kontakt", "kontakt", "volumen"]);
    expect(v.find((x) => x.feld === "volumen")).toMatchObject({ profil_sf_id: "a0X1", neuer_wert: { min: 5_000_000, max: 30_000_000 } });
  });

  it("schlägt nur neue E-Mails als Ansprechpartner vor", () => {
    const v = anreicherungsVorschlaege(ergebnis(), bestand({ bekannteEmails: new Set(["a.muster@firma.de"]) }));
    const kontakte = v.filter((x) => x.feld === "kontakt");
    expect(kontakte).toHaveLength(1);
    expect(kontakte[0].schluessel).toBe("web_kontakt:001A:ankauf@firma.de");
  });

  it("keine Vorschläge für insolvente Firmen", () => {
    expect(anreicherungsVorschlaege(ergebnis({ status: "insolvenz" }), bestand())).toEqual([]);
  });
});

describe("quellenErgaenzung", () => {
  it("vereint E-Mails und füllt nur leere Felder", () => {
    const neu = quellenErgaenzung(ergebnis(), {
      emails: ["info@firma.de"], telefon: null, webseite: "https://firma.de", nutzungen: [], volumen_min: null, volumen_max: null,
    });
    expect(neu).toEqual({
      emails: ["info@firma.de", "a.muster@firma.de", "ankauf@firma.de"],
      telefon: "+49 211 1",
      nutzungen: ["Wohnen", "Logistik"],
      volumen_min: 5_000_000,
      volumen_max: 30_000_000,
    });
  });
});
