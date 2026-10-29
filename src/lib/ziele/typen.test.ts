import { describe, expect, it } from "vitest";

import { jahresanteil, wirksameZiele, zielerreichung } from "./typen";

describe("Ziele", () => {
  it("zielerreichung kappt bei 100 % und ist ohne Ziel null", () => {
    expect(zielerreichung(125_000, 250_000)).toBe(0.5);
    expect(zielerreichung(300_000, 250_000)).toBe(1);
    expect(zielerreichung(10, null)).toBeNull();
    expect(zielerreichung(10, 0)).toBeNull();
  });
  it("jahresanteil zählt den heutigen Tag mit", () => {
    expect(jahresanteil("2026-12-31")).toBe(1);
    expect(jahresanteil("2026-01-01")).toBeCloseTo(1 / 365);
    expect(jahresanteil("2026-07-02")).toBeCloseTo(183 / 365);
  });
});

describe("wirksameZiele", () => {
  const leer = { provision_netto: null, verkaeufe: null, neue_mandate: null };
  it("nimmt Eingetragenes vor Mitarbeiterzielen vor Standard", () => {
    const w = wirksameZiele(2026, { ...leer, verkaeufe: 4 }, 200_000);
    expect(w.ziele).toEqual({
      provision_netto: 200_000,
      verkaeufe: 4,
      neue_mandate: 36,
    });
    expect(w.quelle).toEqual({
      provision_netto: "mitarbeiter",
      verkaeufe: "eingetragen",
      neue_mandate: "standard",
    });
  });
  it("ohne Standard für das Jahr bleibt das Ziel leer", () => {
    const w = wirksameZiele(2030, leer, null);
    expect(w.ziele.provision_netto).toBeNull();
    expect(w.quelle.provision_netto).toBeNull();
  });
});
