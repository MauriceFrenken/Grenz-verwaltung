import { describe, expect, it } from "vitest";

import { akquiseBerechnen, aktivitaetenSicht } from "./berechnen";
import { klassifiziere } from "./klassifizieren";
import type { RohAufgabe, RohPerson, Rohdaten } from "./typen";

function lead(id: string, extra: Partial<RohPerson> = {}): RohPerson {
  return {
    id,
    typ: "Lead",
    name: `Eigentümer ${id}`,
    firma: null,
    ort: "Köln",
    strasse: "Teststr. 1",
    accountId: null,
    leadStatus: "Onsite Research finalized",
    leadQuelle: "Upload Januar 2025",
    absagegrund: null,
    bewertung: null,
    nichtKontaktieren: false,
    konvertiert: false,
    ...extra,
  };
}

let n = 0;
function aufgabe(
  betreff: string,
  wer: RohPerson | null,
  am: string,
  extra: Partial<RohAufgabe> = {},
): RohAufgabe {
  n += 1;
  return {
    id: `00T${n}`,
    typ: "Task",
    betreff,
    subtyp: "Task",
    status: "Completed",
    faelligAm: null,
    erledigtAm: `${am}T10:00:00.000Z`,
    erstelltAm: `${am}T09:00:00.000Z`,
    bearbeiter: "Business Development SG",
    wer,
    worauf: null,
    ...extra,
  };
}

describe("klassifiziere", () => {
  it.each([
    ["Send Letter", "anschreiben"],
    [
      "kein Schreiben geschickt - Miteigentümer kontaktiert",
      "kein_anschreiben",
    ],
    ["KEINEN BRIEF SCHICKEN!!", "kein_anschreiben"],
    ["Brief (G&C) kam zurück", "retoure"],
    ["Anruf eingehend", "rueckmeldung"],
    ["Antwortschreiben erhalten, Objekt ist bereits verkauft", "rueckmeldung"],
    ["Call", "anruf"],
    ["Wiedervorlage: Wie schaut's aus mit Verkauf?", "nachfassen"],
    ["Anruf, wenn keine Rückmeldung auf Brief", "nachfassen"],
    ["Proaktive Akquise", "proaktiv"],
    ["Objektaufnahme Haupstraße 313, Zündorf", "akquise_termin"],
    ["Termin Besprechung Einwertung am 06.07.26", "akquise_termin"],
    ["Besichtigungstermin Birkenstr. 2C", "besichtigung"],
  ])("%s → %s", (betreff, erwartet) => {
    expect(klassifiziere({ betreff, subtyp: "Task", typ: "Task" })).toBe(
      erwartet,
    );
  });

  it("nutzt den Aufgabentyp für Anrufe und E-Mails", () => {
    expect(
      klassifiziere({
        betreff: "Gespräch Müller",
        subtyp: "Call",
        typ: "Task",
      }),
    ).toBe("anruf");
    expect(
      klassifiziere({
        betreff: "E-Mail: Exposé",
        subtyp: "Email",
        typ: "Task",
      }),
    ).toBe("email");
  });

  it("wertet Antworten nur bei Eigentümer-Leads als Rückmeldung", () => {
    const b = {
      betreff: "E-Mail: AW: Klosterstrasse 20",
      subtyp: "Email",
      typ: "Task" as const,
    };
    expect(klassifiziere({ ...b, wer: lead("L") })).toBe("rueckmeldung");
    expect(klassifiziere(b)).toBe("email");
  });
});

