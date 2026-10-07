/**
 * Salesforce-Adapter des Boards (REST API, Upsert über External IDs).
 *
 * Getrennt vom bestehenden `src/lib/salesforce` (Exposé-Export), damit dessen
 * Verhalten unverändert bleibt. Feldzuordnung: docs/salesforce-feldliste.md.
 *
 * Live (später): OAuth-Token serverseitig, dann
 *   GET   /services/data/v61.0/query?q=SELECT … FROM Real_Estate__c WHERE …
 *   PATCH /services/data/v61.0/sobjects/Real_Estate__c/Board_ID__c/{AK-…}
 * Das Board ist führend für Board_ID__c; Salesforce bleibt führend für Phase,
 * Makler und Käuferdaten.
 */
import { z } from "zod";
import type { BoardDaten } from "@/lib/db/typen";
import { plusTage } from "@/lib/kalender";
import { zufall } from "@/lib/db/mock/seed";
import { integrationsModus, nichtKonfiguriert } from "./modus";

export const SF_API_VERSION = "v61.0";

export const ANKAUF_PHASEN = [
  "eingang",
  "pruefung",
  "besichtigung",
  "angebot",
  "due_diligence",
  "notar",
  "gekauft",
  "abgesagt",
] as const;
export type AnkaufPhase = (typeof ANKAUF_PHASEN)[number];

export const PHASE_LABEL: Record<AnkaufPhase, string> = {
  eingang: "Eingang",
  pruefung: "Prüfung",
  besichtigung: "Besichtigung",
  angebot: "Angebot",
  due_diligence: "Due Diligence",
  notar: "Notar",
  gekauft: "Gekauft",
  abgesagt: "Abgesagt",
};

/** Picklist-Werte in Salesforce (Status__c) ↔ Board-Phase */
export const PHASE_SF: Record<AnkaufPhase, string> = {
  eingang: "Neu",
  pruefung: "In Prüfung",
  besichtigung: "Besichtigung",
  angebot: "Angebot abgegeben",
  due_diligence: "Due Diligence",
  notar: "Notartermin",
  gekauft: "Gekauft",
  abgesagt: "Abgesagt",
};

export const ankaufSchema = z.object({
  id: z.string().regex(/^AK-\d{4}-\d{3}$/),
  sfId: z.string(),
  name: z.string(),
  strasse: z.string(),
  ort: z.string(),
  assetKlasse: z.enum(["Wohnen", "Wohn- und Geschäftshaus", "Gewerbe"]),
  einheiten: z.number().int().nonnegative(),
  flaeche: z.number().positive(),
  angebotspreis: z.number().positive(),
  jahresnettokaltmiete: z.number().nonnegative(),
  makler: z.string().nullable(),
  phase: z.enum(ANKAUF_PHASEN),
  phaseSeit: z.string(),
  naechsterSchritt: z.string(),
  verantwortlich: z.string(),
  zielGesellschaftId: z.string(),
  /** geplanter Eigenkapitalanteil am Gesamtinvest (Kaufpreis + NK) */
  ekQuote: z.number().min(0).max(1),
  notartermin: z.string().nullable(),
  strategie: z.enum(["bestand", "aufteiler"]),
});
export type Ankauf = z.infer<typeof ankaufSchema>;

export const kaeuferSchema = z.object({
  id: z.string(),
  sfId: z.string(),
  name: z.string(),
  email: z.string(),
  finanzierung: z.enum(["bestaetigt", "offen", "bar"]),
});
export type Kaeufer = z.infer<typeof kaeuferSchema>;

export const RESERVIERUNG_STATUS = [
  "interessent",
  "reserviert",
  "notartermin",
  "beurkundet",
  "storniert",
] as const;
export type ReservierungStatus = (typeof RESERVIERUNG_STATUS)[number];

export const reservierungSchema = z.object({
  id: z.string(),
  sfId: z.string(),
  unitId: z.string(),
  kaeuferId: z.string(),
  status: z.enum(RESERVIERUNG_STATUS),
  preis: z.number().positive(),
  datum: z.string(),
  notartermin: z.string().nullable(),
});
export type Reservierung = z.infer<typeof reservierungSchema>;

export interface CrmDaten {
  ankaeufe: Ankauf[];
  kaeufer: Kaeufer[];
  reservierungen: Reservierung[];
  /** Basis-URL für Links in die Salesforce-Oberfläche */
  instanzUrl: string;
}

