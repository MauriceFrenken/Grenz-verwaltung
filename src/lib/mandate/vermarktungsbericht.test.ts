import { describe, expect, it } from "vitest";

import type { DealZeile, MitgliedZeile, ReportKennzahlen } from "./report";
import {
  absagegrundAusText,
  berechneVermarktung,
  berichtStand,
  kundengruppe,
  standardVorgehen,
  tortenStuecke,
  type InteressentInfo,
} from "./vermarktungsbericht";

const m = (
  id: string,
  status: string | null,
  extra: Partial<MitgliedZeile> = {},
): MitgliedZeile => ({
  sf_id: `00v${id}`,
  kampagne_sf_id: "701A",
  kontakt_sf_id: `003${id}`,
  status,
  geantwortet: false,
  erstmals_geantwortet_am: null,
  ...extra,
});

const d = (
  id: string,
  phase: string,
  extra: Partial<DealZeile> = {},
): DealZeile => ({
  sf_id: `006${id}`,
  name: `Opp ${id}`,
  phase,
  betrag: null,
  abschluss_am: null,
  kontakt_sf_id: `003${id}`,
  account_sf_id: null,
  ...extra,
});

const basis = {
  objekttyp: "Mehrfamilienhaus",
  objektanschrift: "Bendemannstraße 19A, 40210 Düsseldorf",
  ort: "Düsseldorf",
  auftraggeber: "Melanie Maxstadt",
  vermarktungsbeginn: "2026-02-03",
  heute: "2026-10-25",
};

describe("berechneVermarktung", () => {
  it("ordnet jeden Interessenten genau einem Status zu", () => {
    const v = berechneVermarktung({
      ...basis,
      infos: new Map(),
      aktivitaeten: [],
      mitglieder: [
        m("1", "Geplante Ansprache"),
        m("2", "Gesendet"),
        m("3", "Absage"),
        m("4", "Interesse"),
        m("5", "Gesendet"),
        m("6", "Gesendet"),
        m("7", "Gesendet"),
        m("8", "Absage"),
      ],
      deals: [
        d("5", "Initial interest", {
          sf_daten: {
            Besichtigungsstatus__c: "Stattgefunden",
            Date_of_visit__c: "2026-09-01",
          },
        }),
        d("6", "Data Room", { betrag: 1_200_000 }),
        d("7", "Closed Lost", { sf_daten: { Loss_Reason__c: "Price" } }),
        // Absage eines Ansprechpartners zählt nicht, solange der Deal offen ist.
        d("8", "Initial interest", {
          sf_daten: { Date_of_visit__c: "2026-11-02" },
        }),
      ],
    });
    expect(v.vorgemerkt).toBe(1);
    expect(v.status).toEqual({
      exposeInPruefung: 1,
      erstesInteresse: 1,
      besichtigung: 1,
      pruefungNachBesichtigung: 1,
      kaufangebot: 1,
      absageNachInteresse: 1,
      absagen: 1,
    });
    expect(v.absagegruende).toEqual([
      { grund: "Kaufpreisvorstellung", anzahl: 1 },
      { grund: "Ohne Angabe", anzahl: 1 },
    ]);
  });

  it("liest Absagegründe aus Aktivitäten des Kontakts", () => {
    const v = berechneVermarktung({
      ...basis,
      infos: new Map(),
      mitglieder: [m("1", "Absage")],
      deals: [],
      aktivitaeten: [
        {
          sf_id: "00T1",
          sf_typ: "Task",
          art: "E-Mail",
          betreff: "AW: Exposé",
          datum: "2026-05-01T10:00:00Z",
          who_sf_id: "0031",
          sf_daten: {
            Description: "Danke, das Objekt ist uns leider zu klein.",
          },
        },
      ],
    });
    expect(v.absagegruende).toEqual([{ grund: "Volumen zu klein", anzahl: 1 }]);
  });
});

describe("kundengruppe", () => {
  const k = (info: Partial<InteressentInfo>) =>
    kundengruppe({ name: "X", ...info });
  it("nutzt gepflegte Typen vor dem Namen", () => {
    expect(k({ investorTyp: "Family Office", firma: "Bau GmbH" })).toBe(
      "vermoegen",
    );
    expect(k({ accountTyp: "Institutionell" })).toBe("fonds");
    expect(k({ privat: true, firma: "Muster GmbH" })).toBe("privat");
  });
  it("ordnet über den Firmennamen ein", () => {
    expect(k({ firma: "Primus Valor AG" })).toBe("vermoegen");
    expect(
      k({ firma: "LTW Erschließungs- und Baubetreuungsgesellschaft mbH" }),
    ).toBe("entwickler");
    expect(k({ firma: "Union Investment Real Estate GmbH" })).toBe("fonds");
    expect(k({ name: "Harald Duggen", firma: "Harald Duggen" })).toBe("privat");
    expect(k({ name: "Erika Muster" })).toBe("privat");
  });
});

