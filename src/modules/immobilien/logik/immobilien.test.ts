import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import type { Lease, LeaseEvent, Tenant, Transaction } from "@/lib/db/typen";
import { darlehenStand } from "@/modules/darlehen/logik/auswertung";
import {
  kuendigungFristende,
  kuendigungsfristMonate,
  mieterhoehungFristen,
} from "./fristen";
import {
  erhoehungsPotenzial,
  mieterhoehungInfo,
  mietKonto,
  sollMiete,
} from "./mieten";
import { immobilienAuswerten } from "./objekte";

const lease: Lease = {
  id: "mv-1",
  unitId: "u-1",
  tenantId: "t-1",
  start: "2018-03-01",
  end: null,
  baseRent: 800,
  serviceCharge: 200,
  deposit: 2400,
  lastRentIncrease: null,
};
const tenant: Tenant = { id: "t-1", name: "Anna Beispiel", iban: "DE00T1" };

describe("§ 558b BGB Mieterhöhung", () => {
  it("Zustimmung bis Ende des zweiten Monats nach Zugang, wirksam ab dem dritten", () => {
    expect(mieterhoehungFristen("2026-08-20")).toEqual({
      zustimmungBis: "2026-10-31",
      wirksamAb: "2026-11-01",
    });
    expect(mieterhoehungFristen("2026-12-01")).toEqual({
      zustimmungBis: "2027-02-28",
      wirksamAb: "2027-03-01",
    });
  });

  it("erhöht die Soll-Miete erst ab Wirksamkeit und nur bei Zustimmung", () => {
    const ev: LeaseEvent = {
      id: "e",
      leaseId: "mv-1",
      kind: "mieterhoehung",
      receivedOn: "2026-08-20",
      newBaseRent: 880,
      status: "zugestimmt",
    };
    expect(sollMiete(lease, [ev], "2026-10-01")).toBe(1000);
    expect(sollMiete(lease, [ev], "2026-11-01")).toBe(1080);
    expect(sollMiete(lease, [{ ...ev, status: "offen" }], "2026-11-01")).toBe(
      1000,
    );
  });

  it("meldet abgelaufene Zustimmungsfrist rot und knappe Frist gelb", () => {
    const ev = {
      id: "e",
      leaseId: "mv-1",
      kind: "mieterhoehung" as const,
      receivedOn: "2026-07-29",
      newBaseRent: 880,
      status: "offen" as const,
    };
    expect(mieterhoehungInfo(ev, lease, [ev], "2026-10-07").ampel).toBe("rot");
    expect(
      mieterhoehungInfo(
        { ...ev, receivedOn: "2026-08-23" },
        lease,
        [ev],
        "2026-10-20",
      ).ampel,
    ).toBe("gelb");
    expect(
      mieterhoehungInfo(
        { ...ev, receivedOn: "2026-08-23" },
        lease,
        [ev],
        "2026-10-07",
      ).ampel,
    ).toBe("grau");
  });

  it("begrenzt das Erhöhungspotenzial auf die Kappungsgrenze", () => {
    // 80 m² × 13 €/m² = 1.040 €, Kappung 800 × 1,15 = 920 €
    expect(
      erhoehungsPotenzial(lease, [], 80, 13, "2026-10-07").potenzialMonat,
    ).toBe(120);
    expect(
      erhoehungsPotenzial(lease, [], 80, 10.5, "2026-10-07").potenzialMonat,
    ).toBe(40);
  });
});

