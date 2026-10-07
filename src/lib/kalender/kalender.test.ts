import { describe, expect, it } from "vitest";
import {
  istMonatsende,
  nterWerktag,
  plusMonate,
  tageZwischen,
  wochentag,
} from "./index";

describe("Kalender", () => {
  it("kappt Monatsaddition auf Monatsende", () => {
    expect(plusMonate("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMonate("2024-01-31", 1)).toBe("2024-02-29");
    expect(plusMonate("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("zählt Tage", () => {
    expect(tageZwischen("2026-01-01", "2026-12-31")).toBe(364);
    expect(tageZwischen("2026-03-01", "2026-02-01")).toBe(-28);
  });
  it("erkennt Monatsende und Werktage", () => {
    expect(istMonatsende("2026-02-28")).toBe(true);
    expect(wochentag("2026-10-07")).toBe(3);
    // 01.11.2026 ist ein Sonntag → 3. Werktag ist Mittwoch, 04.11.
    expect(nterWerktag(2026, 11, 3)).toBe("2026-11-04");
  });
});
