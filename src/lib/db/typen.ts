/**
 * Zentrales Datenmodell des Management Boards.
 * Spiegelt das SQL-Schema `board` (supabase/migrations/20261007120000_board_kerndatenmodell.sql).
 * Beträge in EUR als Zahl, Zinssätze als Anteil (0,03 = 3 % p.a.), Daten als ISO-String.
 */
import { z } from "zod";

const isoDatum = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT erwartet");

export const SEGMENTE = [
  "holding",
  "bestand",
  "aufteiler",
  "baumaschinen",
  "beteiligungen",
  "makler",
] as const;
export type Segment = (typeof SEGMENTE)[number];

export const SEGMENT_LABEL: Record<Segment, string> = {
  holding: "Holding",
  bestand: "Immobilien Bestand",
  aufteiler: "Immobilien Aufteiler",
  baumaschinen: "Baumaschinen",
  beteiligungen: "Beteiligungen",
  makler: "Makler (getrennt)",
};

export const companySchema = z.object({
  id: z.string(),
  shortName: z.string(),
  name: z.string(),
  legalForm: z.enum(["GmbH", "GbR", "GmbH & Co. KG"]),
  segment: z.enum(SEGMENTE),
  /** Mindestliquidität (Puffer), unter der gewarnt wird */
  minLiquidity: z.number().nonnegative(),
  /** Getrennter Bereich: nicht Teil der freien Gruppenliquidität */
  separateArea: z.boolean(),
  oneDriveFolder: z.string(),
});
export type Company = z.infer<typeof companySchema>;

export const partySchema = z.object({
  id: z.string(),
  kind: z.enum(["person", "bank", "extern"]),
  name: z.string(),
  iban: z.string().optional(),
  email: z.string().optional(),
});
export type Party = z.infer<typeof partySchema>;

export const propertySchema = z.object({
  id: z.string().regex(/^IM-\d{4}-\d{3}$/),
  companyId: z.string(),
  name: z.string(),
  street: z.string(),
  zip: z.string(),
  city: z.string(),
  strategy: z.enum(["bestand", "aufteiler"]),
  yearBuilt: z.number().int(),
  purchaseDate: isoDatum,
  purchasePrice: z.number(),
  marketValue: z.number(),
  /** Ziel-/Potenzialmiete je m² (Mietspiegel-Oberwert) */
  targetRentPerSqm: z.number(),
  /** monatliche Bewirtschaftungskosten je m² (Plan) */
  costPerSqmMonth: z.number(),
  oneDriveUrl: z.string(),
});
export type Property = z.infer<typeof propertySchema>;

export const UNIT_STATUS = [
  "vermietet",
  "leer",
  "sanierung",
  "im_vertrieb",
  "reserviert",
  "verkauft",
] as const;
export type UnitStatus = (typeof UNIT_STATUS)[number];

export const unitSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  label: z.string(),
  kind: z.enum(["wohnung", "gewerbe"]),
  area: z.number().positive(),
  rooms: z.number(),
  floor: z.string(),
  status: z.enum(UNIT_STATUS),
  /** Aufteiler: geplanter Verkaufspreis */
  listPrice: z.number().optional(),
  /** Aufteiler: beurkundeter Verkaufspreis */
  salePrice: z.number().optional(),
  saleDate: isoDatum.optional(),
});
export type Unit = z.infer<typeof unitSchema>;

export const tenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  iban: z.string(),
});
export type Tenant = z.infer<typeof tenantSchema>;

export const leaseSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  tenantId: z.string(),
  start: isoDatum,
  end: isoDatum.nullable(),
  baseRent: z.number().nonnegative(),
  serviceCharge: z.number().nonnegative(),
  deposit: z.number().nonnegative(),
  lastRentIncrease: isoDatum.nullable(),
});
export type Lease = z.infer<typeof leaseSchema>;

