/**
 * Fiktive Seed-Daten für das Management Board.
 *
 * Alle Namen, IBANs, Adressen und Beträge sind erfunden. Die Daten werden
 * deterministisch (fester Zufalls-Seed) relativ zu einem Stichtag erzeugt,
 * damit Fristen und Fälligkeiten immer "aktuell" wirken.
 */
import { erzeugeCrmMock } from "./transaktionen";
import { erzeugeMaschinenMock } from "./maschinen";
import {
  datum,
  istBankarbeitstag,
  monatsanfang,
  monatsende,
  naechsterBankarbeitstag,
  nterWerktag,
  plusMonate,
  plusTage,
  teile,
  type IsoDatum,
} from "@/lib/kalender";
import type {
  BankAccount,
  BoardDaten,
  BoardDocument,
  Company,
  CrmLink,
  Invoice,
  Lease,
  LeaseEvent,
  Loan,
  Party,
  PlannedPayment,
  Project,
  Property,
  Tenant,
  Transaction,
  TxKategorie,
  Unit,
} from "@/lib/db/typen";
import {
  annuitaetFuerTilgung,
  runden,
  zinsplan,
} from "@/modules/darlehen/logik/zinsplan";
import {
  kuendigungFristende,
  mieterhoehungFristen,
} from "@/modules/immobilien/logik/fristen";

/** Deterministischer Pseudo-Zufall (mulberry32). */
export function zufall(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    zwischen: (min: number, max: number) => min + (max - min) * next(),
    ganz: (min: number, max: number) =>
      Math.floor(min + (max - min + 1) * next()),
    wahl: <T>(liste: readonly T[]): T =>
      liste[Math.floor(next() * liste.length)],
  };
}

const ONEDRIVE = "https://muster-holding.sharepoint.example/Dokumente";

function iban(nr: number): string {
  return `DE00${String(37040044).padStart(8, "0")}${String(nr).padStart(10, "0")}`;
}

/** Periodenende des Stichtags + n Monate (Monatsende). */
function monatsendeIn(stichtag: IsoDatum, monate: number): IsoDatum {
  return monatsende(plusMonate(stichtag, monate));
}

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

function gesellschaften(): Company[] {
  const c = (
    id: string,
    shortName: string,
    name: string,
    segment: Company["segment"],
    minLiquidity: number,
    legalForm: Company["legalForm"] = "GmbH",
    separateArea = false,
  ): Company => ({
    id,
    shortName,
    name,
    legalForm,
    segment,
    minLiquidity,
    minLiquidityGesetzt: true,
    separateArea,
    oneDriveFolder: `${ONEDRIVE}/${shortName}`,
  });
  return [
    c("c-mh", "MH", "Muster Holding GmbH", "holding", 250_000),
    c("c-mi", "MI", "Muster Immobilien GmbH", "immobilien_bestand", 100_000),
    c("c-mv", "MV", "Muster Investment GmbH", "immobilien_aufteiler", 150_000),
    c("c-mc", "MC", "Muster Capital GmbH", "holding", 50_000),
    c(
      "c-mo",
      "MO",
      "Muster Objekt Rheinblick GmbH",
      "immobilien_bestand",
      40_000,
    ),
    c("c-mb", "MB", "Muster Baumaschinen GmbH", "baumaschinen_handel", 150_000),
    c(
      "c-mbt",
      "MBT",
      "Muster Beteiligungs GmbH",
      "baumaschinen_plattform",
      30_000,
    ),
    c(
      "c-gbr",
      "GbR",
      "Grundbesitz Mustermann GbR",
      "immobilien_bestand",
      20_000,
      "GbR",
    ),
    c("c-mm", "MM", "Muster Makler GmbH", "makler", 25_000, "GmbH", true),
  ];
}

function parteien(): Party[] {
  return [
    {
      id: "p-max",
      kind: "person",
      name: "Max Mustermann",
      iban: iban(9_000_001),
    },
    {
      id: "p-moritz",
      kind: "person",
      name: "Moritz Mustermann",
      iban: iban(9_000_002),
    },
    {
      id: "p-vb1",
      kind: "bank",
      name: "Volksbank Rhein-Muster eG",
      iban: iban(8_000_001),
    },
    {
      id: "p-vb2",
      kind: "bank",
      name: "Volksbank Beispieltal eG",
      iban: iban(8_000_002),
    },
    {
      id: "p-vb3",
      kind: "bank",
      name: "Volksbank Musterland eG",
      iban: iban(8_000_003),
    },
    {
      id: "p-spk",
      kind: "bank",
      name: "Sparkasse Musterstadt",
      iban: iban(8_000_004),
    },
    {
      id: "p-notar",
      kind: "extern",
      name: "Notarin Dr. Erika Beispiel",
      iban: iban(7_000_001),
    },
  ];
}

interface ObjektVorlage {
  id: string;
  companyId: string;
  name: string;
  street: string;
  zip: string;
  city: string;
  strategy: Property["strategy"];
  yearBuilt: number;
  purchaseDate: IsoDatum;
  einheiten: number;
  mieteQm: number;
  zielQm: number;
  kostenQm: number;
  kaufpreisQm: number;
  marktQm: number;
}

const OBJEKTE: ObjektVorlage[] = [
  {
    id: "IM-2016-001",
    companyId: "c-mo",
    name: "Rheinblick",
    street: "Uferstraße 12",
    zip: "40213",
    city: "Düsseldorf",
    strategy: "bestand",
    yearBuilt: 1962,
    purchaseDate: "2016-04-15",
    einheiten: 14,
    mieteQm: 11.2,
    zielQm: 13.1,
    kostenQm: 2.1,
    kaufpreisQm: 2650,
    marktQm: 3900,
  },
  {
    id: "IM-2018-002",
    companyId: "c-mi",
    name: "Lindenhof",
    street: "Lindenallee 5",
    zip: "50667",
    city: "Köln",
    strategy: "bestand",
    yearBuilt: 1958,
    purchaseDate: "2018-07-01",
    einheiten: 12,
    mieteQm: 10.4,
    zielQm: 12.6,
    kostenQm: 2.3,
    kaufpreisQm: 2500,
    marktQm: 3600,
  },
  {
    id: "IM-2019-003",
    companyId: "c-mi",
    name: "Am Stadtpark",
    street: "Parkweg 3",
    zip: "41061",
    city: "Mönchengladbach",
    strategy: "bestand",
    yearBuilt: 1972,
    purchaseDate: "2019-11-20",
    einheiten: 10,
    mieteQm: 8.3,
    zielQm: 9.2,
    kostenQm: 1.9,
    kaufpreisQm: 1750,
    marktQm: 2300,
  },
  {
    id: "IM-2021-004",
    companyId: "c-gbr",
    name: "Kastanienhof",
    street: "Kastanienweg 8",
    zip: "47798",
    city: "Krefeld",
    strategy: "bestand",
    yearBuilt: 1985,
    purchaseDate: "2021-03-01",
    einheiten: 8,
    mieteQm: 8.9,
    zielQm: 9.6,
    kostenQm: 1.8,
    kaufpreisQm: 1950,
    marktQm: 2400,
  },
  {
    id: "IM-2024-005",
    companyId: "c-mv",
    name: "Altbau Südstadt",
    street: "Bonner Straße 40",
    zip: "53111",
    city: "Bonn",
    strategy: "aufteiler",
    yearBuilt: 1908,
    purchaseDate: "2024-05-10",
    einheiten: 9,
    mieteQm: 10.8,
    zielQm: 12.0,
    kostenQm: 1.5,
    kaufpreisQm: 2900,
    marktQm: 6400,
  },
  {
    id: "IM-2025-006",
    companyId: "c-mv",
    name: "Gartenquartier",
    street: "Gartenstraße 21",
    zip: "40479",
    city: "Düsseldorf",
    strategy: "aufteiler",
    yearBuilt: 1929,
    purchaseDate: "2025-08-20",
    einheiten: 8,
    mieteQm: 0,
    zielQm: 0,
    kostenQm: 1.2,
    kaufpreisQm: 3300,
    marktQm: 7200,
  },
];

