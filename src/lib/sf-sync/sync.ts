/**
 * Salesforce → Supabase-Caches (sf_*). Läuft mit service_role (Cron oder Button).
 * Je Objekt inkrementell über SystemModstamp, erster Lauf voll, Gelöschte über queryAll.
 * Nur Grenz-Datensätze (Abgrenzung siehe config.ts und Masterplan 3.3).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { inHaeppchen, sfAbfrage, soqlDatum, soqlIdListe, type SfRoh } from "./client";
import { GRENZ_DEAL_RECORD_TYPE, grenzSfUserIds, type SfSyncObjekt } from "./config";
import {
  mappeAktivitaet,
  mappeAnkaufsprofil,
  mappeDeal,
  mappeKampagne,
  mappeKampagnenMitglied,
  mappeKontakt,
  mappeMandat,
  mappeRealEstate,
  type MandatsBezug,
} from "./mapping";

const FELDER = {
  Mandate__c:
    "Id, Name, Stage__c, Type_of_commissioning__c, Price__c, Expose_preis__c, Commission_in__c, Start_date__c, End_Date__c, Fee_Model__c, Lost_Reason__c, Link_to_Dataroom__c, Prognostizierte_Provision__c, Account__c, Contact_Person__c, Real_Estate__c, CreatedById, CreatedDate, SystemModstamp",
  Real_Estate__c:
    "Id, Name, OwnerId, Real_Estate_Type__c, Construction_Year__c, Rental_income__c, Type_of_heating__c, Energy_certificate__c, Property_area__c, Land_guide_value_per_m__c, Purchase_price_expectations__c, Ownership_Type__c, Street_Name__c, Street_Number__c, ZIP_Code__c, City__c, Address__Street__s, Address__City__s, Address__PostalCode__s, Address__Latitude__s, Address__Longitude__s, Notes__c, Highlights__c, Expos_price__c, Stadtbezirk__c, Gemeinde__c, Anzahl_Geschosse__c, Anzahl_Wohnungen__c, Anzahl_Stellpl_tze__c, Gesamtmietfl_che_oberidisch__c, Renable_Area__c, Wohnfl_che__c, Gewerbefl_che__c, Real_Estate_Owner__c, Real_Estate_Owner_Account__c, SystemModstamp",
  Opportunity:
    "Id, Name, StageName, Amount, CloseDate, IsClosed, IsWon, RecordType.DeveloperName, Real_Estate__c, AccountId, ContactId, Primary_Contact__c, Interessent_Contact__c, Interessent_Account__c, Beurkundeter_Kaufpreis_in__c, Provision_in__c, Fee_Model__c, Campaign__c, OwnerId, SystemModstamp",
  Campaign:
    "Id, Name, Type, Status, StartDate, EndDate, NumberOfContacts, NumberOfLeads, NumberOfResponses, Real_Estate__c, Opportunity__c, Anzahl_erfolgte_Bes_chtigungen__c, Anzahl_gesendete_Angebote__c, Anzahl_Kaufangebote__c, Anzahl_Absagen__c, OwnerId, SystemModstamp",
  CampaignMember:
    "Id, CampaignId, ContactId, LeadId, Status, HasResponded, FirstRespondedDate, Besichtigung__c, Kaufangebot__c, Notizen_Kaufangebot__c, Angebot_versendet__c, Provisionsmodell__c, SystemModstamp",
  Investorprofile__c:
    "Id, Name, OwnerId, Account__c, Hauptansprechpartner_Kontakt__c, Investor_Type__c, Objektvolumen_Min_Mio__c, Objektvolumen_Max_Mio__c, Multiplikator_bis_fach__c, Objektklassen__c, Nutzungsarten__c, Objektzustand__c, Transaktionstyp__c, Search_Kreis_kreisfreie_Stadt__c, Search_Stadt_Gemeinde__c, Search_Bundesland__c, Search_Regierungsbezirk__c, AnzahlEinheitenMin__c, BaujahrAb__c, BaujahrBis__c, Teileigentum__c, Erbpacht__c, AltbauHolzdecken__c, Bemerkungsfeld__c, SystemModstamp, (SELECT Location__r.Name, Location_Type__c FROM Search_Locations__r)",
  Task: "Id, Subject, TaskSubtype, Status, ActivityDate, CompletedDateTime, CreatedDate, Description, WhoId, WhatId, OwnerId, SystemModstamp",
  Event: "Id, Subject, EventSubtype, StartDateTime, EndDateTime, CreatedDate, Description, WhoId, WhatId, OwnerId, SystemModstamp",
  EmailMessage:
    "Id, Subject, MessageDate, Status, Incoming, FromAddress, ToAddress, MessageIdentifier, RelatedToId, CreatedById, CreatedDate, SystemModstamp",
  Contact: "Id, Name, FirstName, LastName, AccountId, Account.Name, Email, Phone, MobilePhone, MailingCity, OwnerId, SystemModstamp",
  Account: "Id, Name, Type, Phone, BillingCity, OwnerId, SystemModstamp",
  Lead: "Id, Name, FirstName, LastName, Company, Email, Phone, MobilePhone, City, Status, OwnerId, SystemModstamp",
} as const;

const TABELLE: Record<SfSyncObjekt, string> = {
  Mandate__c: "sf_mandate",
  Real_Estate__c: "sf_real_estate",
  Opportunity: "sf_deals",
  Campaign: "sf_kampagnen",
  CampaignMember: "sf_kampagnen_mitglieder",
  Investorprofile__c: "sf_ankaufsprofile",
  Search_Location__c: "sf_ankaufsprofile",
  Task: "sf_aktivitaeten",
  Event: "sf_aktivitaeten",
  EmailMessage: "sf_aktivitaeten",
  Contact: "sf_kontakte",
  Account: "sf_kontakte",
  Lead: "sf_kontakte",
};

export type SyncErgebnis = {
  objekt: SfSyncObjekt;
  geholt: number;
  geloescht: number;
  fehler: string | null;
};

type Stand = { sf_objekt: string; hoechster_systemmodstamp: string | null };

function seit(stand: Stand | undefined, voll: boolean): string {
  return !voll && stand?.hoechster_systemmodstamp ? ` AND SystemModstamp > ${soqlDatum(stand.hoechster_systemmodstamp)}` : "";
}

function hoechster(records: SfRoh[], bisher: string | null | undefined): string | null {
  let max = bisher ?? null;
  for (const r of records) {
    const t = typeof r.SystemModstamp === "string" ? r.SystemModstamp : null;
    if (t && (!max || t > max)) max = t;
  }
  return max;
}

function eindeutig(records: SfRoh[]): SfRoh[] {
  const map = new Map<string, SfRoh>();
  for (const r of records) map.set(r.Id, r);
  return [...map.values()];
}

async function upsert(admin: SupabaseClient, tabelle: string, zeilen: Record<string, unknown>[]): Promise<void> {
  for (const teil of inHaeppchen(zeilen, 500)) {
    const { error } = await admin.from(tabelle).upsert(teil, { onConflict: "sf_id" });
    if (error) throw new Error(`${tabelle}: ${error.message}`);
  }
}

async function loescheGeloeschte(
  admin: SupabaseClient,
  objekt: SfSyncObjekt,
  stand: Stand | undefined,
): Promise<number> {
  if (!stand?.hoechster_systemmodstamp || objekt === "Search_Location__c") return 0;
  const geloescht = await sfAbfrage(
    `SELECT Id FROM ${objekt} WHERE IsDeleted = true AND SystemModstamp > ${soqlDatum(stand.hoechster_systemmodstamp)}`,
    { geloeschte: true },
  );
  const ids = geloescht.map((r) => r.Id);
  for (const teil of inHaeppchen(ids, 200)) {
    const { error } = await admin.from(TABELLE[objekt]).delete().in("sf_id", teil);
    if (error) throw new Error(error.message);
  }
  return ids.length;
}

async function idsAus(admin: SupabaseClient, tabelle: string, spalte: string): Promise<string[]> {
  const ids = new Set<string>();
  const SEITE = 1000;
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await admin
      .from(tabelle)
      .select(spalte)
      .not(spalte, "is", null)
      .range(von, von + SEITE - 1);
    if (error) throw new Error(`${tabelle}.${spalte}: ${error.message}`);
    for (const z of (data ?? []) as unknown as Record<string, unknown>[]) {
      const v = z[spalte];
      if (typeof v === "string" && v) ids.add(v);
    }
    if (!data || data.length < SEITE) break;
  }
  return [...ids];
}

async function mandatsBezug(admin: SupabaseClient): Promise<MandatsBezug> {
  const { data: mandate, error } = await admin.from("sf_mandate").select("sf_id, real_estate_sf_id");
  if (error) throw new Error(error.message);
  const mandatJeRealEstate = new Map<string, string>();
  for (const m of mandate ?? []) {
    if (m.real_estate_sf_id) mandatJeRealEstate.set(String(m.real_estate_sf_id), String(m.sf_id));
  }
  const { data: deals, error: dealFehler } = await admin.from("sf_deals").select("sf_id, mandat_sf_id");
  if (dealFehler) throw new Error(dealFehler.message);
  const mandatJeDeal = new Map<string, string>();
  for (const d of deals ?? []) {
    if (d.mandat_sf_id) mandatJeDeal.set(String(d.sf_id), String(d.mandat_sf_id));
  }
  return { mandatJeRealEstate, mandatJeDeal };
}

/** Datensätze per Id-Liste, nur geänderte (inkrementell) oder alle (voll / neu referenziert). */
async function perIds(objekt: string, felder: string, ids: string[], filter = ""): Promise<SfRoh[]> {
  const ergebnis: SfRoh[] = [];
  for (const teil of inHaeppchen(ids, 200)) {
    ergebnis.push(...(await sfAbfrage(`SELECT ${felder} FROM ${objekt} WHERE Id IN (${soqlIdListe(teil)})${filter}`)));
  }
  return ergebnis;
}

