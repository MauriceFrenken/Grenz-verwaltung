import { describe, expect, it } from "vitest";

import {
  berechneUebersicht,
  erwarteteProvision,
  wochenStart,
  type DealRoh,
  type MandatRoh,
  type UebersichtEingabe,
} from "./berechnen";

const mandat = (
  sfId: string,
  status: string,
  extra: Partial<MandatRoh> = {},
): MandatRoh => ({
  sfId,
  name: `M-${sfId}`,
  status,
  angebotspreis: null,
  provisionProzent: null,
  provisionPrognose: null,
  erstelltAm: "2026-01-01T10:00:00Z",
  objekt: `Objekt ${sfId}`,
  ...extra,
});

const deal = (
  sfId: string,
  phase: string,
  extra: Partial<DealRoh> = {},
): DealRoh => ({
  sfId,
  name: `Opp. ${sfId}`,
  phase,
  betrag: null,
  abschlussAm: null,
  mandatSfId: null,
  geschlossen: false,
  gewonnen: false,
  provision: null,
  kaufpreis: null,
  erstelltAm: null,
  ...extra,
});

function eingabe(extra: Partial<UebersichtEingabe> = {}): UebersichtEingabe {
  return {
    heute: "2026-10-25",
    letzterAbruf: null,
    mandate: [],
    deals: [],
    aktivitaeten: [],
    letzterReport: new Map(),
    exposes: [],
    ...extra,
  };
}

describe("berechneUebersicht", () => {
  it("rechnet Pipeline-Provision aus Preis × Satz und ignoriert Testdatensätze", () => {
    const d = berechneUebersicht(
      eingabe({
        mandate: [
          mandat("a", "Beauftragung", {
            angebotspreis: 2_000_000,
            provisionProzent: 5,
          }),
          mandat("b", "Beauftragung", { provisionPrognose: 10_000 }),
          mandat("c", "Beauftragung"),
          mandat("d", "Akquisition", { name: "Test SG" }),
          mandat("e", "Gewonnen"),
          mandat("f", "Verloren"),
        ],
      }),
    );
    expect(d.kacheln.provisionPipeline).toBe(110_000);
    expect(d.kacheln.mandateMitProvision).toBe(2);
    expect(d.kacheln.aktiveMandate).toBe(3);
    expect(d.gewonnen).toBe(1);
    expect(d.verloren).toBe(1);
    expect(
      d.zuTun.some((z) =>
        z.titel.startsWith("2 beauftragte Mandate ohne Exposé-Preis"),
      ),
    ).toBe(true);
  });

  it("zählt Abschlüsse des Jahres und offene Interessenten", () => {
    const d = berechneUebersicht(
      eingabe({
        deals: [
          deal("1", "Invoice Paid", {
            geschlossen: true,
            gewonnen: true,
            abschlussAm: "2026-07-29",
            provision: 49_579.83,
            kaufpreis: 2_060_000,
          }),
          deal("2", "Invoice Paid", {
            geschlossen: true,
            gewonnen: true,
            abschlussAm: "2025-08-21",
            provision: 60_000,
          }),
          deal("3", "Data Room", { abschlussAm: "2026-08-31" }),
          deal("4", "Closed Lost", { geschlossen: true }),
        ],
      }),
    );
    expect(d.kacheln.provisionJahr).toBeCloseTo(49_579.83);
    expect(d.kacheln.abschluesseJahr).toBe(1);
    expect(d.kacheln.offeneInteressenten).toBe(1);
    expect(d.kacheln.imDatenraum).toBe(1);
    expect(d.interessentenPhasen).toEqual([{ phase: "Datenraum", anzahl: 1 }]);
    expect(d.zuTun[0]).toMatchObject({ ton: "warnung", titel: "Opp. 3" });
    expect(d.abschluesse.map((a) => a.name)).toEqual(["Opp. 1", "Opp. 2"]);
  });

  it("meldet ruhende beauftragte Mandate und gruppiert Aktivität je Woche", () => {
    const d = berechneUebersicht(
      eingabe({
        mandate: [mandat("a", "Beauftragung"), mandat("b", "Beauftragung")],
        aktivitaeten: [
          {
            datum: "2026-10-20T09:00:00Z",
            art: "Anruf",
            betreff: "Call",
            mandatSfId: "a",
          },
          {
            datum: "2026-08-01T09:00:00Z",
            art: "E-Mail",
            betreff: "Mail",
            mandatSfId: "b",
          },
        ],
      }),
    );
    const warnungen = d.zuTun.filter((z) => z.ton === "warnung");
    expect(warnungen.map((w) => w.mandatSfId)).toEqual(["b"]);
    expect(d.aktivitaetWochen).toHaveLength(12);
    expect(d.aktivitaetWochen.at(-1)).toMatchObject({
      woche: "2026-10-19",
      Anruf: 1,
    });
    expect(d.aktivitaetGesamt4W).toBe(1);
    expect(d.letzteAktivitaeten[0]).toMatchObject({
      betreff: "Call",
      mandat: "Objekt a",
    });
  });
});

describe("Hilfen", () => {
  it("wochenStart liefert den Montag", () => {
    expect(wochenStart("2026-10-25")).toBe("2026-10-19");
    expect(wochenStart("2026-10-19")).toBe("2026-10-19");
  });
  it("erwarteteProvision fällt auf die Prognose zurück", () => {
    expect(
      erwarteteProvision(mandat("x", "Beauftragung", { provisionPrognose: 0 })),
    ).toBeNull();
  });
});
