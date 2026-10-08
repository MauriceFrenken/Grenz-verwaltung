import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import { darlehenAuswerten } from "@/modules/darlehen/useDarlehen";
import { fristenBis, kapitalbindung, letzteBuchungen } from "./antworten";

const STICHTAG = "2026-10-08";
const daten = erzeugeSeed(STICHTAG);
const { staende } = darlehenAuswerten(daten);

describe("kapitalbindung", () => {
  const { summe, posten } = kapitalbindung(staende, daten.companies);

  it("summiert nur aktive IC-Darlehen der Holding an andere Segmente", () => {
    const erwartet = staende
      .filter((s) => {
        const l = s.loan;
        const geber = daten.companies.find((c) => c.id === l.lenderCompanyId);
        const nehmer = daten.companies.find(
          (c) => c.id === l.borrowerCompanyId,
        );
        return (
          l.status === "aktiv" &&
          l.kind === "intercompany" &&
          geber?.segment === "holding" &&
          nehmer != null &&
          nehmer.segment !== "holding"
        );
      })
      .reduce((a, s) => a + Math.max(0, s.restschuld), 0);
    expect(summe).toBeCloseTo(erwartet, 2);
    expect(summe).toBeGreaterThan(0);
  });

  it("liefert Anteile, die sich zu 100 % addieren, absteigend sortiert", () => {
    const anteile = posten.reduce((a, p) => a + p.anteil, 0);
    expect(anteile).toBeCloseTo(1, 6);
    for (let i = 1; i < posten.length; i++)
      expect(posten[i - 1].betrag).toBeGreaterThanOrEqual(posten[i].betrag);
  });

  it("ist leer ohne Darlehen", () => {
    expect(kapitalbindung([], daten.companies)).toEqual({
      summe: 0,
      posten: [],
    });
  });
});

describe("fristenBis", () => {
  it("enthält nur aktive Darlehen bis zum Horizont, nach Datum sortiert", () => {
    const f = fristenBis(staende, STICHTAG, 365);
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) {
      expect(x.stand.loan.status).toBe("aktiv");
      expect(x.datum <= "2027-10-08").toBe(true);
    }
    const daten = f.map((x) => x.datum);
    expect([...daten].sort()).toEqual(daten);
  });

  it("filtert nach Gesellschaft", () => {
    const alle = fristenBis(staende, STICHTAG, 365);
    const keine = fristenBis(staende, STICHTAG, 365, () => false);
    expect(keine).toHaveLength(0);
    expect(alle.length).toBeGreaterThanOrEqual(keine.length);
  });
});

describe("letzteBuchungen", () => {
  it("liefert die neuesten Buchungen mit Gesellschaftskürzel", () => {
    const b = letzteBuchungen(daten, 5);
    expect(b).toHaveLength(5);
    expect(b[0].datum >= b[4].datum).toBe(true);
    expect(b.every((x) => x.kuerzel !== "–")).toBe(true);
  });
});
