/**
 * Fiktiver Maschinenbestand für Demo-Modus und Tests (deterministisch).
 */
import { plusTage, type IsoDatum } from "@/lib/kalender";
import type { Machine, MachineCost, MaschinenStatus } from "../typen";

type Vorlage = [
  hersteller: string,
  modell: string,
  kategorie: string,
  baujahr: number,
  stunden: number,
  einkauf: number,
  status: MaschinenStatus,
  /** Tage seit Ankauf */
  alter: number,
  /** Verkaufspreis (nur verkauft) bzw. Angebotspreis */
  preis: number,
];

const VORLAGEN: Vorlage[] = [
  [
    "Muster",
    "Bagger MB 140",
    "Kettenbagger",
    2017,
    8_400,
    62_000,
    "inseriert",
    41,
    79_500,
  ],
  [
    "Beispiel",
    "Radlader RL 8",
    "Radlader",
    2019,
    5_100,
    71_000,
    "lager",
    12,
    89_000,
  ],
  [
    "Muster",
    "Minibagger MB 25",
    "Minibagger",
    2021,
    2_300,
    24_500,
    "reserviert",
    33,
    31_900,
  ],
  [
    "Probe",
    "Teleskoplader TL 7",
    "Teleskoplader",
    2018,
    6_800,
    38_000,
    "inseriert",
    96,
    46_500,
  ],
  [
    "Beispiel",
    "Walze W 120",
    "Walze",
    2015,
    4_900,
    21_000,
    "inseriert",
    142,
    27_500,
  ],
  [
    "Muster",
    "Mobilbagger MM 160",
    "Mobilbagger",
    2016,
    11_200,
    54_000,
    "lager",
    5,
    69_000,
  ],
  ["Probe", "Dumper D 6", "Dumper", 2020, 1_900, 18_500, "einkauf", 0, 24_000],
  [
    "Muster",
    "Bagger MB 210",
    "Kettenbagger",
    2014,
    13_500,
    47_000,
    "verkauft",
    64,
    58_900,
  ],
  [
    "Beispiel",
    "Radlader RL 5",
    "Radlader",
    2017,
    7_700,
    39_000,
    "verkauft",
    38,
    47_200,
  ],
  [
    "Probe",
    "Minibagger PB 18",
    "Minibagger",
    2019,
    3_100,
    19_800,
    "verkauft",
    22,
    25_400,
  ],
];

export function erzeugeMaschinenMock(
  stichtag: IsoDatum,
  companyId: string,
): { machines: Machine[]; costs: MachineCost[] } {
  const jahr = stichtag.slice(0, 4);
  const machines: Machine[] = [];
  const costs: MachineCost[] = [];
  VORLAGEN.forEach(
    (
      [
        hersteller,
        modell,
        kategorie,
        baujahr,
        stunden,
        einkauf,
        status,
        alter,
        preis,
      ],
      i,
    ) => {
      const id = `BM-${jahr}-${String(i + 1).padStart(3, "0")}`;
      const ankaufAm = plusTage(
        stichtag,
        -alter - (status === "verkauft" ? 30 : 0),
      );
      const verkauft = status === "verkauft";
      machines.push({
        id,
        companyId,
        hersteller,
        modell,
        kategorie,
        baujahr,
        betriebsstunden: stunden,
        seriennummer: `SN-${100_000 + i * 37}`,
        standort: i % 2 === 0 ? "Lager Muster-Nord" : "Lager Muster-Süd",
        status,
        ankaufAm: status === "einkauf" ? null : ankaufAm,
        einkaufspreis: einkauf,
        lieferant:
          i % 3 === 0 ? "Bauunternehmen Beispiel GmbH" : "Händler Muster KG",
        angebotspreis: verkauft ? null : preis,
        inseratUrl:
          status === "inseriert" ? "https://plattform.example/inserat" : null,
        verkaufAm: verkauft ? plusTage(ankaufAm, alter) : null,
        verkaufspreis: verkauft ? preis : null,
        kaeufer: verkauft ? "Tiefbau Muster GmbH" : null,
        bemerkung: null,
      });
      if (status !== "einkauf") {
        costs.push({
          id: `mk-${i + 1}-1`,
          machineId: id,
          datum: plusTage(ankaufAm, 2),
          art: "transport",
          betrag: 650 + (i % 4) * 150,
        });
        if (i % 2 === 0)
          costs.push({
            id: `mk-${i + 1}-2`,
            machineId: id,
            datum: plusTage(ankaufAm, 9),
            art: "aufbereitung",
            betrag: 1_800 + (i % 3) * 700,
          });
      }
    },
  );
  return { machines, costs };
}
