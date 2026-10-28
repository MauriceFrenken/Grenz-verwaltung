import { describe, expect, it } from "vitest";

import {
  loeschenAb,
  loeschfaellig,
  tageSeit,
  type Bewerber,
} from "./recruiting";

const basis: Bewerber = {
  id: "b1",
  stelleId: null,
  name: "Test",
  email: null,
  telefon: null,
  quelle: null,
  phase: "eingang",
  reihenfolge: 0,
  bewertung: null,
  eingegangenAm: "2026-10-01",
  verfuegbarAb: null,
  gehaltsvorstellung: null,
  unterlagenUrl: null,
  naechsterTermin: null,
  notizen: null,
  absageGrund: null,
  abgeschlossenAm: null,
  talentpoolBis: null,
  mitarbeiterId: null,
};

describe("Löschfrist Bewerberdaten", () => {
  it("läuft erst nach Abschluss des Verfahrens", () => {
    expect(loeschenAb(basis)).toBeNull();
    expect(
      loeschenAb({ ...basis, phase: "gespraech", abgeschlossenAm: null }),
    ).toBeNull();
  });

  it("beträgt 6 Monate ab Absage, auch am Monatsende", () => {
    const b = {
      ...basis,
      phase: "abgesagt" as const,
      abgeschlossenAm: "2026-08-31T10:00:00Z",
    };
    expect(loeschenAb(b)).toBe("2027-02-28");
    expect(loeschfaellig(b, "2027-02-27")).toBe(false);
    expect(loeschfaellig(b, "2027-02-28")).toBe(true);
  });

  it("verlängert sich mit Einwilligung in den Talentpool", () => {
    const b = {
      ...basis,
      phase: "abgesagt" as const,
      abgeschlossenAm: "2026-10-01T00:00:00Z",
      talentpoolBis: "2028-10-01",
    };
    expect(loeschenAb(b)).toBe("2028-10-01");
    // Ein Talentpool-Datum vor der Regelfrist verkürzt sie nicht.
    expect(loeschenAb({ ...b, talentpoolBis: "2026-12-01" })).toBe(
      "2027-04-01",
    );
  });
});

describe("tageSeit", () => {
  it("zählt Kalendertage, nie negativ", () => {
    expect(tageSeit("2026-10-01", "2026-10-28")).toBe(27);
    expect(tageSeit("2026-11-01", "2026-10-28")).toBe(0);
  });
});