describe("akquiseBerechnen", () => {
  const heute = "2026-10-25";
  const kalt = lead("00Q1");
  const interessiert = lead("00Q2", { leadStatus: "Qualified" });
  const absage = lead("00Q3", {
    leadStatus: "Unqualified",
    absagegrund: "Verkauf kommt nicht in Frage",
  });
  const speku = lead("00Q4", {
    leadStatus: "Unqualified",
    absagegrund: "Spekulationsfrist läuft aus",
  });
  const nachgefasst = lead("00Q5");

  const daten: Rohdaten = {
    aufgaben: [
      aufgabe("Send Letter", kalt, "2026-09-01"),
      aufgabe("Send Letter", interessiert, "2026-08-01"),
      aufgabe("Send Letter", absage, "2026-08-01"),
      aufgabe("Send Letter", speku, "2026-07-01", {
        status: "Open",
        erledigtAm: null,
      }),
      aufgabe("Send Letter", nachgefasst, "2026-08-15"),
      aufgabe("Call", nachgefasst, "2026-09-10", { subtyp: "Call" }),
      aufgabe("Call", kalt, "2026-10-01", {
        status: "Open",
        erledigtAm: null,
        faelligAm: "2026-10-01",
      }),
      aufgabe("Besichtigung Bilker Allee", null, "2026-10-20", {
        worauf: { typ: "Opportunity", id: "006A", name: "Opp. Bilker" },
      }),
    ],
    mandate: [
      {
        id: "a06A",
        name: "M-1",
        phase: "Einwertung",
        verlustgrund: null,
        erstelltAm: "2026-01-01T00:00:00.000Z",
        geaendertAm: "2026-10-01T00:00:00.000Z",
        eigentuemer: "Muster GmbH",
        accountId: "001A",
        ansprechpartner: "Max Muster",
        objekt: "Musterstr. 1",
      },
      {
        id: "a06T",
        name: "M-2",
        phase: "Verloren",
        verlustgrund: null,
        erstelltAm: "2025-01-01T00:00:00.000Z",
        geaendertAm: "2025-02-01T00:00:00.000Z",
        eigentuemer: "Test GmbH",
        accountId: "001T",
        ansprechpartner: "Peter Müller",
        objekt: "Neue Straße",
      },
    ],
    kaeufe: [],
    leadPool: [{ status: "Open", anzahl: 10 }],
  };

  const d = akquiseBerechnen(daten, heute, "2026-10-25T12:00:00.000Z");

  it("zählt nur erledigte Anschreiben als versendet", () => {
    expect(d.anschreiben.versendet).toBe(4);
    expect(d.anschreiben.offen).toBe(1);
    expect(d.anschreiben.leadsAngeschrieben).toBe(4);
    expect(d.anschreiben.leadsNurVorbereitet).toBe(1);
    // Reaktion: qualifiziert + Absage = 2 von 4 (Speku-Lead nur vorbereitet).
    expect(d.anschreiben.reaktionsquote).toBeCloseTo(50);
    expect(d.anschreiben.interessequote).toBeCloseTo(25);
    expect(d.anschreiben.absagegruende.map((g) => g.grund)).toEqual([
      "Verkauf kommt nicht in Frage",
    ]);
    const sep = d.anschreiben.briefeJeMonat.find((m) => m.monat === "2026-09");
    expect(sep).toEqual({ monat: "2026-09", versendet: 1, offen: 0 });
  });

  it("listet nur unbeantwortete Briefe ohne Folgeaktivität zum Nachfassen", () => {
    // kalt hat nur eine offene (geplante) Call-Aufgabe → Anruf zählt als Folgeaktivität.
    // nachgefasst hat einen erledigten Anruf → nicht in der Liste.
    expect(d.nachfassen.liste.map((x) => x.lead.id)).toEqual([]);
    expect(d.anschreiben.nachfassquote).toBeCloseTo(50);
  });

  it("zeigt offene Aufgaben als Wiedervorlagen mit Überfälligkeit", () => {
    expect(d.wiedervorlagen.gesamt).toBe(1);
    expect(d.wiedervorlagen.liste[0].ueberfaelligTage).toBe(24);
  });

  it("findet Verkäufer-Potenzial und ignoriert Testdaten und harte Absagen", () => {
    const namen = d.potenzial.map((p) => p.name);
    expect(namen).toContain("Eigentümer 00Q2");
    expect(namen).toContain("Eigentümer 00Q4");
    expect(namen).toContain("Max Muster");
    expect(namen).not.toContain("Eigentümer 00Q3");
    expect(namen).not.toContain("Peter Müller");
    expect(d.potenzial[0].score).toBeGreaterThanOrEqual(
      d.potenzial[d.potenzial.length - 1].score,
    );
  });

  it("trennt Akquise und Vermarktung", () => {
    const sicht = aktivitaetenSicht(
      d.aktivitaeten.verlauf,
      { monate: 12, person: null, bereich: null },
      heute,
    );
    const vermarktung = sicht.jeBereich.find(
      (b) => b.bereich === "vermarktung",
    );
    expect(vermarktung?.anzahl).toBe(1);
  });

  it("filtert Aktivitäten nach Zeitraum, Bereich und Person", () => {
    const akquise = aktivitaetenSicht(
      d.aktivitaeten.verlauf,
      { monate: 3, person: null, bereich: "akquise" },
      heute,
    );
    expect(akquise.jeMonat.map((m) => m.monat)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    // Aug–Okt: 4 Briefe + 1 Anruf erledigt; die Besichtigung ist Vermarktung.
    const summe = (m: string) =>
      akquise.summen.find((s) => s.massnahme === m)?.zeitraum ?? 0;
    expect(summe("anschreiben")).toBe(4);
    expect(summe("anruf")).toBe(1);
    expect(summe("besichtigung")).toBe(0);
    // Juli liegt im Vorzeitraum, war aber nur vorbereitet.
    expect(
      akquise.summen.find((s) => s.massnahme === "anschreiben")?.vorzeitraum ??
        0,
    ).toBe(0);
    const niemand = aktivitaetenSicht(
      d.aktivitaeten.verlauf,
      { monate: 3, person: "Sebastian Grenz", bereich: null },
      heute,
    );
    expect(niemand.summen).toEqual([]);
  });
});
