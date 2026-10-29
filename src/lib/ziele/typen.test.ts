import { describe, expect, it } from "vitest";

import { jahresanteil, zielerreichung } from "./typen";

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