async function holeObjekt(
  admin: SupabaseClient,
  objekt: SfSyncObjekt,
  stand: Stand | undefined,
  voll: boolean,
): Promise<{ records: SfRoh[]; zeilen: Record<string, unknown>[] }> {
  const user = soqlIdListe(grenzSfUserIds());
  const s = seit(stand, voll);
  const grenzDeals = `SELECT Id FROM Opportunity WHERE RecordType.DeveloperName = '${GRENZ_DEAL_RECORD_TYPE}'`;

  switch (objekt) {
    case "Mandate__c": {
      // Mandate__c: alle.
      const r = await sfAbfrage(`SELECT ${FELDER.Mandate__c} FROM Mandate__c WHERE IsDeleted = false${s}`);
      return { records: r, zeilen: r.map(mappeMandat) };
    }
    case "Real_Estate__c": {
      // Nur Objekte mit Mandat.
      const r = await sfAbfrage(
        `SELECT ${FELDER.Real_Estate__c} FROM Real_Estate__c WHERE Id IN (SELECT Real_Estate__c FROM Mandate__c)${s}`,
      );
      return { records: r, zeilen: r.map(mappeRealEstate) };
    }
    case "Opportunity": {
      const r = await sfAbfrage(
        `SELECT ${FELDER.Opportunity} FROM Opportunity WHERE RecordType.DeveloperName = '${GRENZ_DEAL_RECORD_TYPE}'${s}`,
      );
      const kontext = await mandatsBezug(admin);
      return { records: r, zeilen: r.map((x) => mappeDeal(x, kontext)) };
    }
    case "Campaign": {
      // Vermarktungskampagnen mit Mandatsbezug plus Kampagnen der Grenz-User.
      const a = await sfAbfrage(
        `SELECT ${FELDER.Campaign} FROM Campaign WHERE Real_Estate__c IN (SELECT Real_Estate__c FROM Mandate__c)${s}`,
      );
      const b = await sfAbfrage(`SELECT ${FELDER.Campaign} FROM Campaign WHERE OwnerId IN (${user})${s}`);
      const r = eindeutig([...a, ...b]);
      const kontext = await mandatsBezug(admin);
      return { records: r, zeilen: r.map((x) => mappeKampagne(x, kontext)) };
    }
    case "CampaignMember": {
      const kampagnen = await idsAus(admin, "sf_kampagnen", "sf_id");
      const r: SfRoh[] = [];
      for (const teil of inHaeppchen(kampagnen, 100)) {
        r.push(
          ...(await sfAbfrage(
            `SELECT ${FELDER.CampaignMember} FROM CampaignMember WHERE CampaignId IN (${soqlIdListe(teil)})${s}`,
          )),
        );
      }
      return { records: r, zeilen: r.map(mappeKampagnenMitglied) };
    }
    case "Investorprofile__c": {
      // Alle Ankaufsprofile, auch FRENKEN-eigene (Entscheidung Maurice).
      const r = await sfAbfrage(`SELECT ${FELDER.Investorprofile__c} FROM Investorprofile__c WHERE IsDeleted = false${s}`);
      return { records: r, zeilen: r.map(mappeAnkaufsprofil) };
    }
    case "Search_Location__c": {
      // Geänderte Search Locations → betroffene Profile vollständig neu holen (Regionen).
      const sl = await sfAbfrage(`SELECT Investorprofile__c, SystemModstamp FROM Search_Location__c WHERE Investorprofile__c != null${s}`);
      const profile = [...new Set(sl.map((x) => String(x.Investorprofile__c)))];
      const r = await perIds("Investorprofile__c", FELDER.Investorprofile__c, profile);
      return { records: sl, zeilen: r.map(mappeAnkaufsprofil) };
    }
    case "Task":
    case "Event": {
      const felder = FELDER[objekt];
      const teile = [
        `SELECT ${felder} FROM ${objekt} WHERE OwnerId IN (${user})${s}`,
        `SELECT ${felder} FROM ${objekt} WHERE WhatId IN (SELECT Id FROM Mandate__c)${s}`,
        `SELECT ${felder} FROM ${objekt} WHERE WhatId IN (SELECT Real_Estate__c FROM Mandate__c)${s}`,
        `SELECT ${felder} FROM ${objekt} WHERE WhatId IN (${grenzDeals})${s}`,
      ];
      const r = eindeutig((await Promise.all(teile.map((q) => sfAbfrage(q)))).flat());
      const kontext = await mandatsBezug(admin);
      return { records: r, zeilen: r.map((x) => mappeAktivitaet(x, objekt, kontext)) };
    }
    case "EmailMessage": {
      const felder = FELDER.EmailMessage;
      const teile = [
        `SELECT ${felder} FROM EmailMessage WHERE CreatedById IN (${user})${s}`,
        `SELECT ${felder} FROM EmailMessage WHERE RelatedToId IN (SELECT Id FROM Mandate__c)${s}`,
      ];
      const r = eindeutig((await Promise.all(teile.map((q) => sfAbfrage(q)))).flat());
      const kontext = await mandatsBezug(admin);
      return { records: r, zeilen: r.map((x) => mappeAktivitaet(x, "EmailMessage", kontext)) };
    }
    case "Contact":
    case "Account":
    case "Lead": {
      return holeKontakte(admin, objekt, s, user);
    }
  }
}

