/**
 * Liest die Akquise-Rohdaten live aus Salesforce (Server-Zugang wie der Sync).
 * Aufgaben der Grenz-User mit Lead-/Kontaktdaten per TYPEOF, dazu Mandate,
 * gewonnene Deals und der Recherche-Pool der Eigentümer-Leads.
 */

import { sfAbfrage, soqlIdListe, type SfRoh } from "@/lib/sf-sync/client";
import { GRENZ_DEAL_RECORD_TYPE, grenzSfUserIds } from "@/lib/sf-sync/config";

import type {
  RohAufgabe,
  RohKauf,
  RohMandat,
  RohPerson,
  Rohdaten,
} from "./typen";

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function zahl(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bezug(r: unknown, pfad: string): unknown {
  let x = r;
  for (const teil of pfad.split(".")) {
    if (!x || typeof x !== "object") return null;
    x = (x as Record<string, unknown>)[teil];
  }
  return x;
}

/** Salesforce-Datetime „2026-10-23T14:29:21.000+0000“ → ISO mit Z. */
function zeit(v: unknown): string | null {
  const t = text(v);
  if (!t) return null;
  const d = new Date(t.replace(/\+0000$/, "Z"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function person(who: unknown): RohPerson | null {
  if (!who || typeof who !== "object") return null;
  const w = who as SfRoh;
  const typ = w.attributes?.type;
  const id = text(w.Id);
  if (!id || (typ !== "Lead" && typ !== "Contact")) return null;
  if (typ === "Lead") {
    return {
      id,
      typ,
      name: text(w.Name),
      firma: text(w.Company),
      ort: text(w.City),
      strasse: text(w.Street),
      accountId: text(w.ConvertedAccountId),
      leadStatus: text(w.Status),
      leadQuelle: text(w.LeadSource),
      absagegrund: text(w.Unqualified_Reason__c),
      bewertung: text(w.Rating),
      nichtKontaktieren: w.DO_NOT_CONTACT__c === true,
      konvertiert: w.IsConverted === true,
    };
  }
  return {
    id,
    typ,
    name: text(w.Name),
    firma: text(bezug(w, "Account.Name")),
    ort: text(w.MailingCity),
    strasse: null,
    accountId: text(w.AccountId),
    leadStatus: null,
    leadQuelle: null,
    absagegrund: null,
    bewertung: null,
    nichtKontaktieren: false,
    konvertiert: false,
  };
}

const WHO =
  "TYPEOF Who WHEN Lead THEN Id, Name, Company, Status, LeadSource, Unqualified_Reason__c, City, Street, Rating, DO_NOT_CONTACT__c, IsConverted, ConvertedAccountId WHEN Contact THEN Id, Name, AccountId, Account.Name, MailingCity END";

function worauf(r: SfRoh): RohAufgabe["worauf"] {
  const id = text(r.WhatId);
  if (!id) return null;
  return {
    id,
    typ: text(bezug(r, "What.Type")) ?? "",
    name: text(bezug(r, "What.Name")),
  };
}

export function mappeTask(r: SfRoh): RohAufgabe {
  return {
    id: r.Id,
    typ: "Task" as const,
    betreff: text(r.Subject) ?? "",
    subtyp: text(r.TaskSubtype),
    status: text(r.Status),
    faelligAm: text(r.ActivityDate),
    erledigtAm: r.Status === "Completed" ? zeit(r.CompletedDateTime) : null,
    erstelltAm: zeit(r.CreatedDate) ?? new Date(0).toISOString(),
    bearbeiter: text(bezug(r, "Owner.Name")),
    wer: person(r.Who),
    worauf: worauf(r),
  };
}

async function aufgaben(user: string): Promise<RohAufgabe[]> {
  const [tasks, events] = await Promise.all([
    sfAbfrage(
      `SELECT Id, Subject, TaskSubtype, Status, ActivityDate, CompletedDateTime, CreatedDate, Owner.Name, WhatId, What.Type, What.Name, ${WHO} FROM Task WHERE OwnerId IN (${user}) AND CreatedDate = LAST_N_MONTHS:36`,
    ),
    sfAbfrage(
      `SELECT Id, Subject, EventSubtype, StartDateTime, CreatedDate, Owner.Name, WhatId, What.Type, What.Name, ${WHO} FROM Event WHERE OwnerId IN (${user}) AND CreatedDate = LAST_N_MONTHS:36`,
    ),
  ]);
  const t = tasks.map(mappeTask);
  const e: RohAufgabe[] = events.map((r) => ({
    id: r.Id,
    typ: "Event",
    betreff: text(r.Subject) ?? "Termin",
    subtyp: text(r.EventSubtype),
    status: "Completed",
    faelligAm: text(r.StartDateTime)?.slice(0, 10) ?? null,
    erledigtAm: zeit(r.StartDateTime),
    erstelltAm: zeit(r.CreatedDate) ?? new Date(0).toISOString(),
    bearbeiter: text(bezug(r, "Owner.Name")),
    wer: person(r.Who),
    worauf: worauf(r),
  }));
  return [...t, ...e];
}

export function mappeMandat(m: SfRoh): RohMandat {
  return {
    id: m.Id,
    name: text(m.Name) ?? m.Id,
    phase: text(m.Stage__c),
    verlustgrund: text(m.Lost_Reason__c),
    erstelltAm: zeit(m.CreatedDate) ?? "",
    geaendertAm: zeit(m.LastModifiedDate) ?? "",
    eigentuemer: text(bezug(m, "Account__r.Name")),
    accountId: text(m.Account__c),
    ansprechpartner: text(bezug(m, "Contact_Person__r.Name")),
    objekt: text(bezug(m, "Real_Estate__r.Name")),
  };
}

async function mandate(): Promise<RohMandat[]> {
  const r = await sfAbfrage(
    "SELECT Id, Name, Stage__c, Lost_Reason__c, CreatedDate, LastModifiedDate, Account__c, Account__r.Name, Contact_Person__r.Name, Real_Estate__r.Name FROM Mandate__c",
  );
  return r.map(mappeMandat);
}

export function mappeKauf(d: SfRoh): RohKauf {
  return {
    id: d.Id,
    name: text(d.Name) ?? d.Id,
    abschlussAm: text(d.CloseDate),
    kaufpreis: zahl(d.Beurkundeter_Kaufpreis_in__c),
    kaeufer: text(bezug(d, "Account.Name")),
    accountId: text(d.AccountId),
    objekt: text(bezug(d, "Real_Estate__r.Name")),
  };
}

async function kaeufe(): Promise<RohKauf[]> {
  const r = await sfAbfrage(
    `SELECT Id, Name, CloseDate, Beurkundeter_Kaufpreis_in__c, AccountId, Account.Name, Real_Estate__r.Name FROM Opportunity WHERE RecordType.DeveloperName = '${GRENZ_DEAL_RECORD_TYPE}' AND IsWon = true`,
  );
  return r.map(mappeKauf);
}

async function leadPool(): Promise<Rohdaten["leadPool"]> {
  const r = await sfAbfrage(
    "SELECT Status, COUNT(Id) n FROM Lead WHERE LeadSource LIKE 'Upload%' GROUP BY Status",
  );
  return r.map((x) => ({
    status: text(x.Status) ?? "ohne Status",
    anzahl: zahl(x.n) ?? 0,
  }));
}

export async function akquiseRohdatenLaden(): Promise<Rohdaten> {
  const user = soqlIdListe(grenzSfUserIds());
  const [a, m, k, p] = await Promise.all([
    aufgaben(user),
    mandate(),
    kaeufe(),
    leadPool(),
  ]);
  return { aufgaben: a, mandate: m, kaeufe: k, leadPool: p };
}
