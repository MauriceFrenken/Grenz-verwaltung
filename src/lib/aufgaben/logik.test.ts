import { describe, expect, it } from "vitest";

import {
  aufgabenAusNotiz,
  faelligStand,
  passtZuFilter,
  positionZwischen,
  ruecksprachen,
  tageBisFaellig,
  themenStaende,
} from "./logik";
import { FILTER_LEER, type Aufgabe } from "./typen";

function aufgabe(teil: Partial<Aufgabe>): Aufgabe {
  return {
    id: "a",
    spalteId: "s",
    position: 1000,
    titel: "Exposé Bilker Allee fertigstellen",
    beschreibung: "",
    verantwortlichId: null,
    faelligAm: null,
    prioritaet: "normal",
    themenfeld: "",
    ruecksprache: "",
    ruecksprachAm: null,
    mandatSfId: null,
    checkliste: [],
    erledigtAm: null,
    erstelltVon: null,
    createdAt: "2026-10-27T09:00:00Z",
    updatedAt: "2026-10-27T09:00:00Z",
    ...teil,
  };
}

describe("positionZwischen", () => {
  const liste = [{ position: 1000 }, { position: 2000 }];
  it("leere Liste", () => expect(positionZwischen([], 0)).toBe(1000));
  it("vorne", () => expect(positionZwischen(liste, 0)).toBe(0));
  it("dazwischen", () => expect(positionZwischen(liste, 1)).toBe(1500));
  it("hinten", () => expect(positionZwischen(liste, 2)).toBe(3000));
});

describe("Fälligkeit", () => {
  it("rechnet Kalendertage", () => {
    expect(tageBisFaellig("2026-10-26", "2026-10-27")).toBe(-1);
    expect(tageBisFaellig("2026-11-01", "2026-10-27")).toBe(5);
  });
  it("erledigte Spalte ist nie überfällig", () => {
    const a = aufgabe({ faelligAm: "2026-10-01" });
    expect(faelligStand(a, { erledigt: false }, "2026-10-27")).toBe(
      "ueberfaellig",
    );
    expect(faelligStand(a, { erledigt: true }, "2026-10-27")).toBeNull();
  });
  it("heute und bald", () => {
    expect(
      faelligStand(
        aufgabe({ faelligAm: "2026-10-27" }),
        undefined,
        "2026-10-27",
      ),
    ).toBe("heute");
    expect(
      faelligStand(
        aufgabe({ faelligAm: "2026-10-29" }),
        undefined,
        "2026-10-27",
      ),
    ).toBe("bald");
  });
});

describe("Filter", () => {
  const heute = "2026-10-27";
  it("Person und ohne Zuweisung", () => {
    const a = aufgabe({ verantwortlichId: "p1" });
    expect(
      passtZuFilter(a, undefined, { ...FILTER_LEER, person: "p1" }, heute),
    ).toBe(true);
    expect(
      passtZuFilter(a, undefined, { ...FILTER_LEER, person: "p2" }, heute),
    ).toBe(false);
    expect(
      passtZuFilter(a, undefined, { ...FILTER_LEER, person: "ohne" }, heute),
    ).toBe(false);
    expect(
      passtZuFilter(
        aufgabe({}),
        undefined,
        { ...FILTER_LEER, person: "ohne" },
        heute,
      ),
    ).toBe(true);
  });
  it("Suche in Titel und Beschreibung", () => {
    const a = aufgabe({ beschreibung: "Eigentümer anrufen" });
    expect(
      passtZuFilter(a, undefined, { ...FILTER_LEER, suche: "bilker" }, heute),
    ).toBe(true);
    expect(
      passtZuFilter(a, undefined, { ...FILTER_LEER, suche: "anrufen" }, heute),
    ).toBe(true);
    expect(
      passtZuFilter(a, undefined, { ...FILTER_LEER, suche: "moltke" }, heute),
    ).toBe(false);
  });
});

describe("Rücksprachen", () => {
  it("neueste zuerst, ohne Dubletten", () => {
    expect(
      ruecksprachen([
        aufgabe({ ruecksprache: "Jour fixe", ruecksprachAm: "2026-10-20" }),
        aufgabe({
          ruecksprache: "Mandat Moltkestraße",
          ruecksprachAm: "2026-10-27",
        }),
        aufgabe({ ruecksprache: "Jour fixe", ruecksprachAm: "2026-10-13" }),
      ]),
    ).toEqual(["Mandat Moltkestraße", "Jour fixe"]);
  });
  it("Notiz in Aufgaben zerlegen", () => {
    expect(
      aufgabenAusNotiz(
        "- Exposé prüfen\n\n2. Eigentümer anrufen\n• Fotos bestellen\n[ ] Termin",
      ),
    ).toEqual([
      "Exposé prüfen",
      "Eigentümer anrufen",
      "Fotos bestellen",
      "Termin",
    ]);
  });
});

describe("Themenfelder", () => {
  const offen = { id: "s", titel: "Offen", position: 1000, erledigt: false };
  const fertig = { id: "e", titel: "Erledigt", position: 2000, erledigt: true };
  const spalten = new Map([
    ["s", offen],
    ["e", fertig],
  ]);
  const heute = "2026-10-28";

  it("Filter nach Themenfeld, auch „ohne“", () => {
    const a = aufgabe({ themenfeld: "strategie" });
    const f = { ...FILTER_LEER, themenfeld: "strategie" as const };
    expect(passtZuFilter(a, offen, f, heute)).toBe(true);
    expect(passtZuFilter(aufgabe({}), offen, f, heute)).toBe(false);
    expect(
      passtZuFilter(
        aufgabe({}),
        offen,
        { ...FILTER_LEER, themenfeld: "" },
        heute,
      ),
    ).toBe(true);
  });

  it("zählt offene, überfällige und kürzlich erledigte Aufgaben", () => {
    const st = themenStaende(
      [
        aufgabe({ themenfeld: "strategie", prioritaet: "hoch" }),
        aufgabe({ themenfeld: "strategie", faelligAm: "2026-10-01" }),
        aufgabe({
          themenfeld: "strategie",
          spalteId: "e",
          erledigtAm: "2026-10-20T10:00:00Z",
        }),
        aufgabe({
          themenfeld: "strategie",
          spalteId: "e",
          erledigtAm: "2026-08-01T10:00:00Z",
        }),
      ],
      spalten,
      heute,
    );
    expect(st.find((s) => s.themenfeld === "strategie")).toEqual({
      themenfeld: "strategie",
      offen: 2,
      ueberfaellig: 1,
      hoch: 1,
      erledigt30: 1,
    });
    // „Ohne Themenfeld“ erscheint nur, wenn es belegt ist.
    expect(st.some((s) => s.themenfeld === "")).toBe(false);
  });
});
