import { describe, expect, it } from "vitest";

import {
  arbeitstage,
  feiertageNrw,
  ostersonntag,
  schulungsstatus,
  urlaubsanspruch,
  urlaubskonto,
  zeitraum34c,
} from "./berechnen";
import type { Abwesenheit, Mitarbeiter, Schulung } from "./typen";

const basis: Mitarbeiter = {
  id: "m1",
  profilId: null,
  name: "Test",
  email: null,
  telefon: null,
  position: null,
  vertragsart: "vollzeit",
  wochenstunden: 40,
  urlaubstageJahr: 30,
  eintrittAm: "2020-01-01",
  probezeitBis: null,
  austrittAm: null,
  geburtstag: null,
  notfallkontakt: null,
  sfUserId: null,
  weiterbildungspflichtig: true,
  personalakteUrl: null,
  notizen: null,
  vollstaendig: true,
};

describe("Feiertage NRW", () => {
  it("berechnet Ostern und bewegliche Feiertage", () => {
    expect(ostersonntag(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    const f = feiertageNrw(2026);
    expect(f.get("2026-04-03")).toBe("Karfreitag");
    expect(f.get("2026-05-14")).toBe("Christi Himmelfahrt");
    expect(f.get("2026-06-04")).toBe("Fronleichnam");
    expect(f.get("2026-11-01")).toBe("Allerheiligen");
  });

  it("zählt Arbeitstage ohne Wochenende und Feiertage", () => {
    // Mo 28.12.2026 bis Fr 08.01.2027: 9 Werktage minus Neujahr
    expect(arbeitstage("2026-12-28", "2027-01-08")).toBe(9);
    expect(
      arbeitstage("2026-12-28", "2027-01-08", false, {
        von: "2027-01-01",
        bis: "2027-12-31",
      }),
    ).toBe(5);
    expect(arbeitstage("2026-10-27", "2026-10-27", true)).toBe(0.5);
  });
});

describe("Urlaub", () => {
  it("rechnet den Anspruch im Eintrittsjahr anteilig", () => {
    expect(urlaubsanspruch(basis, 2026)).toBe(30);
    expect(urlaubsanspruch({ ...basis, eintrittAm: "2026-07-01" }, 2026)).toBe(
      15,
    );
    expect(urlaubsanspruch({ ...basis, eintrittAm: "2026-07-15" }, 2026)).toBe(
      12.5,
    );
  });

  it("zieht genehmigten Urlaub ab", () => {
    const a: Abwesenheit[] = [
      {
        id: "a",
        mitarbeiterId: "m1",
        art: "urlaub",
        von: "2026-08-03",
        bis: "2026-08-14",
        halbtag: false,
        status: "genehmigt",
        notiz: null,
        entschiedenAm: null,
      },
      {
        id: "b",
        mitarbeiterId: "m1",
        art: "urlaub",
        von: "2026-12-21",
        bis: "2026-12-23",
        halbtag: false,
        status: "beantragt",
        notiz: null,
        entschiedenAm: null,
      },
      {
        id: "c",
        mitarbeiterId: "m1",
        art: "krank",
        von: "2026-09-01",
        bis: "2026-09-02",
        halbtag: false,
        status: "genehmigt",
        notiz: null,
        entschiedenAm: null,
      },
    ];
    const k = urlaubskonto(
      basis,
      a,
      [
        {
          mitarbeiterId: "m1",
          jahr: 2026,
          urlaubUebertrag: 3,
          provisionszielEur: null,
        },
      ],
      2026,
    );
    expect(k).toEqual({
      anspruch: 30,
      uebertrag: 3,
      genehmigt: 10,
      beantragt: 3,
      rest: 23,
    });
  });
});

describe("Pflichtschulungen", () => {
  it("bestimmt den Dreijahreszeitraum", () => {
    expect(zeitraum34c("2026-10-27")).toEqual({
      von: "2024-01-01",
      bis: "2026-12-31",
    });
    expect(zeitraum34c("2027-01-02")).toEqual({
      von: "2027-01-01",
      bis: "2029-12-31",
    });
  });

  it("bewertet Stunden und jährliche Unterweisungen", () => {
    const s: Schulung[] = [
      {
        id: "1",
        mitarbeiterId: "m1",
        art: "weiterbildung_34c",
        titel: "A",
        anbieter: null,
        datum: "2025-03-01",
        stunden: 8,
        nachweisUrl: null,
        notiz: null,
      },
      {
        id: "2",
        mitarbeiterId: "m1",
        art: "weiterbildung_34c",
        titel: "B",
        anbieter: null,
        datum: "2023-03-01",
        stunden: 20,
        nachweisUrl: null,
        notiz: null,
      },
      {
        id: "3",
        mitarbeiterId: "m1",
        art: "gwg",
        titel: "GwG",
        anbieter: null,
        datum: "2026-02-01",
        stunden: 1,
        nachweisUrl: null,
        notiz: null,
      },
    ];
    const st = schulungsstatus(basis, s, "2026-10-27");
    expect(st.stunden34c).toBe(8);
    expect(st.ampel34c).toBe("kritisch");
    expect(st.ampelGwg).toBe("ok");
    expect(st.ampelDatenschutz).toBe("kritisch");
    expect(
      schulungsstatus(
        { ...basis, weiterbildungspflichtig: false },
        s,
        "2026-10-27",
      ).ampel34c,
    ).toBe("entfaellt");
  });
});