describe("§ 573c BGB Kündigung", () => {
  it("Mieter: Zugang bis 3. Werktag → Ablauf des übernächsten Monats", () => {
    // 03.11.2026 ist der 2. Werktag (01.11. Sonntag)
    expect(kuendigungFristende("mieter", "2020-01-01", "2026-11-03")).toBe(
      "2027-01-31",
    );
    // 3. Werktag im November 2026 ist der 04.11.
    expect(kuendigungFristende("mieter", "2020-01-01", "2026-11-04")).toBe(
      "2027-01-31",
    );
    expect(kuendigungFristende("mieter", "2020-01-01", "2026-11-05")).toBe(
      "2027-02-28",
    );
  });

  it("Vermieter: Frist verlängert sich nach 5 und 8 Jahren", () => {
    expect(
      kuendigungsfristMonate("vermieter", "2023-01-01", "2026-10-01"),
    ).toBe(3);
    expect(
      kuendigungsfristMonate("vermieter", "2020-01-01", "2026-10-01"),
    ).toBe(6);
    expect(
      kuendigungsfristMonate("vermieter", "2015-01-01", "2026-10-01"),
    ).toBe(9);
    expect(kuendigungFristende("vermieter", "2015-01-01", "2026-10-01")).toBe(
      "2027-06-30",
    );
  });
});

describe("Mietkonto", () => {
  const zahlung = (datum: string, betrag: number): Transaction => ({
    id: datum,
    accountId: "k",
    bookingDate: datum,
    amount: betrag,
    counterpartyName: "Anna Beispiel",
    counterpartyIban: "DE00T1",
    purpose: "Miete",
    category: "miete",
    propertyId: "IM-2020-001",
  });

  it("berechnet Rückstand und Ampel", () => {
    const tx = [
      zahlung("2026-07-02", 1000),
      zahlung("2026-08-03", 1000),
      zahlung("2026-09-02", 500),
    ];
    const k = mietKonto(lease, [], tenant, tx, "2026-10-07", 4);
    expect(k.monate.map((m) => m.monat)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(k.rueckstand).toBe(1500);
    expect(k.ampel).toBe("gelb");
    const k2 = mietKonto(lease, [], tenant, tx.slice(0, 1), "2026-10-07", 4);
    expect(k2.ampel).toBe("rot");
  });

  it("zählt den laufenden Monat erst ab dem 3. Werktag", () => {
    const k = mietKonto(lease, [], tenant, [], "2026-10-02", 1);
    expect(k.monate).toHaveLength(0);
  });
});

describe("Auswertung auf Seed-Daten", () => {
  const d = erzeugeSeed("2026-10-07");
  const staende = d.loans.map((l) => darlehenStand(l, d.stichtag));
  const a = immobilienAuswerten(d, staende);

  it("findet die eingebauten Rückstände", () => {
    const rot = a.mietKonten
      .filter((k) => k.ampel === "rot")
      .map((k) => k.lease.unitId);
    const gelb = a.mietKonten
      .filter((k) => k.ampel === "gelb")
      .map((k) => k.lease.unitId);
    expect(rot).toContain("IM-2019-003-WE04");
    expect(gelb).toEqual(
      expect.arrayContaining(["IM-2018-002-WE08", "IM-2021-004-WE03"]),
    );
    expect(a.mietKonten.filter((k) => k.ampel !== "gruen")).toHaveLength(3);
  });

  it("berechnet Leerstand, DSCR und Aufteiler-Projekte", () => {
    const linden = a.objekte.find((o) => o.property.id === "IM-2018-002")!;
    expect(linden.leer).toHaveLength(2);
    expect(linden.dscr).toBeLessThan(1.1);
    expect(linden.ampel).toBe("rot");
    const suedstadt = a.projekte.find((p) => p.project.id === "pj-suedstadt")!;
    expect(suedstadt.verkauft).toBe(4);
    expect(suedstadt.erloeseIst).toBeGreaterThan(0);
    expect(suedstadt.margeQuote).toBeGreaterThan(0);
  });

  it("erzeugt Prüffälle für Fristen und Rückstände", () => {
    const ids = a.pruefFaelle.map((p) => p.id);
    expect(
      ids.some((i) => i.startsWith("immobilien:mieterhoehung:ev-005")),
    ).toBe(true);
    expect(ids.some((i) => i.startsWith("immobilien:kuendigung:ev-002"))).toBe(
      true,
    );
    expect(
      ids.filter((i) => i.startsWith("immobilien:rueckstand")),
    ).toHaveLength(3);
  });
});