/**
 * Kontakte/Accounts/Leads: Owner ist Grenz-User, oder der Datensatz wird von einem
 * Grenz-Datensatz referenziert (Mandat, Ankaufsprofil, Kampagnenmitglied, Deal, Aktivität).
 * Neu referenzierte Datensätze werden vollständig geholt, bekannte nur bei Änderung.
 */
async function holeKontakte(
  admin: SupabaseClient,
  objekt: "Contact" | "Account" | "Lead",
  s: string,
  user: string,
): Promise<{ records: SfRoh[]; zeilen: Record<string, unknown>[] }> {
  const prefix = { Contact: "003", Account: "001", Lead: "00Q" }[objekt];
  const quellen: [string, string][] =
    objekt === "Account"
      ? [
          ["sf_mandate", "eigentuemer_account_sf_id"],
          ["sf_ankaufsprofile", "account_sf_id"],
          ["sf_deals", "account_sf_id"],
          ["sf_real_estate", "eigentuemer_account_sf_id"],
          ["sf_kontakte", "account_sf_id"],
        ]
      : [
          ["sf_mandate", "eigentuemer_kontakt_sf_id"],
          ["sf_ankaufsprofile", "kontakt_sf_id"],
          ["sf_kampagnen_mitglieder", "kontakt_sf_id"],
          ["sf_deals", "kontakt_sf_id"],
          ["sf_aktivitaeten", "who_sf_id"],
          ["sf_real_estate", "eigentuemer_kontakt_sf_id"],
        ];

  const referenziert = new Set<string>();
  for (const [tabelle, spalte] of quellen) {
    for (const id of await idsAus(admin, tabelle, spalte)) if (id.startsWith(prefix)) referenziert.add(id);
  }
  const vorhanden = new Set(
    (await idsAus(admin, "sf_kontakte", "sf_id")).filter((id) => id.startsWith(prefix)),
  );
  const neu = [...referenziert].filter((id) => !vorhanden.has(id));
  const bekannt = [...referenziert].filter((id) => vorhanden.has(id));

  const felder = FELDER[objekt];
  const r = eindeutig([
    ...(await sfAbfrage(`SELECT ${felder} FROM ${objekt} WHERE OwnerId IN (${user})${s}`)),
    ...(await perIds(objekt, felder, neu)),
    ...(s ? await perIds(objekt, felder, bekannt, s) : await perIds(objekt, felder, bekannt)),
  ]);
  return { records: r, zeilen: r.map((x) => mappeKontakt(x, objekt)) };
}