export const leaseEventSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    leaseId: z.string(),
    kind: z.literal("kuendigung"),
    /** Zugang der Kündigung */
    receivedOn: isoDatum,
    by: z.enum(["mieter", "vermieter"]),
    /** vereinbarter/angekündigter Auszug, falls abweichend vom Fristende */
    moveOutPlanned: isoDatum.nullable(),
  }),
  z.object({
    id: z.string(),
    leaseId: z.string(),
    kind: z.literal("mieterhoehung"),
    /** Zugang des Erhöhungsverlangens beim Mieter */
    receivedOn: isoDatum,
    newBaseRent: z.number().positive(),
    status: z.enum(["offen", "zugestimmt", "abgelehnt"]),
  }),
]);
export type LeaseEvent = z.infer<typeof leaseEventSchema>;

export const repaymentSchema = z.discriminatedUnion("kind", [
  /** Annuität: konstante Rate je Periode (Zins + Tilgung) */
  z.object({
    kind: z.literal("annuitaet"),
    installment: z.number().positive(),
  }),
  /** Ratentilgung: konstante Tilgung je Periode, Zinsen zusätzlich */
  z.object({
    kind: z.literal("ratentilgung"),
    principalPerPeriod: z.number().positive(),
  }),
  /** Endfällig: nur Zinsen, Rückzahlung zum Ende */
  z.object({ kind: z.literal("endfaellig") }),
]);
export type Repayment = z.infer<typeof repaymentSchema>;

export const LOAN_KINDS = ["bank", "intercompany", "gesellschafter"] as const;
export type LoanKind = (typeof LOAN_KINDS)[number];
export const LOAN_KIND_LABEL: Record<LoanKind, string> = {
  bank: "Bank",
  intercompany: "Intercompany",
  gesellschafter: "Gesellschafter",
};

export const DAY_COUNTS = ["30/360", "act/360", "act/365"] as const;
export type DayCount = (typeof DAY_COUNTS)[number];

export const FREQUENZEN = ["monatlich", "quartalsweise", "jaehrlich"] as const;
export type Frequenz = (typeof FREQUENZEN)[number];

export const loanSchema = z
  .object({
    id: z
      .string()
      .regex(/^DL-\d{4}-\d{3}$/, "Darlehens-ID im Format DL-JJJJ-NNN"),
    bankRef: z
      .string()
      .regex(/^BK-\d{4}-\d{3}$/, "Bank-ID im Format BK-JJJJ-NNN")
      .nullable(),
    kind: z.enum(LOAN_KINDS),
    lenderCompanyId: z.string().nullable(),
    lenderPartyId: z.string().nullable(),
    borrowerCompanyId: z.string().nullable(),
    borrowerPartyId: z.string().nullable(),
    propertyId: z.string().nullable(),
    principal: z.number().positive(),
    disbursementDate: isoDatum,
    rate: z.number().min(0).max(0.25),
    rateType: z.enum(["fest", "variabel"]),
    fixedUntil: isoDatum.nullable(),
    /** Vertragsende; null = unbefristet (kündbar) */
    maturityDate: isoDatum.nullable(),
    repayment: repaymentSchema,
    frequency: z.enum(FREQUENZEN),
    dayCount: z.enum(DAY_COUNTS),
    status: z.enum(["aktiv", "beendet", "entwurf"]),
    guarantee: z
      .object({ by: z.string(), amount: z.number().positive() })
      .nullable(),
    purpose: z.string(),
    oneDriveUrl: z.string().nullable(),
  })
  .refine((l) => Boolean(l.lenderCompanyId) !== Boolean(l.lenderPartyId), {
    message: "Genau ein Darlehensgeber (Gesellschaft oder Partei) erforderlich",
    path: ["lenderCompanyId"],
  })
  .refine((l) => Boolean(l.borrowerCompanyId) !== Boolean(l.borrowerPartyId), {
    message:
      "Genau ein Darlehensnehmer (Gesellschaft oder Partei) erforderlich",
    path: ["borrowerCompanyId"],
  })
  .refine((l) => !l.maturityDate || l.maturityDate > l.disbursementDate, {
    message: "Ende muss nach der Auszahlung liegen",
    path: ["maturityDate"],
  });
export type Loan = z.infer<typeof loanSchema>;

export interface InterestScheduleRow {
  loanId: string;
  nr: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  /** Zinstage nach Konvention */
  days: number;
  interest: number;
  principal: number;
  payment: number;
  balanceAfter: number;
  /** Rumpfperiode (kürzer als die reguläre Periode) */
  stub: boolean;
}

