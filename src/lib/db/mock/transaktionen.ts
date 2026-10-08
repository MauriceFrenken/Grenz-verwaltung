/**
 * Fiktive Transaktionspipeline für Demo-Modus und Tests (deterministisch).
 */
import { plusTage } from "@/lib/kalender";
import type { BoardDaten } from "../typen";
import type {
  Ankauf,
  AnkaufPhase,
  CrmDaten,
  Expose,
  Kaeufer,
  Reservierung,
} from "../transaktionen";
import { zufall } from "./seed";

const DEALS: Array<
  [
    name: string,
    strasse: string,
    ort: string,
    klasse: string,
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
    "bewertung",
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
    "bewertung",
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
    "bewertung",
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
    "bewertung",
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
    "expose",
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
    "expose",
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
    "expose",
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
export function erzeugeCrmMock(
  daten: Pick<BoardDaten, "stichtag" | "properties" | "units">,
  seed = 7,
): CrmDaten {
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
      exposeId: null,
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
      naechsterSchrittAm: plusTage(stichtag, 3 + (i % 9)),
      verantwortlich: i % 2 === 0 ? "Max Mustermann" : "Moritz Mustermann",
      zielGesellschaftId:
        strategie === "aufteiler" ? "c-mv" : i % 2 === 0 ? "c-mi" : "c-mh",
      ekQuote: strategie === "aufteiler" ? 0.35 : 0.25,
      ekQuoteGesetzt: true,
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
            status: "in_vermarktung",
            preis,
            datum: plusTage(stichtag, -r.ganz(1, 40)),
            notartermin: null,
          });
      }
    }
  }

  const exposes: Expose[] = [
    [
      "Wohnhaus Musterring 4",
      "Musterring 4",
      "Viersen",
      1_450_000,
      98_000,
      940,
      12,
    ],
    [
      "MFH Am Probehang",
      "Am Probehang 11",
      "Kaarst",
      2_100_000,
      131_000,
      1_310,
      18,
    ],
    [
      "Mehrfamilienhaus Beispielstraße",
      "Beispielstraße 7",
      "Düren",
      890_000,
      61_000,
      610,
      8,
    ],
  ].map(([betreff, adresse, ort, preis, miete, flaeche, einheiten], i) => ({
    id: `ex-${i + 1}`,
    eingegangenAm: plusTage(stichtag, -(i * 3 + 1)),
    betreff: String(betreff),
    absender: "Makler Beispiel GmbH",
    status: "analysiert",
    adresse: String(adresse),
    ort: String(ort),
    angebotspreis: Number(preis),
    jahresnettokaltmiete: Number(miete),
    flaeche: Number(flaeche),
    einheiten: Number(einheiten),
    makler: "Makler Beispiel GmbH",
    sfTransaktionId: null,
    ankaufId: null,
  }));

  return {
    ankaeufe,
    objektVerkaeufe: [],
    kaeufer,
    reservierungen,
    exposes,
    instanzUrl: "https://muster-holding.my.salesforce.example",
  };
}
