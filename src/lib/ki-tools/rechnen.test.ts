import { describe, expect, it } from "vitest";

import { DCF_STANDARD, dcfRechnen, irr, type DcfEingabe } from "./rechnen";

const standard = Object.fromEntries(
  Object.entries(DCF_STANDARD).map(([k, v]) => [k, v.wert]),
) as Record<keyof typeof DCF_STANDARD, number>;

const eingabe: DcfEingabe = {
  ...standard,
  kaufpreis: 2_000_000,
  flaeche: 1015,
  einheiten: 16,
  mieteJahrIst: 124_513,
  mieteJahrMarkt: 140_000,
  exitFaktor: 16,
} as DcfEingabe;

describe("DCF", () => {
  it("IRR einer einfachen Zahlungsreihe", () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 6);
  });

  it("Kapitalwert ist beim maximalen Kaufpreis null", () => {
    const r = dcfRechnen(eingabe);
    expect(r.jahre).toHaveLength(11);
    expect(
      dcfRechnen({ ...eingabe, kaufpreis: r.maxKaufpreis }).kapitalwert,
    ).toBeCloseTo(0, 0);
  });
});
