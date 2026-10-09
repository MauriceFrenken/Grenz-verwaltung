import { describe, expect, it } from "vitest";
import { abrufZeitraum } from "./sync";

describe("abrufZeitraum", () => {
  it("holt vom 1. des Vormonats bis heute", () => {
    expect(abrufZeitraum(new Date("2026-10-09T04:00:00Z"))).toEqual({
      von: "2026-09-01",
      bis: "2026-10-09",
    });
  });
  it("geht im Januar ins Vorjahr", () => {
    expect(abrufZeitraum(new Date("2027-01-02T04:00:00Z")).von).toBe(
      "2026-12-01",
    );
  });
});
