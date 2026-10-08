import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import { erzeugeCrmMock } from "@/lib/db/mock/transaktionen";
import {
  ankaufKennzahlen,
  ekBedarfAbAngebot,
  einheitenVertrieb,
  naechstePhase,
  pipelinePruefFaelle,
  pipelineSummen,
} from "./transaktionen";

const STICHTAG = "2026-10-07";
const d = erzeugeSeed(STICHTAG);
const crm = erzeugeCrmMock(d);
const k = crm.ankaeufe.map((a) => ankaufKennzahlen(a, STICHTAG));

describe("Muster-Transaktionen", () => {
  it("sind deterministisch", () => {
    expect(erzeugeCrmMock(d)).toEqual(crm);
    expect(crm).toEqual(d.crm);
  });
});

describe("Ankaufspipeline", () => {
  it("rechnet Faktor, Rendite und EK-Bedarf inkl. Nebenkosten", () => {
    const a = k.find((x) => x.ankauf.id === "AK-2026-001")!;
    // 860 m² × 1.850 €/m² → 1,59 Mio. €, Miete 860 × 8,40 × 12
    expect(a.ankauf.angebotspreis).toBe(1_590_000);
    expect(a.faktor).toBeCloseTo(1_590_000 / 86_688, 6);
    expect(a.bruttoRendite).toBeCloseTo(86_688 / 1_590_000, 6);
    // ohne Makler: 8,5 % Nebenkosten, EK-Quote 25 %
    expect(a.ekBedarf).toBeCloseTo(1_590_000 * 1.085 * 0.25, 2);
  });

  it("markiert stockende Deals nach 30 bzw. 60 Tagen", () => {
    expect(k.find((x) => x.ankauf.id === "AK-2026-004")!.ampel).toBe("gelb"); // 41 Tage
    expect(k.find((x) => x.ankauf.id === "AK-2026-008")!.ampel).toBe("rot"); // 64 Tage
    expect(k.find((x) => x.ankauf.id === "AK-2026-012")!.ampel).toBe("grau"); // gekauft
  });

  it("summiert Volumen und gewichtetes Volumen je Phase", () => {
    const s = pipelineSummen(k);
    expect(s.reduce((x, p) => x + p.anzahl, 0)).toBe(crm.ankaeufe.length);
    const notar = s.find((p) => p.phase === "notar")!;
    expect(notar.gewichtet).toBeCloseTo(notar.volumen * 0.9, 2);
    expect(s.find((p) => p.phase === "abgesagt")!.gewichtet).toBe(0);
    const ab = ekBedarfAbAngebot(k);
    const erwartet = k
      .filter((x) =>
        ["angebot", "due_diligence", "notar"].includes(x.ankauf.phase),
      )
      .reduce((x, y) => x + y.ekBedarf, 0);
    expect(ab).toBeCloseTo(erwartet, 2);
  });

  it("führt Phasen der Reihe nach bis „gekauft“", () => {
    expect(naechstePhase("expose")).toBe("bewertung");
    expect(naechstePhase("notar")).toBe("gekauft");
    expect(naechstePhase("abgesagt")).toBeNull();
  });
});

describe("Abverkauf", () => {
  const v = einheitenVertrieb(d, crm);

  it("ordnet jeder Aufteiler-Einheit Käufer und Reservierung zu", () => {
    const aufteiler = d.units.filter(
      (u) => u.propertyId === "IM-2024-005" || u.propertyId === "IM-2025-006",
    );
    expect(v).toHaveLength(aufteiler.length);
    for (const x of v.filter((e) => e.unit.status === "verkauft")) {
      expect(x.fuehrend?.status).toBe("beurkundet");
      expect(x.kaeufer).not.toBeNull();
    }
  });

  it("meldet Statusabweichungen zwischen Einheit und Verkauf als Prüffall", () => {
    const abw = v.filter((x) => x.abweichung);
    expect(abw).toHaveLength(1);
    expect(abw[0].unit.status).toBe("im_vertrieb");
    const faelle = pipelinePruefFaelle(v, k, d, STICHTAG);
    expect(
      faelle.some((f) => f.id === `transaktionen:status:${abw[0].unit.id}`),
    ).toBe(true);
    expect(
      faelle.some(
        (f) =>
          f.id === "transaktionen:stockt:AK-2026-008" && f.severity === "rot",
      ),
    ).toBe(true);
    expect(
      faelle.some((f) => f.id === "transaktionen:stockt:AK-2026-004"),
    ).toBe(true);
  });
});