/**
 * Ein Sync-Lauf über alle Objekte. Fehler eines Objekts stoppen die anderen nicht,
 * sie landen in sf_sync_stand.letzter_fehler.
 */
export async function salesforceSyncAusfuehren(
  admin: SupabaseClient,
  optionen: { voll?: boolean; nur?: SfSyncObjekt[] } = {},
): Promise<SyncErgebnis[]> {
  const { data: staende, error } = await admin.from("sf_sync_stand").select("sf_objekt, hoechster_systemmodstamp");
  if (error) throw new Error(error.message);
  const standJe = new Map((staende ?? []).map((x) => [String(x.sf_objekt), x as Stand]));

  const reihenfolge: SfSyncObjekt[] = [
    "Mandate__c",
    "Real_Estate__c",
    "Opportunity",
    "Campaign",
    "CampaignMember",
    "Investorprofile__c",
    "Search_Location__c",
    "Task",
    "Event",
    "EmailMessage",
    "Contact",
    "Account",
    "Lead",
  ];
  const ergebnisse: SyncErgebnis[] = [];

  for (const objekt of reihenfolge) {
    if (optionen.nur && !optionen.nur.includes(objekt)) continue;
    const stand = standJe.get(objekt);
    const voll = Boolean(optionen.voll) || !stand?.hoechster_systemmodstamp;
    const start = new Date().toISOString();
    try {
      const { records, zeilen } = await holeObjekt(admin, objekt, stand, voll);
      await upsert(admin, TABELLE[objekt], zeilen);
      const geloescht = await loescheGeloeschte(admin, objekt, stand);
      const { error: standFehler } = await admin.from("sf_sync_stand").upsert(
        {
          sf_objekt: objekt,
          letzter_abruf_am: start,
          hoechster_systemmodstamp: hoechster(records, stand?.hoechster_systemmodstamp),
          anzahl: zeilen.length,
          letzter_fehler: null,
        },
        { onConflict: "sf_objekt" },
      );
      if (standFehler) throw new Error(standFehler.message);
      ergebnisse.push({ objekt, geholt: zeilen.length, geloescht, fehler: null });
    } catch (err) {
      const fehler = err instanceof Error ? err.message : String(err);
      await admin
        .from("sf_sync_stand")
        .upsert({ sf_objekt: objekt, letzter_abruf_am: start, letzter_fehler: fehler.slice(0, 1000) }, { onConflict: "sf_objekt" });
      ergebnisse.push({ objekt, geholt: 0, geloescht: 0, fehler });
    }
  }
  return ergebnisse;
}