const VORNAMEN = [
  "Anna",
  "Ben",
  "Clara",
  "David",
  "Emma",
  "Felix",
  "Greta",
  "Hannes",
  "Ida",
  "Jonas",
  "Klara",
  "Lukas",
  "Mia",
  "Noah",
  "Olivia",
  "Paul",
  "Rosa",
  "Simon",
  "Tilda",
  "Vincent",
];
const NACHNAMEN = [
  "Musterfrau",
  "Beispiel",
  "Exempel",
  "Probe",
  "Vorlage",
  "Muster",
  "Testmann",
  "Platzhalter",
  "Modell",
  "Entwurf",
  "Schablone",
  "Fiktiv",
];

// Aufteiler-Status je Einheit (Reihenfolge = WE-Nummer)
const SUEDSTADT_STATUS: Unit["status"][] = [
  "verkauft",
  "verkauft",
  "verkauft",
  "verkauft",
  "reserviert",
  "reserviert",
  "im_vertrieb",
  "im_vertrieb",
  "vermietet",
];
const GARTEN_STATUS: Unit["status"][] = [
  "sanierung",
  "sanierung",
  "sanierung",
  "sanierung",
  "sanierung",
  "sanierung",
  "im_vertrieb",
  "im_vertrieb",
];
// Bestand: leere/Sanierungs-Einheiten (Index)
const BESTAND_LEER: Record<string, Partial<Record<number, Unit["status"]>>> = {
  "IM-2016-001": { 10: "leer" },
  "IM-2018-002": { 4: "leer", 9: "sanierung" },
  "IM-2019-003": { 6: "leer" },
  "IM-2021-004": {},
};

// ---------------------------------------------------------------------------
// Darlehen
// ---------------------------------------------------------------------------

