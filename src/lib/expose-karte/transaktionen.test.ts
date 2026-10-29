import { describe, expect, it } from "vitest";

import { geoSchluessel } from "./geocode";
import {
  grenzAbschluesse,
  type GrenzDeal,
  transaktionZuObjekt,
} from "./transaktionen";

const re = (p: Record<string, unknown> = {}) => ({
  Name: "Kopernikusstraße 64",
  Address__Street__s: "Kopernikusstraße 64",
  Address__PostalCode__s: "40225",
  Address__City__s: "Düsseldorf",
  Real_Estate_Type__c: "Mehrfamilienhaus",
  Construction_Year__c: "1965",
  Wohnfl_che__c: 500,
  Gewerbefl_che__c: 100,
  ...p,
});

describe("transaktionZuObjekt", () => {
  it("nimmt bei Angeboten den Angebotspreis und rechnet Faktor, Preis je m²", () => {
    const o = transaktionZuObjekt(
      {
        Id: "a0C1",
        Name: "T-1",
        Status__c: "Auf dem Markt",
        Angebotspreis__c: 1_800_000,
        Kaufpreis__c: null,
        Jahresnettokaltmiete__c: 90_000,
        Multiplikator__c: 0,
        Min_auf_dem_Markt_seit__c: "2026-10-01",
        Real_Estate__c: "a01X",
        Real_Estate__r: re(),
      },
      new Map(),
    )!;
    expect(o.status).toBe("angebot");
    expect(o.preis).toBe(1_800_000);
    expect(o.faktor).toBe(20);
    expect(o.flaeche).toBe(600);
    expect(o.preisQm).toBe(3000);
    expect(o.baujahr).toBe(1965);
    expect(o.eingegangenAm).toBe("2026-10-01");
  });

  it("nimmt bei Verkäufen den Kaufpreis, markiert Schätzungen und hängt das Mandat an", () => {
    const o = transaktionZuObjekt(
      {
        Id: "a0C2",
        Status__c: "Verkauft",
        Kaufpreis__c: 2_400_000,
        Kaufpreis_gesch_tzt__c: "Ja",
        Angebotspreis__c: 2_600_000,
        Datum_Transaktion__c: "2025-10-21",
        Real_Estate__c: "a01X",
        Real_Estate__r: re(),
      },
      new Map([["a01X", { sfId: "a06M", name: "M-1", phase: "Beauftragung" }]]),
    )!;
    expect(o.status).toBe("verkauft");
    expect(o.preis).toBe(2_400_000);
    expect(o.angebotspreis).toBe(2_600_000);
    expect(o.preisGeschaetzt).toBe(true);
    expect(o.eingegangenAm).toBe("2025-10-21");
    expect(o.mandat?.name).toBe("M-1");
  });

  it("blendet Testdatensätze aus", () => {
    expect(
      transaktionZuObjekt(
        {
          Id: "a0C3",
          Status__c: "Verkauft",
          Real_Estate__r: re({ Address__Street__s: "Teststraße 27" }),
        },
        new Map(),
      ),
    ).toBeNull();
  });
});

describe("grenzAbschluesse", () => {
  const deal = (p: Partial<GrenzDeal>): GrenzDeal => ({
    sfId: "006A",
    name: "Opp. Biberstr.",
    phase: "Invoice Paid",
    betrag: 1_200_000,
    abschlussAm: "2025-08-28",
    mandatSfId: "a06M",
    daten: { Beurkundeter_Kaufpreis_in__c: 1_200_000, Provision_in__c: 60_000 },
    ...p,
  });
  const mandate = new Map([
    [
      "a06M",
      {
        sfId: "a06M",
        name: "M-10014",
        phase: "Gewonnen",
        realEstateSfId: "a01X",
      },
    ],
  ]);

  it("legt einen Punkt an, wenn keine verkaufte Transaktion zum Objekt existiert", () => {
    const neu = grenzAbschluesse(
      [deal({}), deal({ sfId: "006B", phase: "Closed Lost" })],
      mandate,
      new Map([["a01X", re()]]),
      [],
    );
    expect(neu).toHaveLength(1);
    expect(neu[0]).toMatchObject({
      status: "verkauft",
      grenz: true,
      preis: 1_200_000,
      provisionNetto: 60_000,
      mandat: { name: "M-10014" },
    });
  });

  it("ergänzt eine vorhandene verkaufte Transaktion statt sie zu verdoppeln", () => {
    const t = transaktionZuObjekt(
      {
        Id: "a0C9",
        Status__c: "Verkauft",
        Real_Estate__c: "a01X",
        Real_Estate__r: re(),
      },
      new Map(),
    )!;
    const neu = grenzAbschluesse([deal({})], mandate, new Map(), [t]);
    expect(neu).toHaveLength(0);
    expect(t.grenz).toBe(true);
    expect(t.preis).toBe(1_200_000);
    expect(t.provisionNetto).toBe(60_000);
  });
});

describe("geoSchluessel", () => {
  it("normalisiert Schreibweise und braucht einen Ort", () => {
    expect(
      geoSchluessel({
        adresse: " Kopernikusstraße  64",
        plz: "40225",
        stadt: "Düsseldorf",
      }),
    ).toBe("kopernikusstraße 64|40225|düsseldorf");
    expect(
      geoSchluessel({ adresse: "A 1", plz: null, stadt: null }),
    ).toBeNull();
  });
});
