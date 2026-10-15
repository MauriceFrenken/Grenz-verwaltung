import { describe, expect, it } from "vitest";
import { abrufZeitraum, mitWiederholung } from "./sync";

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

describe("mitWiederholung", () => {
  it("wiederholt nach einem Netzabbruch", async () => {
    let n = 0;
    const r = await mitWiederholung(async () => {
      n++;
      if (n === 1) throw new Error("read ECONNRESET");
      return "ok";
    }, [0, 0]);
    expect(r).toBe("ok");
    expect(n).toBe(2);
  });
  it("wiederholt andere Fehler nicht", async () => {
    let n = 0;
    await expect(
      mitWiederholung(async () => {
        n++;
        throw new Error("EBICS 091116 Kunde gesperrt");
      }, [0, 0]),
    ).rejects.toThrow("gesperrt");
    expect(n).toBe(1);
  });
  it("gibt nach drei Netzabbrüchen auf", async () => {
    let n = 0;
    await expect(
      mitWiederholung(async () => {
        n++;
        throw new Error("read ECONNRESET");
      }, [0, 0]),
    ).rejects.toThrow("ECONNRESET");
    expect(n).toBe(3);
  });
});