describe("absagegrundAusText", () => {
  it("erkennt die Gründe der Vorlage", () => {
    expect(absagegrundAusText("Wir sind derzeit nicht aktiv")).toBe(
      "Nicht aktiv",
    );
    expect(absagegrundAusText("Kaufpreis deutlich zu hoch")).toBe(
      "Kaufpreisvorstellung",
    );
    expect(absagegrundAusText("Die Mikrolage überzeugt nicht")).toBe(
      "Mikrolage / Gebäudeumfeld",
    );
    expect(absagegrundAusText("Danke für die Unterlagen")).toBeNull();
  });
});

const kennzahlen = (
  vermarktung?: ReportKennzahlen["vermarktung"],
): ReportKennzahlen => ({
  stand: "2026-10-25T10:00:00Z",
  zeitraum: { von: "2026-10-01", bis: "2026-10-25" },
  mandat: {
    sfId: "a06A",
    name: "Mandat",
    status: null,
    angebotspreis: null,
    objekt: "Bendemannstr. 19A",
    adresse: "Bendemannstraße 19A, 40210 Düsseldorf",
  },
  kampagnen: [],
  funnel: {
    angesprochen: 0,
    angeschrieben: 0,
    geantwortet: 0,
    interesse: 0,
    besichtigung: 0,
    kaufangebot: 0,
    absagen: 0,
  },
  aktivitaeten: { gesamt: 0, zeitraum: 0, jeWoche: [], nachArt: [] },
  angebote: [],
  aktivitaetsListe: [],
  vermarktung,
});

describe("berichtStand", () => {
  const v = berechneVermarktung({
    ...basis,
    infos: new Map(),
    aktivitaeten: [],
    mitglieder: [m("1", "Gesendet"), m("2", "Absage")],
    deals: [],
  });

  it("nimmt Salesforce-Werte, solange nichts händisch gesetzt ist", () => {
    const b = berichtStand(kennzahlen(v), {}, { freigegeben: false });
    expect(b.objektbezeichnung).toBe(
      "Mehrfamilienhaus Bendemannstraße 19A, Düsseldorf",
    );
    expect(b.vermarktungsbeginn).toBe("Februar 2026");
    expect(b.berichtsdatum).toBe("25. Oktober 2026");
    expect(b.angesprochen).toBe(2);
    expect(b.stempel).toBe("ENTWURF");
  });

  it("händische Werte haben Vorrang, auch Absagegründe als ganze Liste", () => {
    const b = berichtStand(
      kennzahlen(v),
      {
        werte: {
          auftraggeber: "Frau Maxstadt",
          status: { absagen: 556, exposeInPruefung: 47 },
          absagegruende: [{ grund: "Kaufpreisvorstellung", anzahl: 229 }],
        },
        herausforderungen: ["Mikrolage", " "],
      },
      { freigegeben: true },
    );
    expect(b.auftraggeber).toBe("Frau Maxstadt");
    expect(b.angesprochen).toBe(603);
    expect(b.status.find((s) => s.key === "absagen")).toMatchObject({
      wert: 556,
      ausSalesforce: 1,
    });
    expect(b.absagenGesamt).toBe(229);
    expect(b.herausforderungen).toEqual(["Mikrolage"]);
    expect(b.stempel).toBeNull();
  });

  it("übernimmt das Marktfeedback älterer Berichte als Herausforderungen", () => {
    const b = berichtStand(
      kennzahlen(),
      { marktfeedback: [{ text: "Preis zu hoch", quellen: ["00T"] }] },
      { freigegeben: false },
    );
    expect(b.herausforderungen).toEqual(["Preis zu hoch"]);
    expect(b.angesprochen).toBe(0);
  });
});

describe("Hilfen", () => {
  it("schlägt das weitere Vorgehen nach Stand vor", () => {
    expect(standardVorgehen(undefined)).toEqual([
      "Weitere Ansprache potenzieller Interessenten",
    ]);
  });
  it("Tortenstücke ergeben zusammen 100 %", () => {
    const s = tortenStuecke(
      [
        { label: "a", wert: 3 },
        { label: "b", wert: 0 },
        { label: "c", wert: 1 },
      ],
      50,
      50,
      40,
    );
    expect(s.map((x) => x.label)).toEqual(["a", "c"]);
    expect(s.reduce((a, x) => a + x.anteil, 0)).toBeCloseTo(1);
  });
});
