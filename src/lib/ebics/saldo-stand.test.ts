import { describe, expect, it } from "vitest";
import { letzteSalden, saldoStand } from "./saldo-stand";

describe("saldoStand", () => {
  it("schiebt den Stand eines EBICS-Kontos ohne Bewegung auf den letzten Abruf", () => {
    expect(saldoStand("2026-10-15", "ebics", "2026-10-28")).toBe("2026-10-28");
  });
  it("lässt jüngere Salden und Konten ohne EBICS unverändert", () => {
    expect(saldoStand("2026-10-28", "ebics", "2026-10-27")).toBe("2026-10-28");
    expect(saldoStand("2026-10-15", "import", "2026-10-28")).toBe("2026-10-15");
    expect(saldoStand(null, "ebics", "2026-10-28")).toBeNull();
  });
});

describe("letzteSalden", () => {
  it("nimmt den jüngsten Tag und am selben Tag camt.053 vor dem Import", () => {
    const m = letzteSalden([
      { iban: "A", stichtag: "2026-10-23", saldo: 5799.27, quelle: "import" },
      { iban: "A", stichtag: "2026-10-23", saldo: 5792.79, quelle: "camt053" },
      { iban: "A", stichtag: "2026-10-22", saldo: 1, quelle: "camt053" },
    ]);
    expect(m.get("A")).toEqual({ stichtag: "2026-10-23", saldo: 5792.79 });
  });
});