/** Nach einem Schreibvorgang: einen Datensatz sofort neu in den Cache holen. */
function mappeEinzeln(objekt: Exclude<SfSyncObjekt, "Search_Location__c">, r: SfRoh, kontext: MandatsBezug) {
  switch (objekt) {
    case "Mandate__c":
      return mappeMandat(r);
    case "Real_Estate__c":
      return mappeRealEstate(r);
    case "Opportunity":
      return mappeDeal(r, kontext);
    case "Campaign":
      return mappeKampagne(r, kontext);
    case "CampaignMember":
      return mappeKampagnenMitglied(r);
    case "Investorprofile__c":
      return mappeAnkaufsprofil(r);
    case "Task":
    case "Event":
    case "EmailMessage":
      return mappeAktivitaet(r, objekt, kontext);
    case "Contact":
    case "Account":
    case "Lead":
      return mappeKontakt(r, objekt);
  }
}

export async function sfDatensatzNeuHolen(admin: SupabaseClient, objekt: SfSyncObjekt, sfId: string): Promise<void> {
  await sfDatensaetzeNeuHolen(admin, objekt, [sfId]);
}

/** Datensätze nach einem Schreibvorgang sofort neu in den Cache holen; gelöschte entfernen. */
export async function sfDatensaetzeNeuHolen(admin: SupabaseClient, objekt: SfSyncObjekt, sfIds: string[]): Promise<void> {
  if (objekt === "Search_Location__c" || !sfIds.length) return;
  const records: SfRoh[] = [];
  for (const teil of inHaeppchen(sfIds, 200)) records.push(...(await perIds(objekt, FELDER[objekt], teil)));
  const gefunden = new Set(records.map((r) => r.Id));
  const fehlend = sfIds.filter((id) => !gefunden.has(id));
  if (fehlend.length) await admin.from(TABELLE[objekt]).delete().in("sf_id", fehlend);
  if (!records.length) return;
  const kontext = await mandatsBezug(admin);
  await upsert(admin, TABELLE[objekt], records.map((r) => mappeEinzeln(objekt, r, kontext)));
}