export interface SalesforceAdapter {
  laden(): Promise<CrmDaten>;
  phaseSetzen(
    ankaufId: string,
    phase: AnkaufPhase,
    tag: string,
  ): Promise<Ankauf>;
}

// ---------------------------------------------------------------------------
// Mapping Board ↔ Salesforce (Real_Estate__c)
// ---------------------------------------------------------------------------

export type SfRecord = Record<string, string | number | boolean | null>;

export function ankaufZuSalesforce(a: Ankauf): SfRecord {
  return {
    Board_ID__c: a.id,
    Name: a.name,
    Street_Name__c: a.strasse,
    City__c: a.ort,
    Real_Estate_Type__c: a.assetKlasse,
    Anzahl_Wohnungen__c: a.einheiten,
    Wohnfl_che__c: a.flaeche,
    Angebotspreis__c: a.angebotspreis,
    Jahresnettokaltmiete__c: a.jahresnettokaltmiete,
    Makler__c: a.makler,
    Status__c: PHASE_SF[a.phase],
    Status_seit__c: a.phaseSeit,
    Naechster_Schritt__c: a.naechsterSchritt,
    Ziel_Gesellschaft__c: a.zielGesellschaftId,
    EK_Quote__c: a.ekQuote,
    Notartermin__c: a.notartermin,
    Strategie__c: a.strategie,
  };
}

export function ankaufAusSalesforce(
  r: SfRecord & { Id: string },
  verantwortlich: string,
): Ankauf {
  const phase = (Object.keys(PHASE_SF) as AnkaufPhase[]).find(
    (p) => PHASE_SF[p] === r.Status__c,
  );
  return ankaufSchema.parse({
    id: r.Board_ID__c,
    sfId: r.Id,
    name: r.Name,
    strasse: r.Street_Name__c,
    ort: r.City__c,
    assetKlasse: r.Real_Estate_Type__c,
    einheiten: r.Anzahl_Wohnungen__c,
    flaeche: r.Wohnfl_che__c,
    angebotspreis: r.Angebotspreis__c,
    jahresnettokaltmiete: r.Jahresnettokaltmiete__c,
    makler: r.Makler__c,
    phase: phase ?? "eingang",
    phaseSeit: r.Status_seit__c,
    naechsterSchritt: r.Naechster_Schritt__c ?? "",
    verantwortlich,
    zielGesellschaftId: r.Ziel_Gesellschaft__c,
    ekQuote: r.EK_Quote__c,
    notartermin: r.Notartermin__c,
    strategie: r.Strategie__c,
  });
}

