import { describe, expect, it } from "vitest";

import {
  aktivitaetenJeWoche,
  berechneFunnel,
  berechneReportKennzahlen,
  funnelStufe,
  reportDokument,
  sammleAngebote,
  type MitgliedZeile,
} from "./report";

const m = (
  id: string,
  status: string | null,
  extra: Partial<MitgliedZeile> = {},
): MitgliedZeile => ({
  sf_id: id,
  kampagne_sf_id: "701A",
  kontakt_sf_id: `003${id}`,
  status,
  geantwortet: false,
  erstmals_geantwortet_am: null,
  ...extra,
});

describe("funnelStufe", () => {
  it("ordnet die Salesforce-Status zu", () => {
    expect(funnelStufe(m("1", "Geplante Ansprache"))).toBe("geplant");
    expect(funnelStufe(m("2", "Gesendet"))).toBe("angeschrieben");
    expect(funnelStufe(m("3", "Geantwortet"))).toBe("geantwortet");
    expect(funnelStufe(m("4", "Absage"))).toBe("geantwortet");
    expect(funnelStufe(m("5", "Interesse"))).toBe("interesse");
    expect(funnelStufe(m("6", "Besichtigung erfolgt"))).toBe("besichtigung");
    expect(
      funnelStufe(m("7", "Gesendet", { sf_daten: { Besichtigung__c: true } })),
    ).toBe("besichtigung");
    expect(
      funnelStufe(
        m("8", "Interesse", { sf_daten: { Kaufangebot__c: 2_500_000 } }),
      ),
    ).toBe("kaufangebot");
  });
});

describe("berechneFunnel", () => {
  it("zählt kumuliert und je Kontakt nur einmal", () => {
    const f = berechneFunnel([
      m("1", "Geplanter Versand"),
      m("2", "Gesendet"),
      m("3", "Absage"),
      m("4", "Besichtigung"),
      m("5", "Kaufangebot"),
      // derselbe Kontakt in zweiter Kampagne, nur höchste Stufe zählt
      m("6", "Gesendet", { kontakt_sf_id: "0035", kampagne_sf_id: "701B" }),
    ]);
    expect(f).toEqual({
      angesprochen: 5,
      angeschrieben: 4,
      geantwortet: 3,
      interesse: 2,
      besichtigung: 2,
      kaufangebot: 1,
      absagen: 1,
    });
  });
});

describe("aktivitaetenJeWoche", () => {
  it("füllt leere Wochen und zählt je Montag", () => {
    const w = aktivitaetenJeWoche(
      [
        {
          sf_id: "a",
          sf_typ: "Task",
          art: "Anruf",
          betreff: "x",
          datum: "2026-10-06T10:00:00Z",
        },
        {
          sf_id: "b",
          sf_typ: "Task",
          art: "Anruf",
          betreff: "x",
          datum: "2026-10-07T10:00:00Z",
        },
        {
          sf_id: "c",
          sf_typ: "Task",
          art: "Anruf",
          betreff: "x",
          datum: "2026-10-20T10:00:00Z",
        },
        {
          sf_id: "d",
          sf_typ: "Task",
          art: "Anruf",
          betreff: "x",
          datum: "2026-09-01T10:00:00Z",
        },
      ],
      "2026-10-05",
      "2026-10-21",
    );
    expect(w).toEqual([
      { woche: "2026-10-05", anzahl: 2 },
      { woche: "2026-10-12", anzahl: 0 },
      { woche: "2026-10-19", anzahl: 1 },
    ]);
  });
});

describe("sammleAngebote", () => {
  it("nimmt Deals vor Kampagnenmitgliedern desselben Bieters", () => {
    const namen = new Map([
      ["003X", "Invest GmbH"],
      ["003Y", "Family Office Y"],
    ]);
    const a = sammleAngebote(
      [
        {
          sf_id: "006A",
          name: "Deal A",
          phase: "Verhandlung",
          betrag: 3_000_000,
          abschluss_am: null,
          kontakt_sf_id: "003X",
          account_sf_id: null,
        },
        {
          sf_id: "006B",
          name: "Deal B",
          phase: "Qualifizierung",
          betrag: null,
          abschluss_am: null,
          kontakt_sf_id: null,
          account_sf_id: null,
        },
      ],
      [
        m("1", "Kaufangebot", {
          kontakt_sf_id: "003X",
          sf_daten: { Kaufangebot__c: 2_900_000 },
        }),
        m("2", "Kaufangebot", {
          kontakt_sf_id: "003Y",
          sf_daten: {
            Kaufangebot__c: 3_100_000,
            Notizen_Kaufangebot__c: "vorbehaltlich DD",
          },
        }),
      ],
      namen,
    );
    expect(a.map((x) => [x.bieter, x.betrag, x.notiz])).toEqual([
      ["Family Office Y", 3_100_000, "vorbehaltlich DD"],
      ["Invest GmbH", 3_000_000, null],
    ]);
  });
});

describe("reportDokument", () => {
  const k = berechneReportKennzahlen({
    von: "2026-10-01",
    bis: "2026-10-31",
    mandat: {
      sfId: "a06A",
      name: "M-1",
      status: "Beauftragung",
      angebotspreis: null,
      objekt: "MFH Köln",
      adresse: "Friesenplatz 1, 50672 Köln",
    },
    kampagnen: [
      {
        sf_id: "701A",
        name: "Vermarktung",
        typ: "Vermarktung",
        status: null,
        start_am: null,
        anzahl_mitglieder: 1,
      },
    ],
    mitglieder: [m("1", "Interesse")],
    aktivitaeten: [
      {
        sf_id: "00TA",
        sf_typ: "Task",
        art: "Anruf",
        betreff: "Rückruf Investor",
        datum: "2026-10-10T09:00:00Z",
      },
    ],
    deals: [],
    namen: new Map(),
    jetzt: new Date("2026-10-24T08:00:00Z"),
  });

  it("übernimmt nur belegte Marktfeedback-Aussagen und markiert Lücken", () => {
    const d = reportDokument(
      k,
      {
        marktfeedback: [
          {
            text: "Investoren sehen den Preis als ambitioniert.",
            quellen: ["00TA"],
          },
          { text: "Der Markt ist schwach.", quellen: [] },
          { text: "Erfundene Quelle.", quellen: ["00TZZZ"] },
        ],
      },
      { freigegeben: false },
    );
    const fb = d.abschnitte.find((a) => a.id === "marktfeedback")!.bloecke;
    expect(fb[0]).toMatchObject({ art: "absatz", quellen: ["00TA"] });
    expect(fb[1].art).toBe("luecke");
    expect(fb[2].art).toBe("luecke");
    expect(
      d.quellen.some((q) => q.id === "00TA" && q.art === "aktivitaet"),
    ).toBe(true);
    expect(d.stempel).toBe("ENTWURF");
    // fehlender Preis wird als Lücke ausgewiesen, nicht erfunden
    expect(d.abschnitte[0].bloecke.some((b) => b.art === "luecke")).toBe(true);
  });

  it("ohne Entwurf-Stempel, wenn freigegeben", () => {
    expect(
      reportDokument(k, {}, { freigegeben: true }).stempel,
    ).toBeUndefined();
  });
});