function darlehen(stichtag: IsoDatum): Loan[] {
  const basis = {
    lenderCompanyId: null,
    lenderPartyId: null,
    borrowerCompanyId: null,
    borrowerPartyId: null,
    propertyId: null,
    status: "aktiv" as const,
    guarantee: null,
    oneDriveUrl: null,
    bankRef: null,
    fixedUntil: null,
    rateType: "fest" as const,
  };
  const bank = (
    p: Partial<Loan> &
      Pick<
        Loan,
        | "id"
        | "principal"
        | "disbursementDate"
        | "rate"
        | "repayment"
        | "maturityDate"
        | "purpose"
      >,
  ): Loan => ({
    ...basis,
    kind: "bank",
    frequency: "monatlich",
    dayCount: "30/360",
    ...p,
    oneDriveUrl: `${ONEDRIVE}/Darlehen/${p.id}.pdf`,
  });
  const ic = (
    id: string,
    lender: string,
    borrower: string,
    principal: number,
    disbursementDate: IsoDatum,
    frequency: Loan["frequency"],
    purpose: string,
    maturityDate: IsoDatum | null = null,
  ): Loan => ({
    ...basis,
    id,
    kind: "intercompany",
    lenderCompanyId: lender,
    borrowerCompanyId: borrower,
    principal,
    disbursementDate,
    rate: 0.03,
    fixedUntil: null,
    maturityDate,
    repayment: { kind: "endfaellig" },
    frequency,
    dayCount: "act/365",
    purpose,
    oneDriveUrl: `${ONEDRIVE}/Darlehen/${id}.pdf`,
  });
  const gs = (
    id: string,
    person: string,
    borrower: string,
    principal: number,
    disbursementDate: IsoDatum,
    maturityDate: IsoDatum | null = null,
  ): Loan => ({
    ...basis,
    id,
    kind: "gesellschafter",
    lenderPartyId: person,
    borrowerCompanyId: borrower,
    principal,
    disbursementDate,
    rate: 0.03,
    maturityDate,
    repayment: { kind: "endfaellig" },
    frequency: "jaehrlich",
    dayCount: "act/365",
    purpose: "Gesellschafterdarlehen",
    oneDriveUrl: `${ONEDRIVE}/Darlehen/${id}.pdf`,
  });

  return [
    bank({
      id: "DL-2016-001",
      bankRef: "BK-2016-001",
      lenderPartyId: "p-vb1",
      borrowerCompanyId: "c-mo",
      propertyId: "IM-2016-001",
      principal: 2_400_000,
      disbursementDate: "2016-04-15",
      rate: 0.0185,
      fixedUntil: monatsendeIn(stichtag, 4),
      maturityDate: "2046-04-30",
      repayment: {
        kind: "annuitaet",
        installment: annuitaetFuerTilgung(2_400_000, 0.0185, 0.02, "monatlich"),
      },
      guarantee: { by: "Muster Holding GmbH", amount: 500_000 },
      purpose: "Ankauf Rheinblick",
    }),
    bank({
      id: "DL-2018-002",
      bankRef: "BK-2018-014",
      lenderPartyId: "p-vb2",
      borrowerCompanyId: "c-mi",
      propertyId: "IM-2018-002",
      principal: 2_100_000,
      disbursementDate: "2018-07-01",
      rate: 0.0145,
      fixedUntil: monatsendeIn(stichtag, 10),
      maturityDate: "2048-06-30",
      repayment: {
        kind: "annuitaet",
        installment: annuitaetFuerTilgung(
          2_100_000,
          0.0145,
          0.025,
          "monatlich",
        ),
      },
      purpose: "Ankauf Lindenhof",
    }),
    bank({
      id: "DL-2019-003",
      bankRef: "BK-2019-007",
      lenderPartyId: "p-vb2",
      borrowerCompanyId: "c-mi",
      propertyId: "IM-2019-003",
      principal: 1_350_000,
      disbursementDate: "2019-11-20",
      rate: 0.0115,
      fixedUntil: "2029-11-30",
      maturityDate: "2049-11-30",
      repayment: {
        kind: "annuitaet",
        installment: annuitaetFuerTilgung(1_350_000, 0.0115, 0.02, "monatlich"),
      },
      purpose: "Ankauf Am Stadtpark",
    }),
    bank({
      id: "DL-2021-004",
      bankRef: "BK-2021-021",
      lenderPartyId: "p-vb3",
      borrowerCompanyId: "c-gbr",
      propertyId: "IM-2021-004",
      principal: 980_000,
      disbursementDate: "2021-03-01",
      rate: 0.0105,
      fixedUntil: "2031-02-28",
      maturityDate: "2051-02-28",
      repayment: {
        kind: "annuitaet",
        installment: annuitaetFuerTilgung(980_000, 0.0105, 0.02, "monatlich"),
      },
      guarantee: { by: "Max Mustermann", amount: 250_000 },
      purpose: "Ankauf Kastanienhof",
    }),
    bank({
      id: "DL-2023-005",
      bankRef: "BK-2023-033",
      lenderPartyId: "p-spk",
      borrowerCompanyId: "c-mi",
      propertyId: "IM-2018-002",
      principal: 400_000,
      disbursementDate: "2023-09-15",
      rate: 0.042,
      fixedUntil: "2033-09-30",
      maturityDate: "2036-09-30",
      repayment: { kind: "ratentilgung", principalPerPeriod: 2_500 },
      purpose: "Modernisierung Lindenhof",
    }),
    bank({
      id: "DL-2024-006",
      bankRef: "BK-2024-008",
      lenderPartyId: "p-vb1",
      borrowerCompanyId: "c-mv",
      propertyId: "IM-2024-005",
      principal: 2_000_000,
      disbursementDate: "2024-05-10",
      rate: 0.046,
      fixedUntil: monatsendeIn(stichtag, 5),
      maturityDate: monatsendeIn(stichtag, 5),
      repayment: { kind: "endfaellig" },
      frequency: "quartalsweise",
      dayCount: "act/360",
      guarantee: { by: "Muster Holding GmbH", amount: 1_000_000 },
      purpose: "Ankauf und Sanierung Altbau Südstadt",
    }),
    bank({
      id: "DL-2025-007",
      bankRef: "BK-2025-012",
      lenderPartyId: "p-vb1",
      borrowerCompanyId: "c-mv",
      propertyId: "IM-2025-006",
      principal: 2_200_000,
      disbursementDate: "2025-08-20",
      rate: 0.041,
      fixedUntil: "2027-12-31",
      maturityDate: "2027-12-31",
      repayment: { kind: "endfaellig" },
      frequency: "quartalsweise",
      dayCount: "act/360",
      guarantee: { by: "Muster Holding GmbH", amount: 1_200_000 },
      purpose: "Ankauf und Sanierung Gartenquartier",
    }),
    bank({
      id: "DL-2022-008",
      bankRef: "BK-2022-019",
      lenderPartyId: "p-vb3",
      borrowerCompanyId: "c-mb",
      principal: 600_000,
      disbursementDate: "2022-02-01",
      rate: 0.039,
      rateType: "variabel",
      maturityDate: "2027-01-31",
      repayment: { kind: "ratentilgung", principalPerPeriod: 30_000 },
      frequency: "quartalsweise",
      purpose: "Betriebsmittel Maschinenbestand",
    }),
    bank({
      id: "DL-2020-009",
      bankRef: "BK-2020-004",
      lenderPartyId: "p-spk",
      borrowerCompanyId: "c-mo",
      propertyId: "IM-2016-001",
      principal: 250_000,
      disbursementDate: "2020-06-30",
      rate: 0.016,
      fixedUntil: "2030-06-30",
      maturityDate: "2030-06-30",
      repayment: {
        kind: "annuitaet",
        installment: annuitaetFuerTilgung(250_000, 0.016, 0.04, "monatlich"),
      },
      purpose: "Dachsanierung Rheinblick",
    }),
    ic(
      "DL-2019-010",
      "c-mh",
      "c-mi",
      450_000,
      "2019-03-15",
      "jaehrlich",
      "Eigenkapital Lindenhof",
    ),
    ic(
      "DL-2020-011",
      "c-mh",
      "c-mo",
      300_000,
      "2020-01-01",
      "jaehrlich",
      "Dachsanierung Rheinblick",
    ),
    ic(
      "DL-2021-012",
      "c-mh",
      "c-mb",
      1_200_000,
      "2021-05-01",
      "quartalsweise",
      "Lagerfinanzierung",
    ),
    ic(
      "DL-2022-013",
      "c-mh",
      "c-mb",
      500_000,
      "2022-09-01",
      "quartalsweise",
      "Lagerfinanzierung II",
    ),
    ic(
      "DL-2024-014",
      "c-mh",
      "c-mv",
      900_000,
      "2024-05-02",
      "quartalsweise",
      "Eigenkapital Südstadt",
    ),
    ic(
      "DL-2025-015",
      "c-mc",
      "c-mv",
      750_000,
      "2025-08-18",
      "quartalsweise",
      "Eigenkapital Gartenquartier",
    ),
    ic(
      "DL-2023-016",
      "c-mh",
      "c-mbt",
      400_000,
      "2023-02-01",
      "jaehrlich",
      "Auktionsplattform",
    ),
    ic(
      "DL-2023-017",
      "c-mi",
      "c-mv",
      250_000,
      "2023-11-15",
      "quartalsweise",
      "Zwischenfinanzierung",
    ),
    ic(
      "DL-2021-018",
      "c-mh",
      "c-gbr",
      150_000,
      "2021-03-01",
      "jaehrlich",
      "Eigenkapital Kastanienhof",
    ),
    ic(
      "DL-2022-019",
      "c-mc",
      "c-mh",
      600_000,
      "2022-12-01",
      "jaehrlich",
      "Liquiditätsausgleich",
    ),
    ic(
      "DL-2024-020",
      "c-mo",
      "c-mh",
      200_000,
      "2024-01-10",
      "quartalsweise",
      "Liquiditätsausgleich",
    ),
    ic(
      "DL-2026-021",
      "c-mh",
      "c-mv",
      350_000,
      plusTage(stichtag, -60),
      "quartalsweise",
      "Sanierung Gartenquartier",
    ),
    gs("DL-2015-022", "p-max", "c-mh", 1_000_000, "2015-12-31"),
    gs("DL-2015-023", "p-moritz", "c-mh", 1_000_000, "2015-12-31"),
    gs("DL-2020-024", "p-max", "c-mv", 300_000, "2020-07-01"),
    gs(
      "DL-2021-025",
      "p-moritz",
      "c-mb",
      250_000,
      "2021-10-01",
      monatsendeIn(stichtag, 8),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Erzeugung
// ---------------------------------------------------------------------------

export function erzeugeSeed(stichtag: IsoDatum, seed = 1992): BoardDaten {
  const r = zufall(seed);
  const companies = gesellschaften();
  const parties = parteien();
  // volle 12 Vormonate plus laufender Monat, damit Monatsauswertungen vollständig sind
  const fensterStart = monatsanfang(plusMonate(stichtag, -12));

  // --- Konten ---------------------------------------------------------------
  const hausbank: Record<string, string> = {
    "c-mh": "Volksbank Rhein-Muster eG",
    "c-mi": "Volksbank Beispieltal eG",
    "c-mv": "Volksbank Rhein-Muster eG",
    "c-mc": "Sparkasse Musterstadt",
    "c-mo": "Volksbank Rhein-Muster eG",
    "c-mb": "Volksbank Musterland eG",
    "c-mbt": "Sparkasse Musterstadt",
    "c-gbr": "Volksbank Musterland eG",
    "c-mm": "Sparkasse Musterstadt",
  };
  const bankAccounts: BankAccount[] = companies.map((c, i) => ({
    id: `k-${c.shortName.toLowerCase()}`,
    companyId: c.id,
    iban: iban(1_000_000 + i * 17),
    bankName: hausbank[c.id],
    label: "Geschäftskonto",
    openingBalance: 0,
    openingDate: fensterStart,
    saldoBekannt: true,
    saldoStichtag: stichtag,
    zugang: "muster" as const,
    propertyId: null,
  }));
  bankAccounts.push({
    id: "k-mh-2",
    companyId: "c-mh",
    iban: iban(1_000_999),
    bankName: "Sparkasse Musterstadt",
    label: "Festgeld/Tagesgeld",
    openingBalance: 0,
    openingDate: fensterStart,
    saldoBekannt: true,
    saldoStichtag: stichtag,
    zugang: "muster",
    propertyId: null,
  });
  const konto = (companyId: string) =>
    bankAccounts.find((k) => k.companyId === companyId)!;
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const partyById = new Map(parties.map((p) => [p.id, p]));

  const transactions: Transaction[] = [];
  let txNr = 0;
  const buche = (
    companyId: string,
    bookingDate: IsoDatum,
    amount: number,
    counterpartyName: string,
    purpose: string,
    category: TxKategorie,
    extra: {
      iban?: string | null;
      propertyId?: string | null;
      accountId?: string;
    } = {},
  ) => {
    if (bookingDate < fensterStart || bookingDate > stichtag) return;
    txNr += 1;
    transactions.push({
      id: `tx-${String(txNr).padStart(5, "0")}`,
      accountId: extra.accountId ?? konto(companyId).id,
      bookingDate,
      amount: runden(amount),
      counterpartyName,
      counterpartyIban: extra.iban ?? null,
      purpose,
      category,
      propertyId: extra.propertyId ?? null,
    });
  };

  // --- Objekte, Einheiten, Mieter, Verträge ------------------------------------
  const properties: Property[] = [];
  const units: Unit[] = [];
  const tenants: Tenant[] = [];
  const leases: Lease[] = [];
  let mieterNr = 0;

  for (const o of OBJEKTE) {
    let gesamtFlaeche = 0;
    const objektEinheiten: Unit[] = [];
    for (let i = 0; i < o.einheiten; i++) {
      const area = runden(r.zwischen(42, 108));
      gesamtFlaeche += area;
      let status: Unit["status"] = "vermietet";
      if (o.strategy === "bestand")
        status = BESTAND_LEER[o.id][i] ?? "vermietet";
      else
        status = (o.id === "IM-2024-005" ? SUEDSTADT_STATUS : GARTEN_STATUS)[i];
      const unit: Unit = {
        id: `${o.id}-WE${String(i + 1).padStart(2, "0")}`,
        propertyId: o.id,
        label: `WE ${String(i + 1).padStart(2, "0")}`,
        kind: i === 0 && o.id === "IM-2018-002" ? "gewerbe" : "wohnung",
        area,
        rooms: Math.max(1, Math.round(area / 28)),
        floor: i < 2 ? "EG" : `${Math.floor(i / 2)}. OG`,
        status,
      };
      if (o.strategy === "aufteiler") {
        unit.listPrice =
          Math.round((area * o.marktQm * r.zwischen(0.96, 1.04)) / 1000) * 1000;
        if (status === "verkauft") {
          unit.salePrice =
            Math.round((unit.listPrice * r.zwischen(0.95, 1.01)) / 1000) * 1000;
          unit.saleDate = plusTage(stichtag, -r.ganz(40, 320));
        }
      }
      objektEinheiten.push(unit);
    }
    units.push(...objektEinheiten);

    properties.push({
      id: o.id,
      companyId: o.companyId,
      name: o.name,
      street: o.street,
      zip: o.zip,
      city: o.city,
      ablageId: o.id,
      strategy: o.strategy,
      strategyGesetzt: true,
      yearBuilt: o.yearBuilt,
      purchaseDate: o.purchaseDate,
      purchasePrice:
        Math.round((gesamtFlaeche * o.kaufpreisQm) / 10_000) * 10_000,
      marketValue: Math.round((gesamtFlaeche * o.marktQm) / 10_000) * 10_000,
      targetRentPerSqm: o.zielQm,
      costPerSqmMonth: o.kostenQm,
      oneDriveUrl: `${ONEDRIVE}/${o.companyId.replace("c-", "").toUpperCase()}/${o.id}`,
    });

    for (const u of objektEinheiten) {
      if (u.status !== "vermietet") continue;
      mieterNr += 1;
      const tenant: Tenant = {
        id: `t-${String(mieterNr).padStart(3, "0")}`,
        name:
          u.kind === "gewerbe"
            ? "Bäckerei Musterkorn GmbH"
            : `${VORNAMEN[mieterNr % VORNAMEN.length]} ${NACHNAMEN[(mieterNr * 7) % NACHNAMEN.length]}`,
        iban: iban(5_000_000 + mieterNr),
      };
      tenants.push(tenant);
      const startJahr = r.ganz(2009, 2025);
      const start = datum(startJahr, r.ganz(1, 12), 1);
      const qm =
        o.mieteQm * r.zwischen(0.88, 1.06) * (u.kind === "gewerbe" ? 1.4 : 1);
      const baseRent = Math.round((u.area * qm) / 5) * 5;
      const erhoehung =
        startJahr < 2023 && r.next() < 0.6
          ? datum(r.ganz(2023, 2025), r.ganz(1, 12), 1)
          : null;
      leases.push({
        id: `mv-${u.id}`,
        unitId: u.id,
        tenantId: tenant.id,
        start,
        end: null,
        baseRent,
        serviceCharge: Math.round(u.area * 2.6),
        deposit: baseRent * 3,
        lastRentIncrease: erhoehung,
      });
    }
  }

  // --- Mieterereignisse ---------------------------------------------------------
  const lease = (unitId: string) => leases.find((l) => l.unitId === unitId)!;
  const leaseEvents: LeaseEvent[] = [];
  const kuendigung = (
    id: string,
    unitId: string,
    tageZurueck: number,
    by: "mieter" | "vermieter",
  ) => {
    const l = lease(unitId);
    const receivedOn = plusTage(stichtag, -tageZurueck);
    leaseEvents.push({
      id,
      leaseId: l.id,
      kind: "kuendigung",
      receivedOn,
      by,
      moveOutPlanned: null,
    });
    l.end = kuendigungFristende(by, l.start, receivedOn);
  };
  kuendigung("ev-001", "IM-2016-001-WE07", 20, "mieter");
  kuendigung("ev-002", "IM-2018-002-WE03", 75, "mieter");
  const erhoehung = (
    id: string,
    unitId: string,
    tageZurueck: number,
    faktor: number,
    status: "offen" | "zugestimmt" | "abgelehnt",
  ) => {
    const l = lease(unitId);
    const receivedOn = plusTage(stichtag, -tageZurueck);
    leaseEvents.push({
      id,
      leaseId: l.id,
      kind: "mieterhoehung",
      receivedOn,
      newBaseRent: Math.round((l.baseRent * faktor) / 5) * 5,
      status,
    });
  };
  erhoehung("ev-003", "IM-2016-001-WE02", 120, 1.12, "zugestimmt");
  erhoehung("ev-004", "IM-2016-001-WE05", 45, 1.1, "offen");
  erhoehung("ev-005", "IM-2018-002-WE06", 70, 1.15, "offen");
  erhoehung("ev-006", "IM-2019-003-WE02", 8, 1.08, "offen");

  // --- Mietzahlungen ------------------------------------------------------------
  // Rückstände: zwei Mieter zahlen die letzten Monate nicht/teilweise.
  const rueckstand: Record<string, { ab: number; quote: number }> = {
    "IM-2019-003-WE04": { ab: 2, quote: 0 },
    "IM-2018-002-WE08": { ab: 1, quote: 0.5 },
    "IM-2021-004-WE03": { ab: 1, quote: 0 },
  };
  for (const l of leases) {
    const unit = units.find((u) => u.id === l.unitId)!;
    const prop = properties.find((p) => p.id === unit.propertyId)!;
    const tenant = tenants.find((t) => t.id === l.tenantId)!;
    const erh = leaseEvents.find(
      (e) =>
        e.kind === "mieterhoehung" &&
        e.leaseId === l.id &&
        e.status === "zugestimmt",
    );
    for (let m = 12; m >= 0; m--) {
      const monat = monatsanfang(plusMonate(stichtag, -m));
      if (monat < l.start || (l.end && monat > l.end)) continue;
      const { jahr, monat: mm } = teile(monat);
      const faellig = nterWerktag(jahr, mm, 3);
      let zahltag = plusTage(monat, r.ganz(0, 4));
      if (!istBankarbeitstag(zahltag))
        zahltag = naechsterBankarbeitstag(zahltag);
      if (zahltag > stichtag) continue;
      let kalt = l.baseRent;
      if (
        erh &&
        erh.kind === "mieterhoehung" &&
        monat >= mieterhoehungFristen(erh.receivedOn).wirksamAb
      ) {
        kalt = erh.newBaseRent;
      }
      let betrag = kalt + l.serviceCharge;
      const rs = rueckstand[l.unitId];
      if (rs && m < rs.ab + (faellig > stichtag ? 1 : 0))
        betrag = betrag * rs.quote;
      if (betrag <= 0) continue;
      buche(
        prop.companyId,
        zahltag,
        betrag,
        tenant.name,
        `Miete ${String(mm).padStart(2, "0")}/${jahr} ${unit.label} ${prop.name}`,
        "miete",
        { iban: tenant.iban, propertyId: prop.id },
      );
    }
  }

  // --- Darlehen und Zinszahlungen -------------------------------------------------
  const loans = darlehen(stichtag);
  const bisPlan = plusMonate(stichtag, 24);
  // Abweichungen für den Abgleich
  const ausfall = new Set(["DL-2023-016", "DL-2022-013:letzte"]);
  const betragAbweichung = new Set(["DL-2024-014"]);
  const ohneReferenz = new Set(["DL-2021-012"]);
  const verspaetet = new Set(["DL-2024-020"]);

  for (const loan of loans) {
    const plan = zinsplan(loan, { bis: bisPlan });
    const lenderName = loan.lenderCompanyId
      ? companyById.get(loan.lenderCompanyId)!.name
      : partyById.get(loan.lenderPartyId!)!.name;
    const borrowerName = companyById.get(loan.borrowerCompanyId!)!.name;
    const lenderIban = loan.lenderCompanyId
      ? konto(loan.lenderCompanyId).iban
      : partyById.get(loan.lenderPartyId!)!.iban;
    const borrowerIban = konto(loan.borrowerCompanyId!).iban;

    // Auszahlung im Fenster
    if (loan.disbursementDate >= fensterStart && loan.lenderCompanyId) {
      buche(
        loan.lenderCompanyId,
        loan.disbursementDate,
        -loan.principal,
        borrowerName,
        `Auszahlung Darlehen ${loan.id}`,
        "intercompany",
        { iban: borrowerIban },
      );
      buche(
        loan.borrowerCompanyId!,
        loan.disbursementDate,
        loan.principal,
        lenderName,
        `Auszahlung Darlehen ${loan.id}`,
        "intercompany",
        { iban: lenderIban },
      );
    }

    const imFenster = plan.filter(
      (z) => z.dueDate >= fensterStart && z.dueDate <= stichtag,
    );
    imFenster.forEach((z, idx) => {
      const letzte = idx === imFenster.length - 1;
      if (ausfall.has(loan.id) || (letzte && ausfall.has(`${loan.id}:letzte`)))
        return;
      let tag = naechsterBankarbeitstag(z.dueDate);
      if (loan.kind !== "bank")
        tag = naechsterBankarbeitstag(plusTage(z.dueDate, r.ganz(0, 3)));
      if (verspaetet.has(loan.id) && idx === 0)
        tag = naechsterBankarbeitstag(plusTage(z.dueDate, 9));
      if (tag > stichtag) return;
      let betrag = z.payment;
      if (betragAbweichung.has(loan.id) && idx === imFenster.length - 2) {
        betrag = Math.floor(z.payment / 100) * 100;
      }
      const periode = `${String(teile(z.dueDate).monat).padStart(2, "0")}/${teile(z.dueDate).jahr}`;
      const ref = loan.bankRef ?? loan.id;
      const zweck = ohneReferenz.has(loan.id)
        ? `Zinsen ${periode} Lagerfinanzierung`
        : loan.kind === "bank"
          ? `${ref} Rate ${periode} Darlehenskonto`
          : `Zinsen ${loan.id} ${periode}`;
      const kat: TxKategorie =
        loan.kind === "bank" ? "darlehen" : "intercompany";
      buche(loan.borrowerCompanyId!, tag, -betrag, lenderName, zweck, kat, {
        iban: lenderIban,
        propertyId: loan.propertyId,
      });
      if (loan.lenderCompanyId) {
        buche(loan.lenderCompanyId, tag, betrag, borrowerName, zweck, kat, {
          iban: borrowerIban,
        });
      }
    });
  }

  // --- Laufende Kosten, Projekte, Handel ---------------------------------------
  const projects: Project[] = [
    {
      id: "pj-suedstadt",
      propertyId: "IM-2024-005",
      name: "Aufteilung Altbau Südstadt",
      purchasePrice: properties.find((p) => p.id === "IM-2024-005")!
        .purchasePrice!,
      renovationBudget: 980_000,
      equity: 1_400_000,
      start: "2024-05-10",
      plannedEnd: monatsendeIn(stichtag, 6),
      plannedRevenue: units
        .filter((u) => u.propertyId === "IM-2024-005")
        .reduce((s, u) => s + (u.listPrice ?? 0), 0),
    },
    {
      id: "pj-garten",
      propertyId: "IM-2025-006",
      name: "Aufteilung Gartenquartier",
      purchasePrice: properties.find((p) => p.id === "IM-2025-006")!
        .purchasePrice!,
      renovationBudget: 1_200_000,
      equity: 1_500_000,
      start: "2025-08-20",
      plannedEnd: "2027-12-31",
      plannedRevenue: units
        .filter((u) => u.propertyId === "IM-2025-006")
        .reduce((s, u) => s + (u.listPrice ?? 0), 0),
    },
  ];

  const invoices: Invoice[] = [];
  let reNr = 0;
  const rechnung = (i: Omit<Invoice, "id">) => {
    reNr += 1;
    invoices.push({ id: `re-${String(reNr).padStart(4, "0")}`, ...i });
  };

  for (let m = 12; m >= 0; m--) {
    const monat = monatsanfang(plusMonate(stichtag, -m));
    const { jahr, monat: mm } = teile(monat);
    const periode = `${String(mm).padStart(2, "0")}/${jahr}`;

    // Bewirtschaftung je Bestandsobjekt
    for (const p of properties) {
      const flaeche = units
        .filter((u) => u.propertyId === p.id)
        .reduce((s, u) => s + u.area, 0);
      const kosten = flaeche * (p.costPerSqmMonth ?? 0) * r.zwischen(0.7, 1.3);
      buche(
        p.companyId,
        plusTage(monat, r.ganz(8, 20)),
        -kosten * 0.6,
        "Hausverwaltung Muster GmbH",
        `Bewirtschaftung ${periode} ${p.name}`,
        "rechnung",
        { propertyId: p.id },
      );
      buche(
        p.companyId,
        plusTage(monat, r.ganz(10, 26)),
        -kosten * 0.4,
        r.wahl([
          "Haustechnik Beispiel KG",
          "Malerbetrieb Probe",
          "Sanitär Exempel GmbH",
        ]),
        `Instandhaltung ${p.name}`,
        "rechnung",
        { propertyId: p.id },
      );
    }

    // Sanierung Aufteiler
    for (const pj of projects) {
      if (monat < monatsanfang(pj.start)) continue;
      const anteil = pj.id === "pj-suedstadt" ? 0.045 : 0.075;
      buche(
        "c-mv",
        plusTage(monat, r.ganz(12, 25)),
        -pj.renovationBudget * anteil * r.zwischen(0.8, 1.2),
        "Bau Muster GmbH & Co. KG",
        `Abschlag Sanierung ${pj.name}`,
        "rechnung",
        { propertyId: pj.propertyId },
      );
    }

    // Holding: Geschäftsführung, Umlagen
    buche(
      "c-mh",
      plusTage(monat, 27),
      -38_000,
      "Personalabrechnung",
      `Gehälter ${periode}`,
      "personal",
    );
    for (const tochter of ["c-mi", "c-mo", "c-mv", "c-mb"]) {
      const tag = plusTage(monat, 14);
      buche(
        tochter,
        tag,
        -5_000,
        "Muster Holding GmbH",
        `Managementumlage ${periode}`,
        "intercompany",
        { iban: konto("c-mh").iban },
      );
      buche(
        "c-mh",
        tag,
        5_000,
        companyById.get(tochter)!.name,
        `Managementumlage ${periode}`,
        "intercompany",
        { iban: konto(tochter).iban },
      );
    }
    // Beteiligung: Plattform-Burn
    buche(
      "c-mbt",
      plusTage(monat, 2),
      -21_000,
      "Personalabrechnung",
      `Gehälter ${periode} Plattform`,
      "personal",
    );
    buche(
      "c-mbt",
      plusTage(monat, 18),
      -r.zwischen(11_000, 16_000),
      "Softwarehaus Beispiel GmbH",
      `Entwicklung Auktionsplattform ${periode}`,
      "rechnung",
    );
    // Makler
    buche(
      "c-mm",
      plusTage(monat, 26),
      -18_500,
      "Personalabrechnung",
      `Gehälter ${periode}`,
      "personal",
    );
    for (let k = 0; k < 2; k++) {
      buche(
        "c-mm",
        plusTage(monat, r.ganz(5, 25)),
        r.zwischen(9_000, 26_000),
        r.wahl(["Anlage Beispiel GmbH", "Familie Probe", "Investor Muster AG"]),
        `Provision Vermittlung ${r.ganz(100, 999)}`,
        "verkauf",
      );
    }
    // Baumaschinen-Handel
    for (let k = 0; k < r.ganz(2, 4); k++) {
      const ek = Math.round(r.zwischen(35_000, 160_000) / 500) * 500;
      const maschine = r.wahl([
        "Raupenbagger 22 t",
        "Mobilbagger 15 t",
        "Radlader 12 t",
        "Minibagger 3 t",
        "Teleskoplader 4 t",
      ]);
      buche(
        "c-mb",
        plusTage(monat, r.ganz(2, 14)),
        -ek,
        "Maschinenhandel Beispiel GmbH",
        `Ankauf ${maschine}`,
        "ankauf",
      );
      buche(
        "c-mb",
        plusTage(monat, r.ganz(15, 27)),
        ek * r.zwischen(1.08, 1.18),
        r.wahl(["Tiefbau Probe GmbH", "Erdbau Muster KG", "Galabau Exempel"]),
        `Verkauf ${maschine}`,
        "verkauf",
      );
    }
    buche(
      "c-mb",
      plusTage(monat, 27),
      -24_000,
      "Personalabrechnung",
      `Gehälter ${periode}`,
      "personal",
    );
    // Steuervorauszahlungen quartalsweise
    if (mm % 3 === 0) {
      buche(
        "c-mh",
        datum(jahr, mm, 10),
        -22_000,
        "Finanzamt Musterstadt",
        `Körperschaftsteuer VZ ${periode}`,
        "steuern",
      );
      buche(
        "c-mi",
        datum(jahr, mm, 10),
        -9_500,
        "Finanzamt Musterstadt",
        `Körperschaftsteuer VZ ${periode}`,
        "steuern",
      );
      buche(
        "c-mb",
        datum(jahr, mm, 10),
        -12_000,
        "Finanzamt Musterstadt",
        `Gewerbesteuer VZ ${periode}`,
        "steuern",
      );
    }
  }

  // Verkäufe Aufteiler (Kaufpreiszahlungen über Notaranderkonto)
  for (const u of units) {
    if (u.status === "verkauft" && u.saleDate && u.salePrice) {
      buche(
        "c-mv",
        plusTage(u.saleDate, 35),
        u.salePrice,
        "Notarin Dr. Erika Beispiel",
        `Kaufpreis ${u.label} Altbau Südstadt UR-Nr. ${r.ganz(1000, 2999)}/${teile(u.saleDate).jahr}`,
        "verkauf",
        { propertyId: u.propertyId, iban: partyById.get("p-notar")!.iban },
      );
    }
  }
  // Liquiditätsverschiebung Holding → Investment
  const verschiebung = plusTage(stichtag, -150);
  buche(
    "c-mh",
    verschiebung,
    -200_000,
    "Muster Investment GmbH",
    "Liquiditätsausgleich Kaufpreisraten",
    "intercompany",
    { iban: konto("c-mv").iban },
  );
  buche(
    "c-mv",
    verschiebung,
    200_000,
    "Muster Holding GmbH",
    "Liquiditätsausgleich Kaufpreisraten",
    "intercompany",
    { iban: konto("c-mh").iban },
  );
  // Tagesgeld-Zinsen
  for (let q = 0; q < 4; q++) {
    buche(
      "c-mh",
      monatsende(plusMonate(stichtag, -q * 3 - 1)),
      1_800,
      "Sparkasse Musterstadt",
      "Zinsgutschrift Tagesgeld",
      "sonstiges",
      { accountId: "k-mh-2" },
    );
  }

  // --- Offene Rechnungen ----------------------------------------------------------
  rechnung({
    companyId: "c-mv",
    direction: "eingang",
    counterparty: "Bau Muster GmbH & Co. KG",
    amount: 148_500,
    issueDate: plusTage(stichtag, -12),
    dueDate: plusTage(stichtag, 9),
    status: "offen",
    propertyId: "IM-2025-006",
    projectId: "pj-garten",
    description: "5. Abschlag Rohbau Gartenquartier",
  });
  rechnung({
    companyId: "c-mv",
    direction: "eingang",
    counterparty: "Elektro Beispiel GmbH",
    amount: 36_200,
    issueDate: plusTage(stichtag, -20),
    dueDate: plusTage(stichtag, -3),
    status: "offen",
    propertyId: "IM-2025-006",
    projectId: "pj-garten",
    description: "Elektroinstallation WE 01–04",
  });
  rechnung({
    companyId: "c-mv",
    direction: "eingang",
    counterparty: "Fenster Probe KG",
    amount: 64_800,
    issueDate: plusTage(stichtag, -5),
    dueDate: plusTage(stichtag, 25),
    status: "offen",
    propertyId: "IM-2025-006",
    projectId: "pj-garten",
    description: "Holzfenster Straßenseite",
  });
  rechnung({
    companyId: "c-mv",
    direction: "eingang",
    counterparty: "Architekturbüro Muster",
    amount: 18_900,
    issueDate: plusTage(stichtag, -8),
    dueDate: plusTage(stichtag, 22),
    status: "offen",
    propertyId: "IM-2024-005",
    projectId: "pj-suedstadt",
    description: "LP 8 Objektüberwachung",
  });
  rechnung({
    companyId: "c-mi",
    direction: "eingang",
    counterparty: "Dachdecker Exempel GmbH",
    amount: 22_400,
    issueDate: plusTage(stichtag, -14),
    dueDate: plusTage(stichtag, 16),
    status: "offen",
    propertyId: "IM-2018-002",
    projectId: null,
    description: "Dachrinnen und Fallrohre Lindenhof",
  });
  rechnung({
    companyId: "c-mo",
    direction: "eingang",
    counterparty: "Versicherung Beispiel AG",
    amount: 14_350,
    issueDate: plusTage(stichtag, -2),
    dueDate: plusTage(stichtag, 28),
    status: "offen",
    propertyId: "IM-2016-001",
    projectId: null,
    description: "Gebäudeversicherung 2027",
  });
  rechnung({
    companyId: "c-mb",
    direction: "eingang",
    counterparty: "Maschinenhandel Beispiel GmbH",
    amount: 182_000,
    issueDate: plusTage(stichtag, -4),
    dueDate: plusTage(stichtag, 10),
    status: "offen",
    propertyId: null,
    projectId: null,
    description: "Ankauf 2 Raupenbagger 22 t",
  });
  rechnung({
    companyId: "c-mbt",
    direction: "eingang",
    counterparty: "Softwarehaus Beispiel GmbH",
    amount: 28_000,
    issueDate: plusTage(stichtag, -6),
    dueDate: plusTage(stichtag, 24),
    status: "offen",
    propertyId: null,
    projectId: null,
    description: "Release Bieterportal 2.0",
  });
  rechnung({
    companyId: "c-mb",
    direction: "ausgang",
    counterparty: "Tiefbau Probe GmbH",
    amount: 118_000,
    issueDate: plusTage(stichtag, -10),
    dueDate: plusTage(stichtag, 4),
    status: "offen",
    propertyId: null,
    projectId: null,
    description: "Verkauf Mobilbagger 15 t",
  });
  rechnung({
    companyId: "c-mb",
    direction: "ausgang",
    counterparty: "Erdbau Muster KG",
    amount: 76_500,
    issueDate: plusTage(stichtag, -3),
    dueDate: plusTage(stichtag, 11),
    status: "offen",
    propertyId: null,
    projectId: null,
    description: "Verkauf Radlader 12 t",
  });
  rechnung({
    companyId: "c-mm",
    direction: "ausgang",
    counterparty: "Investor Muster AG",
    amount: 42_840,
    issueDate: plusTage(stichtag, -9),
    dueDate: plusTage(stichtag, 5),
    status: "offen",
    propertyId: null,
    projectId: null,
    description: "Provision MFH Musterstadt",
  });
  rechnung({
    companyId: "c-mm",
    direction: "ausgang",
    counterparty: "Familie Probe",
    amount: 17_850,
    issueDate: plusTage(stichtag, -40),
    dueDate: plusTage(stichtag, -26),
    status: "offen",
    propertyId: null,
    projectId: null,
    description: "Provision ETW Beispielweg",
  });

  // --- Wiederkehrende Planposten (Zukunft) ---------------------------------------
  const bis24 = monatsendeIn(stichtag, 24);
  const plannedPayments: PlannedPayment[] = [
    {
      id: "pp-01",
      companyId: "c-mh",
      date: monatsanfang(plusMonate(stichtag, 1)),
      amount: -38_000,
      label: "Gehälter",
      monthlyUntil: bis24,
      category: "personal",
    },
    {
      id: "pp-02",
      companyId: "c-mbt",
      date: monatsanfang(plusMonate(stichtag, 1)),
      amount: -35_000,
      label: "Plattform: Gehälter und Entwicklung",
      monthlyUntil: bis24,
      category: "personal",
    },
    {
      id: "pp-03",
      companyId: "c-mm",
      date: monatsanfang(plusMonate(stichtag, 1)),
      amount: -18_500,
      label: "Gehälter",
      monthlyUntil: bis24,
      category: "personal",
    },
    {
      id: "pp-04",
      companyId: "c-mm",
      date: monatsanfang(plusMonate(stichtag, 1)),
      amount: 30_000,
      label: "Provisionen (Plan)",
      monthlyUntil: bis24,
      category: "verkauf",
    },
    {
      id: "pp-05",
      companyId: "c-mb",
      date: monatsanfang(plusMonate(stichtag, 1)),
      amount: -24_000,
      label: "Gehälter",
      monthlyUntil: bis24,
      category: "personal",
    },
    {
      id: "pp-06",
      companyId: "c-mb",
      date: monatsanfang(plusMonate(stichtag, 1)),
      amount: 28_000,
      label: "Rohertrag Maschinenhandel (Plan)",
      monthlyUntil: bis24,
      category: "verkauf",
    },
    {
      id: "pp-07",
      companyId: "c-mh",
      date: datum(
        teile(plusMonate(stichtag, 2)).jahr,
        teile(plusMonate(stichtag, 2)).monat,
        10,
      ),
      amount: -22_000,
      label: "Körperschaftsteuer-Vorauszahlung",
      monthlyUntil: null,
      category: "steuern",
    },
  ];
  // Managementumlage (Intercompany, wird konsolidiert eliminiert)
  for (const tochter of ["c-mi", "c-mo", "c-mv", "c-mb"]) {
    plannedPayments.push({
      id: `pp-u-${tochter}`,
      companyId: tochter,
      date: plusTage(monatsanfang(plusMonate(stichtag, 1)), 14),
      amount: -5_000,
      label: "Managementumlage an Holding",
      monthlyUntil: bis24,
      category: "intercompany",
    });
  }
  plannedPayments.push({
    id: "pp-u-mh",
    companyId: "c-mh",
    date: plusTage(monatsanfang(plusMonate(stichtag, 1)), 14),
    amount: 20_000,
    label: "Managementumlagen der Töchter",
    monthlyUntil: bis24,
    category: "intercompany",
  });

  // --- Anfangssalden so wählen, dass die Salden heute plausibel sind -----------------
  const zielSaldo: Record<string, number> = {
    "k-mh": 1_240_000,
    "k-mh-2": 600_000,
    "k-mi": 312_000,
    "k-mv": 585_000,
    "k-mc": 184_000,
    "k-mo": 146_000,
    "k-mb": 268_000,
    "k-mbt": 104_000,
    "k-gbr": 61_000,
    "k-mm": 96_000,
  };
  for (const k of bankAccounts) {
    const fluss = transactions
      .filter((t) => t.accountId === k.id)
      .reduce((s, t) => s + t.amount, 0);
    k.openingBalance = runden(zielSaldo[k.id] - fluss);
    // Kein Konto soll im Jahresverlauf ins Minus laufen
    let saldo = k.openingBalance;
    let tief = saldo;
    for (const t of transactions
      .filter((t) => t.accountId === k.id)
      .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate))) {
      saldo += t.amount;
      tief = Math.min(tief, saldo);
    }
    if (tief < 20_000)
      k.openingBalance = runden(k.openingBalance + (20_000 - tief));
  }

  transactions.sort(
    (a, b) =>
      a.bookingDate.localeCompare(b.bookingDate) || a.id.localeCompare(b.id),
  );

  // --- Dokumente und CRM-Verknüpfungen ---------------------------------------------
  const documents: BoardDocument[] = [
    ...loans.map((l, i) => ({
      id: `doc-l-${i + 1}`,
      companyId: l.borrowerCompanyId!,
      title: `Darlehensvertrag ${l.id}`,
      docType: "Darlehensvertrag",
      date: l.disbursementDate,
      oneDriveUrl: l.oneDriveUrl ?? `${ONEDRIVE}/Darlehen/${l.id}.pdf`,
      refType: "loan" as const,
      refId: l.id,
    })),
    ...properties.flatMap((p, i) => [
      {
        id: `doc-p-${i + 1}-kv`,
        companyId: p.companyId,
        title: `Kaufvertrag ${p.name}`,
        docType: "Kaufvertrag",
        date: p.purchaseDate!,
        oneDriveUrl: `${p.oneDriveUrl}/Kaufvertrag.pdf`,
        refType: "property" as const,
        refId: p.id,
      },
      {
        id: `doc-p-${i + 1}-gb`,
        companyId: p.companyId,
        title: `Grundbuchauszug ${p.name}`,
        docType: "Grundbuchauszug",
        date: plusTage(stichtag, -r.ganz(30, 400)),
        oneDriveUrl: `${p.oneDriveUrl}/Grundbuch.pdf`,
        refType: "property" as const,
        refId: p.id,
      },
    ]),
  ];

  const crmLinks: CrmLink[] = [
    ...properties.map((p, i) => ({
      id: `crm-p-${i + 1}`,
      entityType: "property" as const,
      entityId: p.id,
      sfObject: "Real_Estate__c",
      sfId: `a0B5g00000Muster${String(i + 1).padStart(2, "0")}`,
      externalId: p.id,
    })),
    ...units
      .filter(
        (u) =>
          properties.find((p) => p.id === u.propertyId)?.strategy ===
          "aufteiler",
      )
      .map((u, i) => ({
        id: `crm-u-${i + 1}`,
        entityType: "unit" as const,
        entityId: u.id,
        sfObject: "Einheit__c",
        sfId: `a0C5g00000Muster${String(i + 1).padStart(2, "0")}`,
        externalId: u.id,
      })),
  ];

  const maschinen = erzeugeMaschinenMock(stichtag, "c-mb");
  return {
    stichtag,
    quelle: "mock",
    companies,
    parties,
    properties,
    units,
    tenants,
    leases,
    leaseEvents,
    loans,
    bankAccounts,
    transactions,
    invoices,
    documents,
    reviewItems: [],
    crmLinks,
    projects,
    plannedPayments,
    machines: maschinen.machines,
    machineCosts: maschinen.costs,
    crm: erzeugeCrmMock({ stichtag, properties, units }),
    datenstand: [],
    luecken: [],
  };
}

/** Hilfsfunktion für Tests und Skripte: Monatsende in n Monaten. */
export { monatsendeIn };
