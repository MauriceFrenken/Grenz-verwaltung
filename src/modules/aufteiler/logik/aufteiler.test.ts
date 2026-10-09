import { describe, expect, it } from "vitest";
import { aufteilerAuswerten } from "./aufteiler";

describe("Aufteilerprojekte", () => {
  it("rechnet den Gewinn aus Verkaufserlös minus Gesamtinvestition", () => {
    const [pempelfort, apollinaris] = aufteilerAuswerten({
      companies: [],
      properties: [],
      bankAccounts: [],
      transactions: [],
    });
    expect(pempelfort.investitionPlan).toBe(2_325_153);
    expect(pempelfort.erloes.base).toBe(2_804_506);
    expect(pempelfort.gewinn.base).toBe(479_353);
    // wie die Profit-Kennzahl der Kalkulation
    expect(pempelfort.marge.base).toBeCloseTo(0.2062, 4);
    expect(apollinaris.erloes.base).toBeCloseTo(1_902_522, 0);
    expect(apollinaris.ist.investition).toBe(0);
  });
});
