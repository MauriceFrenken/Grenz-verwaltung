import { describe, expect, it } from "vitest";

import {
  exposeDokument,
  leererInhalt,
  pruefePflichtangaben,
  vorbelegungAusSalesforce,
  zitatAufSeite,
  type ExposeInhalt,
} from "./modell";

const DESIGN_OK = { disclaimer: "Alle Angaben ohne Gewähr.", provisionshinweis: "Provision 3,57 %.", widerrufsbelehrung: "Widerruf …" };
const DESIGN_PLATZHALTER = {
  disclaimer: "[Haftungsausschluss aus Grenz-Exposé-Vorlage übernehmen]",
  provisionshinweis: "[Provisionshinweis]",
  widerrufsbelehrung: "[Widerruf]",
};

const q = (id: string) => ({ id, art: "eingabe" as const, bezeichnung: "Eingabe Test" });

function vollstaendig(): ExposeInhalt {
  const i = leererInhalt();
  const setze = (id: keyof ExposeInhalt["felder"], wert: string) => (i.felder[id] = { wert, quelle: q(`e:${id}`) });
  setze("adresse", "Friesenplatz 1, 50672 Köln");
  setze("lage_ort", "Köln, Innenstadt");
  setze("objektart", "Mehrfamilienhaus");
  setze("baujahr", "1967");
  setze("kaufpreis", "2.500.000");
  setze("provision", "3,57 % inkl. USt.");
  setze("wohnflaeche", "1.200");
  setze("ist_miete", "125.000");
  setze("energieausweis_art", "Verbrauchsausweis");
  setze("energiekennwert", "132");
  setze("energietraeger", "Fernwärme");
  setze("energieausweis_baujahr", "1967");
  setze("effizienzklasse", "E");
  return i;
}

describe("vorbelegungAusSalesforce", () => {
  it("übernimmt strukturierte Felder mit Quelle und keine Notizen", () => {
    const f = vorbelegungAusSalesforce(
      { sf_id: "a06A", provision_prozent: 3, angebotspreis: 0 },
      {
        sf_id: "a01A",
        name: "MFH Lessingstraße",
        strasse: "Lessingstr. 10",
        plz: "40227",
        ort: "Düsseldorf",
        baujahr: 1967,
        heizungsart: "Fernwärme",
        sf_daten: { Notes__c: "Eigentümer würde für 2,5 Mio abgeben" },
      },
    );
    expect(f.adresse?.wert).toBe("Lessingstr. 10, 40227 Düsseldorf");
    expect(f.provision?.quelle?.verweis).toBe("a06A");
    expect(f.kaufpreis).toBeUndefined(); // 0 = nicht gepflegt
    expect(JSON.stringify(f)).not.toContain("2,5 Mio");
  });
});

describe("pruefePflichtangaben", () => {
  it("ist vollständig ok mit allen Angaben und echten Rechtstexten", () => {
    const p = pruefePflichtangaben("expose", vollstaendig(), DESIGN_OK);
    expect(p.punkte.filter((x) => x.status !== "ok")).toEqual([]);
    expect(p.ok).toBe(true);
  });

  it("sperrt bei fehlenden GEG-Angaben, Werten ohne Quelle und Platzhaltertexten", () => {
    const i = vollstaendig();
    delete i.felder.energiekennwert;
    i.felder.kaufpreis = { wert: "2.500.000", quelle: null };
    i.texte.objekt = [{ text: "Sehr gepflegtes Haus.", quellen: [] }];
    const p = pruefePflichtangaben("expose", i, DESIGN_PLATZHALTER);
    expect(p.ok).toBe(false);
    const status = Object.fromEntries(p.punkte.map((x) => [x.id, x.status]));
    expect(status.energiekennwert).toBe("fehlt");
    expect(status.kaufpreis).toBe("ohne_quelle");
    expect(status["text:Haftungshinweis"]).toBe("fehlt");
    expect(status.texte).toBe("ohne_quelle");
  });

  it("verlangt die Effizienzklasse nur bei Wohngebäuden", () => {
    const i = vollstaendig();
    i.felder.objektart = { wert: "Bürogebäude", quelle: q("x") };
    delete i.felder.effizienzklasse;
    expect(pruefePflichtangaben("expose", i, DESIGN_OK).ok).toBe(true);
  });
});

describe("exposeDokument", () => {
  it("Teaser ohne Adresse, mit Faktor als Berechnung und Lücken statt erfundener Texte", () => {
    const d = exposeDokument("teaser", vollstaendig(), DESIGN_OK, { titel: "Teaser", freigegeben: false });
    const json = JSON.stringify(d);
    expect(json).not.toContain("Friesenplatz");
    expect(json).toContain("20-fach");
    expect(d.abschnitte.find((a) => a.id === "objekt")?.bloecke[0].art).toBe("luecke");
    expect(d.stempel).toBe("ENTWURF");
  });
});

describe("zitatAufSeite", () => {
  it("findet Zitate nur auf der angegebenen Seite", () => {
    const text = "<<<PAGE 1>>>\nEnergieausweis\n<<<PAGE 2>>>\nEndenergieverbrauch   132 kWh";
    expect(zitatAufSeite(text, 2, "Endenergieverbrauch 132 kWh")).toBe(true);
    expect(zitatAufSeite(text, 1, "132 kWh")).toBe(false);
  });
});
