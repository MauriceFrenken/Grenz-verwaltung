import { describe, expect, it } from "vitest";
import { loanSchema, transactionSchema, unitSchema } from "../typen";
import { erzeugeSeed } from "./seed";

const STICHTAG = "2026-10-07";

describe("Seed-Daten", () => {
  const d = erzeugeSeed(STICHTAG);

  it("enthält eine glaubwürdige Gruppe", () => {
    expect(d.companies).toHaveLength(9);
    expect(d.companies.filter((c) => !c.separateArea)).toHaveLength(8);
    expect(d.properties).toHaveLength(6);
    expect(d.units.length).toBeGreaterThanOrEqual(55);
    expect(d.units.length).toBeLessThanOrEqual(65);
    expect(d.loans).toHaveLength(25);
  });

  it("ist deterministisch", () => {
    const zweite = erzeugeSeed(STICHTAG);
    expect(zweite.transactions.length).toBe(d.transactions.length);
    expect(zweite.transactions[100]).toEqual(d.transactions[100]);
  });

  it("deckt 12 Monate Kontoumsätze ab", () => {
    const daten = d.transactions.map((t) => t.bookingDate).sort();
    expect(daten[0] >= "2025-10-01").toBe(true);
    expect(daten.at(-1)! <= STICHTAG).toBe(true);
    expect(
      new Set(daten.map((x) => x.slice(0, 7))).size,
    ).toBeGreaterThanOrEqual(12);
  });

  it("erfüllt die Schemas", () => {
    for (const l of d.loans) expect(() => loanSchema.parse(l)).not.toThrow();
    for (const u of d.units) expect(() => unitSchema.parse(u)).not.toThrow();
    for (const t of d.transactions.slice(0, 200))
      expect(() => transactionSchema.parse(t)).not.toThrow();
  });

  it("hält IDs im vorgegebenen Format", () => {
    expect(d.properties.every((p) => /^IM-\d{4}-\d{3}$/.test(p.id))).toBe(true);
    expect(d.loans.every((l) => /^DL-\d{4}-\d{3}$/.test(l.id))).toBe(true);
    expect(
      d.loans
        .filter((l) => l.bankRef)
        .every((l) => /^BK-\d{4}-\d{3}$/.test(l.bankRef!)),
    ).toBe(true);
  });

  it("lässt kein Konto im Jahresverlauf ins Minus laufen", () => {
    for (const k of d.bankAccounts) {
      let saldo = k.openingBalance;
      for (const t of d.transactions.filter((t) => t.accountId === k.id)) {
        saldo += t.amount;
        expect(saldo).toBeGreaterThan(0);
      }
    }
  });

  it("verwendet nur fiktive Namen", () => {
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/FRENKEN/i);
  });
});
