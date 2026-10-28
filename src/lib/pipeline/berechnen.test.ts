import { describe, expect, it } from "vitest";

import {
  berechnePipeline,
  monatPlus,
  prognose,
  stufeAendern,
  type DealEingabe,
  type MandatEingabe,
} from "./berechnen";

function mandat(
  sfId: string,
  status: string | null,
  extra: Partial<MandatEingabe> = {},
): MandatEingabe {
  return {
    sfId,
    name: `M-${sfId}`,
    status,
    art: null,
    angebotspreis: null,
    provisionProzent: 5,
    realEstateSfId: `re-${sfId}`,
    daten: { CreatedDate: "2026-01-01T00:00:00Z" },
    ...extra,
  };
}

function deal(
  sfId: string,
  re: string,
  phase: string,
  extra: Partial<DealEingabe> = {},
  daten = {},
): DealEingabe {
  return {
    sfId,
    name: `Opp. ${sfId}`,
    phase,
    betrag: null,
    abschlussAm: null,
    mandatSfId: null,
    daten: { Real_Estate__c: re, ...daten },
    ...extra,
  };
}

const basis = {
  objekte: [],
  letzteAktivitaet: new Map([
    ["a", "2026-10-20"],
    ["b", "2026-10-20"],
  ]),
  heute: "2026-10-27",
};

describe("berechnePipeline", () => {
  it("nimmt den fortgeschrittensten Interessenten und dessen Schlusstermin", () => {
    const dto = berechnePipeline({
      ...basis,
      mandate: [mandat("a", "Beauftragung", { angebotspreis: 1_000_000 })],
      deals: [
        deal("o1", "re-a", "Initial interest"),
        deal("o2", "re-a", "Negotiation", {
          abschlussAm: "2027-01-15",
          betrag: 900_000,
        }),
        deal("o3", "re-a", "Closed Lost"),
      ],
    });
    expect(dto.deals).toHaveLength(1);
    const d = dto.deals[0];
    expect(d.stufe).toBe("verhandlung");
    expect(d.kaufpreis).toBe(900_000);
    expect(d.provision).toBe(45_000);
    expect(d.notarMonat).toBe("2027-01");
    expect(d.notarQuelle).toBe("salesforce");
    expect(d.weitereInteressenten).toBe(1);
  });

  it("schätzt den Notarmonat bei überschrittenem Schlusstermin und meldet ihn", () => {
    const dto = berechnePipeline({
      ...basis,
      mandate: [mandat("a", "Beauftragung", { angebotspreis: 1_150_000 })],
      deals: [deal("o1", "re-a", "Data Room", { abschlussAm: "2026-08-31" })],
    });
    const d = dto.deals[0];
    expect(d.stufe).toBe("besichtigung");
    expect(d.notarMonat).toBe("2027-01");
    expect(d.hinweise.some((h) => h.includes("überschritten"))).toBe(true);
  });

  it("legt bezahlte Deals unter Ist ab und meldet nicht nachgezogene Mandate", () => {
    const dto = berechnePipeline({
      ...basis,
      mandate: [mandat("a", "Gewonnen"), mandat("b", "Beauftragung")],
      deals: [
        deal(
          "o1",
          "re-a",
          "Invoice Paid",
          { abschlussAm: "2026-02-19", betrag: 1_500_000 },
          { Provision_in__c: 75_000 },
        ),
        deal("o2", "re-b", "Invoice Paid", {
          abschlussAm: "2026-07-29",
          betrag: 2_060_000,
        }),
      ],
    });
    expect(dto.deals).toHaveLength(0);
    expect(dto.abschluesse.map((a) => a.provision)).toEqual([103_000, 75_000]);
    expect(dto.datenhinweise).toHaveLength(1);
  });

  it("ignoriert Testdatensätze und verlorene Mandate, nimmt 5 % ohne Satz an", () => {
    const dto = berechnePipeline({
      ...basis,
      mandate: [
        mandat("a", "Akquisition", {
          provisionProzent: null,
          angebotspreis: 2_000_000,
        }),
        mandat("b", "Verloren"),
      ],
      deals: [deal("x", "re-a", "Initial interest", { name: "Test SG" })],
    });
    expect(dto.deals).toHaveLength(1);
    expect(dto.deals[0].stufe).toBe("erstkontakt");
    expect(dto.deals[0].provision).toBe(100_000);
    expect(dto.deals[0].provisionProzentAngenommen).toBe(true);
  });
});

describe("prognose", () => {
  it("gewichtet je Notarmonat und zählt Ist", () => {
    const dto = berechnePipeline({
      ...basis,
      mandate: [mandat("a", "Beauftragung", { angebotspreis: 1_000_000 })],
      deals: [
        deal("o1", "re-a", "Negotiation", {
          abschlussAm: "2026-12-10",
          betrag: 1_000_000,
        }),
        deal("o2", "re-z", "Invoice Paid", {
          abschlussAm: "2026-07-29",
          betrag: 1_000_000,
        }),
      ],
    });
    const monate = prognose(dto);
    expect(monate[0].monat).toBe(monatPlus("2026-10", -6));
    expect(monate.find((m) => m.monat === "2026-12")?.gewichtet).toBe(40_000);
    expect(monate.find((m) => m.monat === "2026-07")?.ist).toBe(50_000);
  });
});

describe("manuelle Stufe", () => {
  const eingabe = {
    ...basis,
    mandate: [mandat("a", "Beauftragung", { angebotspreis: 1_000_000 })],
    deals: [],
  };

  it("übersteuert die automatische Stufe", () => {
    const dto = berechnePipeline({
      ...eingabe,
      manuell: new Map([
        [
          "a",
          {
            stufe: "verhandlung",
            autoStufe: "beauftragt",
            gesetztAm: "2026-10-27T10:00:00Z",
            gesetztVon: "Sebastian Grenz",
          },
        ],
      ]),
    });
    const d = dto.deals[0];
    expect(d.stufe).toBe("verhandlung");
    expect(d.autoStufe).toBe("beauftragt");
    expect(d.wahrscheinlichkeit).toBe(0.8);
    expect(d.notarMonat).toBe("2026-12");
    expect(d.manuell?.gesetztVon).toBe("Sebastian Grenz");
  });

  it("verfällt, wenn Salesforce die Stufe inzwischen geändert hat", () => {
    const dto = berechnePipeline({
      ...eingabe,
      manuell: new Map([
        [
          "a",
          {
            stufe: "verhandlung",
            autoStufe: "einwertung",
            gesetztAm: "2026-10-01T10:00:00Z",
            gesetztVon: null,
          },
        ],
      ]),
    });
    expect(dto.deals[0].stufe).toBe("beauftragt");
    expect(dto.deals[0].manuell).toBeNull();
  });

  it("stufeAendern setzt sofort und hebt bei der automatischen Stufe auf", () => {
    const dto = berechnePipeline(eingabe);
    const verschoben = stufeAendern(dto, "a", "notar");
    expect(verschoben.deals[0].stufe).toBe("notar");
    expect(verschoben.deals[0].manuell).not.toBeNull();
    const zurueck = stufeAendern(verschoben, "a", "beauftragt");
    expect(zurueck.deals[0].manuell).toBeNull();
  });
});