export const bankAccountSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  iban: z.string(),
  bankName: z.string(),
  label: z.string(),
  openingBalance: z.number(),
  openingDate: isoDatum,
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

export const TX_KATEGORIEN = [
  "miete",
  "darlehen",
  "rechnung",
  "verkauf",
  "ankauf",
  "personal",
  "steuern",
  "intercompany",
  "sonstiges",
] as const;
export type TxKategorie = (typeof TX_KATEGORIEN)[number];

export const transactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  bookingDate: isoDatum,
  /** positiv = Eingang, negativ = Ausgang */
  amount: z.number(),
  counterpartyName: z.string(),
  counterpartyIban: z.string().nullable(),
  purpose: z.string(),
  category: z.enum(TX_KATEGORIEN),
  propertyId: z.string().nullable(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const invoiceSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  direction: z.enum(["eingang", "ausgang"]),
  counterparty: z.string(),
  amount: z.number().positive(),
  issueDate: isoDatum,
  dueDate: isoDatum,
  status: z.enum(["offen", "bezahlt"]),
  propertyId: z.string().nullable(),
  projectId: z.string().nullable(),
  description: z.string(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const documentSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  title: z.string(),
  docType: z.string(),
  date: isoDatum,
  /** Link in OneDrive; das Board speichert nie die Datei selbst */
  oneDriveUrl: z.string(),
  refType: z
    .enum(["loan", "property", "lease", "project", "company"])
    .nullable(),
  refId: z.string().nullable(),
});
export type BoardDocument = z.infer<typeof documentSchema>;

export const REVIEW_QUELLEN = [
  "darlehen",
  "immobilien",
  "liquiditaet",
  "ablage",
  "salesforce",
] as const;
export type ReviewQuelle = (typeof REVIEW_QUELLEN)[number];

export const reviewItemSchema = z.object({
  id: z.string(),
  source: z.enum(REVIEW_QUELLEN),
  severity: z.enum(["rot", "gelb"]),
  title: z.string(),
  detail: z.string(),
  companyId: z.string().nullable(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  /** Fälligkeit/Datum, an dem der Fall relevant wird */
  dueDate: isoDatum.nullable(),
  createdAt: isoDatum,
  status: z.enum(["offen", "erledigt"]),
  /** KI-Konfidenz 0–1, falls aus einer Erkennung */
  confidence: z.number().min(0).max(1).nullable(),
});
export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const crmLinkSchema = z.object({
  id: z.string(),
  entityType: z.enum(["property", "unit", "party", "acquisition"]),
  entityId: z.string(),
  sfObject: z.string(),
  sfId: z.string(),
  /** External ID im Salesforce-Feld Board_ID__c */
  externalId: z.string(),
});
export type CrmLink = z.infer<typeof crmLinkSchema>;

export const projectSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  name: z.string(),
  purchasePrice: z.number(),
  renovationBudget: z.number(),
  equity: z.number(),
  start: isoDatum,
  plannedEnd: isoDatum,
  /** geplanter Gesamterlös aller Einheiten */
  plannedRevenue: z.number(),
});
export type Project = z.infer<typeof projectSchema>;

export const plannedPaymentSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  date: isoDatum,
  amount: z.number(),
  label: z.string(),
  /** Wiederholung monatlich bis `until` */
  monthlyUntil: isoDatum.nullable(),
  category: z.enum(TX_KATEGORIEN),
});
export type PlannedPayment = z.infer<typeof plannedPaymentSchema>;

/** Gesamter Datenbestand, wie ihn das Board lädt. */
export interface BoardDaten {
  stichtag: string;
  companies: Company[];
  parties: Party[];
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  leaseEvents: LeaseEvent[];
  loans: Loan[];
  bankAccounts: BankAccount[];
  transactions: Transaction[];
  invoices: Invoice[];
  documents: BoardDocument[];
  reviewItems: ReviewItem[];
  crmLinks: CrmLink[];
  projects: Project[];
  plannedPayments: PlannedPayment[];
}
