import { describe, expect, it } from "vitest";

import {
  dublettenPaare,
  kriterienAusBemerkung,
  statusAus,
  typAusText,
  typAusWert,
  verdichteRegionen,
} from "./bereinigung";

const heute = new Date("2026-10-25T12:00:00Z");
const basis = {
  gesperrt: false,
  letzterKontaktAm: null,
  letzteRueckmeldungAm: null,
  letzteMarktaktivitaetAm: null,
  dealsOffen: 0,
  absagen: 0,
  interesse: 0,
  heute,
};

describe("Investorentyp", () => {
  it("liest Salesforce-Werte inklusive Tippfehler", () => {
    expect(typAusWert("Institiutionell")).toBe("Institutionell/Versicherung");
    expect(typAusWert("Multi Family Office")).toBe("Family Office");
    expect(typAusWert("Projektenwickler")).toBe("Projektentwickler");
    expect(typAusWert("")).toBeNull();
  });

  it("leitet den Typ aus dem Firmennamen ab", () => {
    expect(typAusText("Aachener Grundvermögen Kapitalverwaltungsgesellschaft mbH", null)?.typ).toBe("Fonds/KVG");
    expect(typAusText("Kontora Family Office GmbH", null)?.typ).toBe("Family Office");
    expect(typAusText("GWH Wohnungsgesellschaft mbH Hessen", null)?.typ).toBe("Bestandshalter");
    expect(typAusText("Peter Miebach", null)?.typ).toBe("Privat");
  });

  it("hält Unternehmensgruppen nicht für Privatpersonen", () => {
    expect(typAusText("Clees Unternehmensgruppe", null)).toBeNull();
  });

  it("schließt aus einer gesuchten Projektentwicklung nicht auf den Typ", () => {
    expect(typAusText("Cube Real Estate AG", "Grundstücke für Projektentwicklung")).toBeNull();
  });
});

describe("Kriterien aus dem Bemerkungsfeld", () => {
  it("findet Faktor, Einheiten, Grundstück und BGF mit Beleg", () => {
    expect(kriterienAusBemerkung("Bestand mit Potenzial bis Faktor 16,5 , möglichst wenig Gewerbe").faktorMax).toEqual({
      wert: 16.5,
      beleg: "Faktor 16,5",
    });
    expect(kriterienAusBemerkung("Lebensmittelgeankerter Einzelhandel bis 12 fach").faktorMax?.wert).toBe(12);
    expect(kriterienAusBemerkung("entwicklungsfähiger Bestand ab 60 Einheiten").einheitenMin?.wert).toBe(60);
    expect(kriterienAusBemerkung("Grundstücke ab 3000 m2 für Reihenhausbau").grundstueckAbM2?.wert).toBe(3000);
    expect(kriterienAusBemerkung("Projektentwicklungen ab 5000 m2 BGF").bgfAbM2?.wert).toBe(5000);
  });

  it("ignoriert unplausible Faktoren", () => {
    expect(kriterienAusBemerkung("Faktor 2").faktorMax).toBeUndefined();
  });
});

describe("Regionen verdichten", () => {
  it("fasst vollständige Bezirke zusammen", () => {
    const koeln =
      "Köln , Bonn , Leverkusen , Aachen , Kreis Aachen , Kreis Düren , Rhein-Erft-Kreis , Kreis Euskirchen , Kreis Heinsberg , Oberbergischer Kreis , Rheinisch-Bergischer Kreis , Rhein-Sieg-Kreis ,";
    expect(verdichteRegionen({ Search_Kreis_kreisfreie_Stadt__c: `${koeln} Kreis Mettmann` })).toEqual({
      ebene: "kreis",
      kurz: ["Bezirk Köln", "Kreis Mettmann"],
    });
    expect(verdichteRegionen({ Search_Kreis_kreisfreie_Stadt__c: koeln })).toEqual({
      ebene: "regierungsbezirk",
      kurz: ["Bezirk Köln"],
    });
  });

  it("nimmt Gemeinden, wenn keine Kreise gepflegt sind", () => {
    expect(verdichteRegionen({ Search_Stadt_Gemeinde__c: "Leichlingen ,Leichlingen , Burscheid" })).toEqual({
      ebene: "gemeinde",
      kurz: ["Leichlingen", "Burscheid"],
    });
  });
});

describe("Status", () => {
  it("zählt nur Rückmeldungen, nicht reines Anschreiben", () => {
    expect(statusAus({ ...basis, letzterKontaktAm: new Date("2026-09-01") }).status).toBe("ruhend");
    expect(statusAus({ ...basis, letzteRueckmeldungAm: new Date("2026-09-01") }).status).toBe("aktiv");
    expect(statusAus({ ...basis, letzteRueckmeldungAm: new Date("2025-01-01") }).status).toBe("ruhend");
  });

  it("sperrt bei DO NOT CONTACT und erkennt reine Absagen", () => {
    expect(statusAus({ ...basis, gesperrt: true, dealsOffen: 1 }).status).toBe("gesperrt");
    expect(statusAus({ ...basis, absagen: 2 }).status).toBe("kein_interesse");
  });
});

describe("Dubletten", () => {
  it("findet gleiche Firmen trotz Schreibweise", () => {
    const paare = dublettenPaare([
      { id: "1", name: "Icon GmbH" },
      { id: "2", name: "ICON GmbH" },
      { id: "3", name: "Andere AG" },
    ]);
    expect(paare.map(([a, b]) => [a.id, b.id])).toEqual([["1", "2"]]);
  });
});
