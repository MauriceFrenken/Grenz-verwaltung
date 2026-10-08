import { describe, expect, it } from "vitest";
import type { Beschluss } from "@/lib/db/typen";
import {
  beschlussLage,
  erledigtQuote,
  rundenDatum,
  tagesordnung,
  type RundeEingabe,
} from "./runde";

const T = "2026-10-08"; // Donnerstag

function beschluss(teil: Partial<Beschluss>): Beschluss {
  return {
    id: "BE-2026-001",
    rundeAm: "2026-10-05",
    text: "Testbeschluss",
    verantwortlich: "Max Mustermann",
    faelligAm: null,
    bezugTyp: null,
    bezugId: null,
    companyId: null,
    status: "offen",
    erledigtAm: null,
    ...teil,
  };
}

function eingabe(teil: Partial<RundeEingabe> = {}): RundeEingabe {
  return {
    stichtag: T,
    beschluesse: [],
    geld: {
      heute: 1_000_000,
      tief13: { saldo: 800_000, datum: "2026-11-20" },
      mindest: 300_000,
      unterPuffer: [],
      kontenOhneSaldo: 0,
      mindestFehlt: 0,
    },
    fristen: [],
    deals: [],
    ekBedarfAbAngebot: 0,
    ekFrei: 0,
    maschinen: {
      vorhanden: true,
      lagerwert: 0,
      icFinanzierung: 0,
      ueber90: [],
    },
    immobilienFaelle: [],
    luecken: [],
    ...teil,
  };
}

describe("rundenDatum", () => {
  it("liefert den nächsten Montag", () => {
    expect(rundenDatum("2026-10-08")).toBe("2026-10-12");
    expect(rundenDatum("2026-10-11")).toBe("2026-10-12");
  });
  it("ist am Montag der Tag selbst", () => {
    expect(rundenDatum("2026-10-12")).toBe("2026-10-12");
  });
});

describe("beschlussLage", () => {
  it("trennt offen, überfällig und neu erledigt", () => {
    const lage = beschlussLage(
      [
        beschluss({ id: "BE-2026-001", faelligAm: "2026-10-01" }),
        beschluss({ id: "BE-2026-002", faelligAm: "2026-10-20" }),
        beschluss({
          id: "BE-2026-003",
          status: "erledigt",
          erledigtAm: "2026-10-06",
        }),
        beschluss({
          id: "BE-2026-004",
          status: "erledigt",
          erledigtAm: "2026-09-01",
        }),
      ],
      T,
    );
    expect(lage.offen.map((b) => b.id)).toEqual(["BE-2026-001", "BE-2026-002"]);
    expect(lage.ueberfaellig.map((b) => b.id)).toEqual(["BE-2026-001"]);
    expect(lage.erledigtNeu.map((b) => b.id)).toEqual(["BE-2026-003"]);
  });
});

describe("tagesordnung", () => {
  it("hat immer sieben Punkte in fester Reihenfolge", () => {
    const top = tagesordnung(eingabe());
    expect(top.map((p) => p.id)).toEqual([
      "beschluesse",
      "geld",
      "fristen",
      "transaktionen",
      "baumaschinen",
      "immobilien",
      "daten",
    ]);
    expect(top.map((p) => p.nr)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("macht Geld grau, wenn Kontosalden fehlen", () => {
    const geld = tagesordnung(
      eingabe({ geld: { ...eingabe().geld, kontenOhneSaldo: 2 } }),
    )[1];
    expect(geld.ampel).toBe("grau");
    expect(geld.aussage).toContain("2 Konten ohne Saldo");
  });

  it("meldet eine Pufferunterschreitung in 13 Wochen mit Vorschlag", () => {
    const geld = tagesordnung(
      eingabe({
        geld: {
          ...eingabe().geld,
          unterPuffer: [
            {
              name: "Muster Holding GmbH",
              ab: "2026-12-01",
              luecke: 120_000,
              ampel: "rot",
            },
          ],
        },
      }),
    )[1];
    expect(geld.ampel).toBe("rot");
    expect(geld.aussage).toContain("Muster Holding GmbH");
    expect(geld.vorschlag).toContain("Muster Holding GmbH");
  });

  it("färbt Fristen unter 30 Tagen rot", () => {
    const f = tagesordnung(
      eingabe({
        fristen: [
          {
            id: "DL-2022-008",
            ereignis: "Ende",
            datum: "2026-10-30",
            restschuld: 60_000,
            nehmer: "MH",
          },
        ],
      }),
    )[2];
    expect(f.ampel).toBe("rot");
    expect(f.zahl).toBe("1");
    expect(f.vorschlag).toContain("DL-2022-008");
  });

  it("meldet zu wenig Eigenkapital für die Pipeline", () => {
    const tx = tagesordnung(
      eingabe({
        deals: [
          {
            id: "AK-2026-001",
            name: "Muster Deal",
            phase: "Angebot",
            naechsterSchritt: "Angebot abgeben",
            naechsterSchrittAm: "2026-10-10",
            ekBedarf: 500_000,
          },
        ],
        ekBedarfAbAngebot: 500_000,
        ekFrei: 200_000,
      }),
    )[3];
    expect(tx.ampel).toBe("rot");
    expect(tx.zeilen).toHaveLength(1);
    expect(tx.aussage).toContain("priorisieren");
  });

  it("zeigt fehlenden Maschinenbestand als Lücke statt als Null", () => {
    const bm = tagesordnung(
      eingabe({
        maschinen: {
          vorhanden: false,
          lagerwert: 0,
          icFinanzierung: 767_500,
          ueber90: [],
        },
      }),
    )[4];
    expect(bm.ampel).toBe("grau");
    expect(bm.zahl).toBe("–");
    expect(bm.vorschlag).toContain("importieren");
  });
});

describe("erledigtQuote", () => {
  it("rechnet den Anteil erledigter Beschlüsse", () => {
    expect(erledigtQuote([])).toBe("–");
    expect(
      erledigtQuote([
        beschluss({ status: "erledigt" }),
        beschluss({ status: "offen" }),
      ]),
    ).toMatch(/^50\s?%$/);
  });
});