/** REST-Pfad für den Upsert über die External ID. */
export function upsertPfad(objekt: string, externalId: string): string {
  return `/services/data/${SF_API_VERSION}/sobjects/${objekt}/Board_ID__c/${encodeURIComponent(externalId)}`;
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const DEALS: Array<
  [
    name: string,
    strasse: string,
    ort: string,
    klasse: Ankauf["assetKlasse"],
    einheiten: number,
    flaeche: number,
    preisQm: number,
    mieteQm: number,
    phase: AnkaufPhase,
    tageInPhase: number,
    schritt: string,
    strategie: Ankauf["strategie"],
  ]
> = [
  [
    "MFH Musterweg",
    "Musterweg 14",
    "Wuppertal",
    "Wohnen",
    12,
    860,
    1850,
    8.4,
    "notar",
    9,
    "Beurkundung 20.10., Finanzierungszusage liegt vor",
    "bestand",
  ],
  [
    "Wohnanlage Am Beispielpark",
    "Am Beispielpark 2–6",
    "Neuss",
    "Wohnen",
    24,
    1720,
    2350,
    9.6,
    "due_diligence",
    21,
    "Technische DD abschließen, Altlastenauskunft anfordern",
    "bestand",
  ],
  [
    "Altbau Probestraße",
    "Probestraße 31",
    "Köln",
    "Wohnen",
    9,
    710,
    3150,
    10.1,
    "angebot",
    12,
    "Rückmeldung Verkäufer zum Angebot",
    "aufteiler",
  ],
  [
    "Wohn- und Geschäftshaus Markt 3",
    "Markt 3",
    "Ratingen",
    "Wohn- und Geschäftshaus",
    7,
    640,
    2050,
    10.8,
    "angebot",
    41,
    "Nachverhandlung Kaufpreis nach Mieterliste",
    "bestand",
  ],
  [
    "MFH Lindenstraße",
    "Lindenstraße 88",
    "Krefeld",
    "Wohnen",
    10,
    780,
    1650,
    7.9,
    "besichtigung",
    6,
    "Besichtigung mit Gutachter",
    "bestand",
  ],
  [
    "Gründerzeithaus Allee 5",
    "Allee 5",
    "Düsseldorf",
    "Wohnen",
    8,
    690,
    3900,
    11.6,
    "besichtigung",
    33,
    "Zweite Besichtigung, Teilungsfähigkeit prüfen",
    "aufteiler",
  ],
  [
    "Paket Musterquartier",
    "Quartiersweg 1–9",
    "Mönchengladbach",
    "Wohnen",
    46,
    3100,
    1450,
    7.2,
    "pruefung",
    15,
    "Mieterliste und Kosten plausibilisieren",
    "bestand",
  ],
  [
    "Gewerbehof Am Kanal",
    "Kanalstraße 12",
    "Duisburg",
    "Gewerbe",
    4,
    1450,
    980,
    6.1,
    "pruefung",
    64,
    "Entscheidung: weiterverfolgen oder absagen",
    "bestand",
  ],
  [
    "MFH Rosenweg",
    "Rosenweg 3",
    "Solingen",
    "Wohnen",
    6,
    430,
    1720,
    7.6,
    "eingang",
    2,
    "Erstprüfung",
    "bestand",
  ],
  [
    "Stadthaus Beispielplatz",
    "Beispielplatz 1",
    "Bonn",
    "Wohnen",
    5,
    520,
    3600,
    11.2,
    "eingang",
    4,
    "Exposé anfordern",
    "aufteiler",
  ],
  [
    "Wohnanlage Feldrand",
    "Feldrand 7",
    "Mettmann",
    "Wohnen",
    18,
    1290,
    1980,
    8.8,
    "eingang",
    1,
    "Erstprüfung",
    "bestand",
  ],
  [
    "MFH Teststraße",
    "Teststraße 19",
    "Leverkusen",
    "Wohnen",
    8,
    600,
    1900,
    8.1,
    "gekauft",
    120,
    "Übergabe erfolgt",
    "bestand",
  ],
  [
    "Büro Musterallee",
    "Musterallee 40",
    "Essen",
    "Gewerbe",
    3,
    1100,
    1300,
    9.0,
    "abgesagt",
    45,
    "Abgesagt: Leerstandsrisiko",
    "bestand",
  ],
  [
    "MFH Vorlagengasse",
    "Vorlagengasse 2",
    "Hilden",
    "Wohnen",
    7,
    515,
    2600,
    8.2,
    "abgesagt",
    80,
    "Abgesagt: Preisvorstellung Verkäufer",
    "bestand",
  ],
];

const KAEUFER_NAMEN = [
  "Lena Beispiel",
  "Jan Muster",
  "Sophie Exempel",
  "Tim Platzhalter",
  "Marie Testfrau",
  "Lukas Vorlage",
  "Nora Entwurf",
  "Erik Modell",
  "Hanna Probe",
  "Ole Fiktiv",
  "Pia Schablone",
  "Ben Mustermann",
];

/** Erzeugt fiktive CRM-Daten passend zum Board-Seed (deterministisch). */
export function erzeugeCrmMock(daten: BoardDaten, seed = 7): CrmDaten {
  const r = zufall(seed);
  const stichtag = daten.stichtag;
  const jahr = stichtag.slice(0, 4);
  const ankaeufe: Ankauf[] = DEALS.map((d, i) => {
    const [
      name,
      strasse,
      ort,
      klasse,
      einheiten,
      flaeche,
      preisQm,
      mieteQm,
      phase,
      tage,
      schritt,
      strategie,
    ] = d;
    return {
      id: `AK-${jahr}-${String(i + 1).padStart(3, "0")}`,
      sfId: `a0A5g00000Ank${String(i + 1).padStart(3, "0")}`,
      name,
      strasse,
      ort,
      assetKlasse: klasse,
      einheiten,
      flaeche,
      angebotspreis: Math.round((flaeche * preisQm) / 10_000) * 10_000,
      jahresnettokaltmiete: Math.round(flaeche * mieteQm * 12),
      makler:
        i % 3 === 0
          ? null
          : ["Makler Beispiel GmbH", "Immo Muster KG", "Probe Immobilien"][
              i % 3
            ],
      phase,
      phaseSeit: plusTage(stichtag, -tage),
      naechsterSchritt: schritt,
      verantwortlich: i % 2 === 0 ? "Max Mustermann" : "Moritz Mustermann",
      zielGesellschaftId:
        strategie === "aufteiler" ? "c-mv" : i % 2 === 0 ? "c-mi" : "c-mh",
      ekQuote: strategie === "aufteiler" ? 0.35 : 0.25,
      notartermin:
        phase === "notar"
          ? plusTage(stichtag, 13)
          : phase === "due_diligence"
            ? plusTage(stichtag, 55)
            : null,
      strategie,
    };
  });

  const kaeufer: Kaeufer[] = KAEUFER_NAMEN.map((name, i) => ({
    id: `kf-${i + 1}`,
    sfId: `0035g00000Kf${String(i + 1).padStart(3, "0")}`,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@mail.example`,
    finanzierung: (["bestaetigt", "offen", "bar"] as const)[i % 3],
  }));

  // Reservierungen je Aufteiler-Einheit, passend zum Einheitenstatus
  const aufteilerProps = new Set(
    daten.properties.filter((p) => p.strategy === "aufteiler").map((p) => p.id),
  );
  const reservierungen: Reservierung[] = [];
  let nr = 0;
  let k = 0;
  const naechsterKaeufer = () => kaeufer[k++ % kaeufer.length].id;
  const add = (x: Omit<Reservierung, "id" | "sfId">) => {
    nr += 1;
    reservierungen.push({
      ...x,
      id: `rs-${String(nr).padStart(3, "0")}`,
      sfId: `a0D5g00000Res${String(nr).padStart(3, "0")}`,
    });
  };
  let abweichungGesetzt = false;
  for (const u of daten.units.filter((x) => aufteilerProps.has(x.propertyId))) {
    const preis = u.salePrice ?? u.listPrice ?? 0;
    if (!preis) continue;
    if (u.status === "verkauft") {
      add({
        unitId: u.id,
        kaeuferId: naechsterKaeufer(),
        status: "beurkundet",
        preis,
        datum: u.saleDate ?? stichtag,
        notartermin: u.saleDate ?? null,
      });
    } else if (u.status === "reserviert") {
      add({
        unitId: u.id,
        kaeuferId: naechsterKaeufer(),
        status: "notartermin",
        preis: Math.round(preis * 0.99),
        datum: plusTage(stichtag, -r.ganz(5, 25)),
        notartermin: plusTage(stichtag, r.ganz(8, 30)),
      });
    } else if (u.status === "im_vertrieb") {
      if (!abweichungGesetzt) {
        // bewusste Abweichung: in Salesforce reserviert, im Board noch „im Vertrieb“
        abweichungGesetzt = true;
        add({
          unitId: u.id,
          kaeuferId: naechsterKaeufer(),
          status: "reserviert",
          preis,
          datum: plusTage(stichtag, -3),
          notartermin: null,
        });
      } else {
        for (let j = 0; j < r.ganz(1, 3); j++)
          add({
            unitId: u.id,
            kaeuferId: naechsterKaeufer(),
            status: "interessent",
            preis,
            datum: plusTage(stichtag, -r.ganz(1, 40)),
            notartermin: null,
          });
      }
    }
  }

  return {
    ankaeufe,
    kaeufer,
    reservierungen,
    instanzUrl: "https://muster-holding.my.salesforce.example",
  };
}

export class SalesforceMock implements SalesforceAdapter {
  private daten: CrmDaten;
  constructor(board: BoardDaten) {
    this.daten = erzeugeCrmMock(board);
  }
  async laden() {
    return structuredClone(this.daten);
  }
  async phaseSetzen(ankaufId: string, phase: AnkaufPhase, tag: string) {
    const a = this.daten.ankaeufe.find((x) => x.id === ankaufId);
    if (!a) throw new Error(`Ankauf ${ankaufId} nicht gefunden`);
    a.phase = phase;
    a.phaseSeit = tag;
    return structuredClone(a);
  }
}

export class SalesforceLive implements SalesforceAdapter {
  // TODO(live): Server-Funktion mit gespeichertem Refresh-Token (siehe src/lib/salesforce/oauth.ts),
  // SOQL für Real_Estate__c / Transaktion__c / Contact, Upsert über upsertPfad().
  async laden(): Promise<CrmDaten> {
    return nichtKonfiguriert("Salesforce");
  }
  async phaseSetzen(): Promise<Ankauf> {
    return nichtKonfiguriert("Salesforce");
  }
}

let mock: SalesforceMock | null = null;
export function salesforceAdapter(board: BoardDaten): SalesforceAdapter {
  if (integrationsModus() === "live") return new SalesforceLive();
  mock ??= new SalesforceMock(board);
  return mock;
}
