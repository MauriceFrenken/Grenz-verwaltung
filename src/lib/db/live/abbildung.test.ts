import { describe, expect, it } from "vitest";
import { abbilden, ibanAusDateiname, type LiveRohdaten } from "./abbildung";

const IBAN = "DE02100100100000000001";

/** Minimaler Datenbestand im Format von Bens Tabellen (fiktive Werte). */
function roh(teil: Partial<LiveRohdaten> = {}): LiveRohdaten {
  return {
    stichtag: "2026-10-08",
    gesellschaften: [
      {
        id: "G-05",
        kuerzel: "FHG",
        name: "Muster Holding",
        mindestliquiditaet: 50000,
      },
      {
        id: "G-09",
        kuerzel: "FB",
        name: "Muster Baumaschinen",
        mindestliquiditaet: null,
      },
      { id: "G-10", kuerzel: "GC", name: "Muster Makler", segment: "makler" },
    ],
    objekte: [
      {
        id: "O-01",
        bezeichnung: "Musterhaus",
        gesellschaft_id: "G-05",
        strategie: null,
        kaufpreis: 1000000,
        kaufdatum: "2020-01-01",
        plz: "40000",
      },
    ],
    einheiten: [],
    mietverhaeltnisse: [],
    personen: [],
    mieterhoehungen: [],
    darlehen: [],
    darlehenStand: [],
    darlehenBuchungen: [],
    bankbuchungen: [
      {
        id: "b1",
        konto_iban: IBAN,
        gesellschaft_id: "G-05",
        buchungsdatum: "2026-10-01",
        betrag: -1000,
        fingerprint: "f1",
      },
      {
        id: "b2",
        konto_iban: IBAN,
        gesellschaft_id: "G-05",
        buchungsdatum: "2026-10-05",
        betrag: 500,
        fingerprint: "f2",
      },
    ],
    bankbuchungenRoh: 3,
    ebicsKonten: [],
    ebicsKunden: [],
    bankkonten: [],
    kontosalden: [
      { iban: IBAN, stichtag: "2026-10-05", saldo: 20000, quelle: "camt053" },
    ],
    sollZuordnungen: [],
    sollPositionen: [],
    planposten: [],
    ankaufPipeline: [],
    objektVerkauf: [],
    einheitenVerkauf: [],
    exposes: [],
    profiles: [],
    maschinen: [],
    maschinenKosten: [],
    fehlendeMigration: [],
    ...teil,
  };
}

describe("Abbildung von Bens Tabellen", () => {
  it("liest die IBAN aus dem Dateinamen des EBICS-Abrufs", () => {
    expect(ibanAusDateiname(`EBICS C53 ${IBAN} 2026-10-01`)).toBe(IBAN);
    expect(ibanAusDateiname("Upload.xml")).toBeNull();
  });

  it("nutzt die Segment-Annahme, solange die Spalte fehlt", () => {
    const d = abbilden(roh());
    expect(d.quelle).toBe("live");
    expect(d.companies.find((c) => c.id === "G-09")?.segment).toBe(
      "baumaschinen_handel",
    );
    expect(d.companies.find((c) => c.id === "G-10")?.separateArea).toBe(true);
  });

  it("erfindet keine Mindestliquidität und meldet sie als Lücke", () => {
    const d = abbilden(roh());
    const fb = d.companies.find((c) => c.id === "G-09")!;
    expect(fb.minLiquidityGesetzt).toBe(false);
    expect(fb.minLiquidity).toBe(0);
    expect(d.luecken.map((l) => l.id)).toContain(
      "gesellschaften:mindestliquiditaet:G-09",
    );
    // getrennter Bereich braucht keine Mindestliquidität
    expect(d.luecken.map((l) => l.id)).not.toContain(
      "gesellschaften:mindestliquiditaet:G-10",
    );
  });

  it("rechnet den Anfangsbestand aus dem letzten Saldo zurück", () => {
    const d = abbilden(roh());
    const konto = d.bankAccounts.find((k) => k.iban === IBAN)!;
    expect(konto.saldoBekannt).toBe(true);
    expect(konto.saldoStichtag).toBe("2026-10-05");
    // 20.000 am 05.10. minus Umsätze bis dahin (−1.000 + 500)
    expect(konto.openingBalance).toBe(20500);
  });

  it("markiert Konten ohne Saldo und Gesellschaften ohne Konto", () => {
    const d = abbilden(roh({ kontosalden: [] }));
    const ids = d.luecken.map((l) => l.id);
    expect(d.bankAccounts[0].saldoBekannt).toBe(false);
    expect(ids).toContain(`konten:saldo:${IBAN}`);
    expect(ids).toContain("konten:keine:G-09");
  });

  it("meldet Dubletten, fehlende Migration und fehlende Objekt-Strategie", () => {
    const d = abbilden(roh({ fehlendeMigration: ["maschinen"] }));
    const ids = d.luecken.map((l) => l.id);
    expect(ids).toContain("system:bankbuchungen-dubletten");
    expect(ids).toContain("system:migration:maschinen");
    expect(ids).toContain("immobilien:stammdaten:O-01");
    const o = d.properties[0];
    expect(o.strategy).toBe("bestand");
    expect(o.strategyGesetzt).toBe(false);
  });

  it("liefert je Quelle einen Datenstand", () => {
    const d = abbilden(roh());
    expect(d.datenstand.map((q) => q.id)).toEqual(
      expect.arrayContaining(["bankumsaetze", "kontosalden", "darlehen"]),
    );
  });
});
