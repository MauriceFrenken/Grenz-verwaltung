import { describe, expect, it } from "vitest";

import { zaehltAlsAktivitaet } from "@/lib/sf-sync/zaehlen";

import { berechneMaklerLive, type LiveMandat } from "./live";

function mandat(teil: Partial<LiveMandat>): LiveMandat {
  return {
    sfId: teil.name ?? "M",
    name: "M",
    status: "Beauftragung",
    art: null,
    feeModel: "Provisionspflichtig",
    angebotspreis: null,
    provisionProzent: 5,
    provisionPrognose: null,
    erstelltAm: "2026-01-10T10:00:00.000+0000",
    objekt: "Objekt",
    betreuer: null,
    ...teil,
  };
}

describe("berechneMaklerLive", () => {
  const ergebnis = berechneMaklerLive({
    heute: "2026-10-28",
    mandate: [
      mandat({
        name: "M-1",
        art: "Schriftlicher Maklervertrag",
        angebotspreis: 755000,
      }),
      mandat({
        name: "M-2",
        art: "Lose Beauftragung",
        angebotspreis: 6500000,
        provisionProzent: 4,
      }),
      mandat({ name: "M-3", art: "Off-Market Freigabe" }),
      mandat({ name: "M-4", status: "Gewonnen" }),
      mandat({ name: "M-5", status: "Verloren" }),
      mandat({
        name: "M-6",
        status: "Akquisition",
        objekt: "Teststraße 1, Köln",
      }),
    ],
    deals: [
      {
        name: "Opp. A",
        phase: "Invoice Paid",
        geschlossen: true,
        gewonnen: true,
        abschlussAm: "2026-02-19",
        kaufpreis: 1500000,
        betrag: 1500000,
        provision: 75000,
      },
      {
        name: "Opp. B",
        phase: "Data Room",
        geschlossen: false,
        gewonnen: false,
        abschlussAm: "2026-08-31",
        kaufpreis: null,
        betrag: null,
        provision: null,
      },
      {
        name: "Test SG",
        phase: "Akquisition",
        geschlossen: false,
        gewonnen: false,
        abschlussAm: null,
        kaufpreis: null,
        betrag: null,
        provision: null,
      },
    ],
    kampagnen: [
      {
        sfId: "701A",
        name: "Vermarktung Birkenstr. 2C",
        status: "In Progress",
        startAm: "2026-03-01",
      },
      { sfId: "701B", name: "Weihnachtskarte 25", status: null, startAm: null },
    ],
    mitglieder: [
      { kampagneSfId: "701A", status: "Gesendet" },
      { kampagneSfId: "701A", status: "Gesendet" },
      { kampagneSfId: "701A", status: "Interesse" },
      { kampagneSfId: "701A", status: "Kaufangebot" },
      { kampagneSfId: "701A", status: "Absage" },
      { kampagneSfId: "701B", status: "Gesendet" },
    ],
    aktivitaeten: [
      {
        datum: "2026-10-01T12:00:00Z",
        sfTyp: "Task",
        art: "Anruf",
        betreff: "Anruf",
        status: "Completed",
      },
      {
        datum: "2026-10-02T12:00:00Z",
        sfTyp: "Task",
        art: "Aufgabe",
        betreff: "Send Letter",
        status: "Completed",
      },
      {
        datum: "2026-10-02T12:00:00Z",
        sfTyp: "Task",
        art: "Aufgabe",
        betreff: "Send Letter",
        status: "Open",
      },
      {
        datum: "2026-10-03T12:00:00Z",
        sfTyp: "Task",
        art: "E-Mail",
        betreff: "E-Mail: Hallo",
        status: "Completed",
      },
      {
        datum: "2026-10-03T12:00:00Z",
        sfTyp: "EmailMessage",
        art: "E-Mail",
        betreff: "Hallo",
        status: "3",
      },
      {
        datum: "2025-05-03T12:00:00Z",
        sfTyp: "Task",
        art: "Anruf",
        betreff: "Call",
        status: "Completed",
      },
    ],
  });

  it("zählt groß nur Mandate mit schriftlichem Maklervertrag", () => {
    expect(ergebnis.kacheln.pipelineProvision).toBe(37750);
    expect(ergebnis.kacheln.pipelineProvisionAlle).toBe(37750 + 260000);
    expect(ergebnis.kacheln.beauftragt).toBe(3);
    expect(ergebnis.kacheln.beauftragtMitVertrag).toBe(1);
    expect(ergebnis.kacheln.beauftragtOhnePreis).toBe(1);
    expect(ergebnis.pipeline[0].mandat).toBe("M-1");
  });

  it("lässt Testdatensätze weg und zählt Deals live", () => {
    expect(
      ergebnis.phasen.find((p) => p.phase === "Akquisition"),
    ).toBeUndefined();
    expect(ergebnis.kacheln.verkaeufe).toBe(1);
    expect(ergebnis.kacheln.vermittelterKaufpreis).toBe(1500000);
    expect(ergebnis.kacheln.offeneDeals).toBe(1);
    expect(ergebnis.kacheln.gewinnquote).toBe(50);
  });

  it("wertet nur Vermarktungskampagnen aus", () => {
    expect(ergebnis.kampagnen).toHaveLength(1);
    expect(ergebnis.kampagnen[0]).toMatchObject({
      kontakte: 5,
      gesendet: 2,
      interesse: 1,
      angebot: 1,
      absage: 1,
    });
    expect(ergebnis.funnel[0]).toEqual({ stufe: "Angesprochen", anzahl: 5 });
  });

  it("zählt erledigte Aktivitäten, E-Mails einmal, offene Aufgaben nicht", () => {
    const summe = (typ: string) =>
      ergebnis.aktivitaetSummen.find((s) => s.typ === typ);
    expect(summe("Anruf")).toEqual({ typ: "Anruf", jahr: 1, vorjahr: 1 });
    expect(summe("Akquisebrief")?.jahr).toBe(1);
    expect(summe("E-Mail")?.jahr).toBe(1);
    expect(ergebnis.aktivitaet.at(-1)).toMatchObject({
      monat: "2026-10",
      Anruf: 1,
      Akquisebrief: 1,
      "E-Mail": 1,
    });
  });
});

describe("zaehltAlsAktivitaet", () => {
  it("unterscheidet Planung, Doppel-E-Mails und Termine", () => {
    expect(
      zaehltAlsAktivitaet({ sfTyp: "Task", art: "Anruf", status: "Completed" }),
    ).toBe(true);
    expect(
      zaehltAlsAktivitaet({ sfTyp: "Task", art: "Aufgabe", status: "Open" }),
    ).toBe(false);
    expect(
      zaehltAlsAktivitaet({
        sfTyp: "Task",
        art: "E-Mail",
        status: "Completed",
      }),
    ).toBe(false);
    expect(
      zaehltAlsAktivitaet({
        sfTyp: "EmailMessage",
        art: "E-Mail",
        status: "3",
      }),
    ).toBe(true);
    expect(
      zaehltAlsAktivitaet({ sfTyp: "Event", art: "Termin", status: null }),
    ).toBe(true);
  });
});
