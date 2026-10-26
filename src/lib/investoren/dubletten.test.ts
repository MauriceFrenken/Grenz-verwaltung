import { describe, expect, it } from "vitest";

import { gruppenSchluessel, quellenZusammenfuehren, type QuellRoh } from "./dubletten";

function z(teil: Partial<QuellRoh> & { schluessel: string }): QuellRoh {
  return {
    quelle: "7plus", firma: null, person: null, emails: [], telefon: null, adresse: null, ort: null, webseite: null,
    typ: null, nutzungen: [], objektklassen: [], zustand: [], struktur: [], volumen_min: null, volumen_max: null,
    regionen: [], nrw_bezug: null, objekte_interesse: [], nicht_anlegen: false, passung: 0, sf_treffer_art: null,
    sf_kontakt_sf_id: null, sf_account_sf_id: null, bearbeitung: "offen", dublette_von: null,
    ...teil,
  };
}

describe("gruppenSchluessel", () => {
  it("trennt kurze Firmenkerne und Namensvettern", () => {
    expect(gruppenSchluessel({ firma: "ABC Immobilien GmbH", person: null, emails: [], typ: null })).toEqual(["n:abcimmobiliengmbh"]);
    expect(gruppenSchluessel({ firma: null, person: "Thomas Müller", emails: ["t@x.de"], typ: null })).toEqual(["e:t@x.de"]);
    expect(gruppenSchluessel({ firma: "Rheinwohnen GmbH", person: null, emails: [], typ: null })).toEqual(["n:rheinwohnen"]);
  });
});

describe("quellenZusammenfuehren", () => {
  it("vereint Nutzungen, Volumen und Kontakte im Haupteintrag", () => {
    const r = quellenZusammenfuehren([
      z({ schluessel: "7plus:rheinwohnen:Wohnen", firma: "Rheinwohnen GmbH", nutzungen: ["Wohnen"], volumen_min: 2e6, volumen_max: 5e6, passung: 70 }),
      z({ schluessel: "7plus:rheinwohnen:Büro", firma: "Rheinwohnen GmbH", nutzungen: ["Büro"], volumen_min: 1e6, volumen_max: 10e6, passung: 50, emails: ["info@rw.de"] }),
      z({ schluessel: "suchkunden:x", quelle: "suchkunden", firma: null, person: "Max", emails: ["info@rw.de"], objekte_interesse: ["Bilker Allee"] }),
      z({ schluessel: "7plus:anders", firma: "Andere Wohnen AG" }),
    ]);
    expect(r.gruppen).toBe(1);
    const h = r.haupt.get("7plus:rheinwohnen:Wohnen")!;
    expect(h.nutzungen).toEqual(["Wohnen", "Büro"]);
    expect(h.volumen_min).toBe(1e6);
    expect(h.volumen_max).toBe(10e6);
    expect(h.emails).toEqual(["info@rw.de"]);
    expect(h.objekte_interesse).toEqual(["Bilker Allee"]);
    expect(r.verweis.get("7plus:rheinwohnen:Büro")).toBe("7plus:rheinwohnen:Wohnen");
    expect(r.verweis.get("suchkunden:x")).toBe("7plus:rheinwohnen:Wohnen");
    expect(r.verweis.get("7plus:anders")).toBeNull();
  });

  it("nimmt den Salesforce-Treffer als Haupteintrag", () => {
    const r = quellenZusammenfuehren([
      z({ schluessel: "a", firma: "Rheinwohnen GmbH", passung: 90 }),
      z({ schluessel: "b", firma: "Rheinwohnen GmbH", passung: 10, sf_account_sf_id: "001x" }),
    ]);
    expect(r.verweis.get("a")).toBe("b");
    expect(r.haupt.get("b")?.passung).toBe(90);
  });
});
