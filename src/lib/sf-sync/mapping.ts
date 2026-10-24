/**
 * Salesforce-Datensatz → Zeile der Cache-Tabelle. Reine Funktionen, getestet in mapping.test.ts.
 * Kernfelder typisiert, der vollständige Rohdatensatz bleibt in sf_daten.
 */

import type { SfRoh } from "./client";

type Zeile = Record<string, unknown>;

function text(wert: unknown): string | null {
  if (typeof wert !== "string") return wert == null ? null : String(wert);
  const t = wert.trim();
  return t ? t : null;
}

function zahl(wert: unknown): number | null {
  if (wert == null || wert === "") return null;
  const n = typeof wert === "number" ? wert : Number(String(wert).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** 0 heißt in Salesforce meist „nicht gepflegt“, nicht „kostenlos“. */
function betrag(wert: unknown): number | null {
  const n = zahl(wert);
  return n && n > 0 ? n : null;
}

function datum(wert: unknown): string | null {
  const t = text(wert);
  return t ? t.slice(0, 10) : null;
}

function rohOhneAttribute(r: SfRoh): Zeile {
  const { attributes: _attribute, ...rest } = r;
  return rest;
}

function basis(r: SfRoh): Zeile {
  return {
    sf_id: r.Id,
    sf_daten: rohOhneAttribute(r),
    sf_geaendert_am: text(r.SystemModstamp),
    abgerufen_am: new Date().toISOString(),
  };
}

function bezug(r: SfRoh, pfad: string): unknown {
  return pfad.split(".").reduce<unknown>((obj, teil) => {
    if (obj && typeof obj === "object") return (obj as Record<string, unknown>)[teil];
    return undefined;
  }, r);
}

/** Multipicklist (Semikolon) oder Freitext (Komma, Semikolon, Zeilenumbruch) → bereinigte Liste. */
export function liste(wert: unknown): string[] {
  const t = text(wert);
  if (!t) return [];
  const teile = t
    .split(/[;,\n\r]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && s.toLowerCase() !== "all");
  const gesehen = new Set<string>();
  const ergebnis: string[] = [];
  for (const teil of teile) {
    const schluessel = teil.toLocaleLowerCase("de-DE");
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.push(teil);
  }
  return ergebnis;
}

/** Regionen eines Ankaufsprofils: Kreis/kreisfreie Stadt, Stadt/Gemeinde und Search Locations. */
export function regionenAusProfil(r: SfRoh): string[] {
  const locations = (bezug(r, "Search_Locations__r.records") as SfRoh[] | undefined) ?? [];
  const namen = locations.map((l) => text(bezug(l, "Location__r.Name"))).filter((n): n is string => Boolean(n));
  return liste(
    [r.Search_Kreis_kreisfreie_Stadt__c, r.Search_Stadt_Gemeinde__c, namen.join(";")]
      .map((v) => text(v) ?? "")
      .join(";"),
  );
}

export function mappeMandat(r: SfRoh): Zeile {
  return {
    ...basis(r),
    name: text(r.Name) ?? r.Id,
    status: text(r.Stage__c),
    art: text(r.Type_of_commissioning__c),
    real_estate_sf_id: text(r.Real_Estate__c),
    eigentuemer_account_sf_id: text(r.Account__c),
    eigentuemer_kontakt_sf_id: text(r.Contact_Person__c),
    verantwortlich_sf_user_id: text(r.CreatedById),
    // Price__c ist kaum gepflegt, der Exposépreis ist der Angebotspreis.
    angebotspreis: betrag(r.Price__c) ?? betrag(r.Expose_preis__c),
    provision_prozent: zahl(r.Commission_in__c),
    beauftragt_am: datum(r.Start_date__c),
  };
}

export function mappeRealEstate(r: SfRoh): Zeile {
  const strasse = [text(r.Street_Name__c), text(r.Street_Number__c)].filter(Boolean).join(" ");
  return {
    ...basis(r),
    name: text(r.Name) ?? r.Id,
    objektart: text(r.Real_Estate_Type__c),
    strasse: strasse || text(r.Address__Street__s),
    plz: text(r.ZIP_Code__c) ?? text(r.Address__PostalCode__s),
    ort: text(r.City__c) ?? text(r.Address__City__s),
    baujahr: zahl(r.Construction_Year__c),
    wohnflaeche_m2: zahl(r.Wohnfl_che__c),
    gewerbeflaeche_m2: zahl(r.Gewerbefl_che__c),
    mietflaeche_m2: zahl(r.Renable_Area__c) ?? zahl(r.Gesamtmietfl_che_oberidisch__c),
    grundstuecksflaeche_m2: zahl(r.Property_area__c),
    einheiten: zahl(r.Anzahl_Wohnungen__c),
    jahresnettokaltmiete: betrag(r.Rental_income__c),
    energieausweis: text(r.Energy_certificate__c),
    heizungsart: text(r.Type_of_heating__c),
    geo_lat: zahl(r.Address__Latitude__s),
    geo_lng: zahl(r.Address__Longitude__s),
    eigentuemer_kontakt_sf_id: text(r.Real_Estate_Owner__c),
    eigentuemer_account_sf_id: text(r.Real_Estate_Owner_Account__c),
    owner_sf_user_id: text(r.OwnerId),
  };
}

export function mappeAnkaufsprofil(r: SfRoh): Zeile {
  return {
    ...basis(r),
    name: text(r.Name),
    kontakt_sf_id: text(r.Hauptansprechpartner_Kontakt__c),
    account_sf_id: text(r.Account__c),
    aktiv: null,
    assetklassen: liste(r.Objektklassen__c),
    nutzungsarten: liste(r.Nutzungsarten__c),
    regionen: regionenAusProfil(r),
    // Felder heißen „_Mio“, die Werte stehen aber in Euro (geprüft 24.10.2026).
    volumen_min: betrag(r.Objektvolumen_Min_Mio__c),
    volumen_max: betrag(r.Objektvolumen_Max_Mio__c),
    faktor_max: betrag(r.Multiplikator_bis_fach__c),
    einheiten_min: betrag(r.AnzahlEinheitenMin__c),
    baujahr_ab: betrag(r.BaujahrAb__c),
    baujahr_bis: betrag(r.BaujahrBis__c),
    investor_typ: text(r.Investor_Type__c),
    owner_sf_user_id: text(r.OwnerId),
  };
}

export function mappeKontakt(r: SfRoh, typ: "Contact" | "Account" | "Lead"): Zeile {
  if (typ === "Account") {
    return {
      ...basis(r),
      sf_typ: typ,
      name: text(r.Name) ?? r.Id,
      firma: text(r.Name),
      account_sf_id: r.Id,
      email: null,
      telefon: text(r.Phone),
      mobil: null,
      ort: text(r.BillingCity),
      owner_sf_user_id: text(r.OwnerId),
    };
  }
  const name = text(r.Name) ?? ([text(r.FirstName), text(r.LastName)].filter(Boolean).join(" ") || r.Id);
  return {
    ...basis(r),
    sf_typ: typ,
    name,
    firma: typ === "Lead" ? text(r.Company) : text(bezug(r, "Account.Name")),
    account_sf_id: typ === "Contact" ? text(r.AccountId) : null,
    email: text(r.Email)?.toLowerCase() ?? null,
    telefon: text(r.Phone),
    mobil: text(r.MobilePhone),
    ort: typ === "Lead" ? text(r.City) : text(r.MailingCity),
    owner_sf_user_id: text(r.OwnerId),
  };
}

/** Kontext für Zuordnungen, die nicht direkt im Datensatz stehen. */
export type MandatsBezug = {
  /** Real Estate Id → Mandat Id */
  mandatJeRealEstate: Map<string, string>;
  /** Opportunity Id → Mandat Id */
  mandatJeDeal: Map<string, string>;
};

export function mandatFuerBezug(id: string | null, bezugKontext: MandatsBezug): string | null {
  if (!id) return null;
  if (id.startsWith("a06")) return id;
  return bezugKontext.mandatJeRealEstate.get(id) ?? bezugKontext.mandatJeDeal.get(id) ?? null;
}

export function mappeKampagne(r: SfRoh, kontext: MandatsBezug): Zeile {
  return {
    ...basis(r),
    name: text(r.Name) ?? r.Id,
    typ: text(r.Type),
    status: text(r.Status),
    mandat_sf_id: mandatFuerBezug(text(r.Real_Estate__c), kontext),
    start_am: datum(r.StartDate),
    ende_am: datum(r.EndDate),
    anzahl_mitglieder: (zahl(r.NumberOfContacts) ?? 0) + (zahl(r.NumberOfLeads) ?? 0),
    anzahl_antworten: zahl(r.NumberOfResponses),
    owner_sf_user_id: text(r.OwnerId),
  };
}

export function mappeKampagnenMitglied(r: SfRoh): Zeile {
  return {
    ...basis(r),
    kampagne_sf_id: text(r.CampaignId),
    kontakt_sf_id: text(r.ContactId) ?? text(r.LeadId),
    status: text(r.Status),
    geantwortet: r.HasResponded === true,
    erstmals_geantwortet_am: datum(r.FirstRespondedDate),
  };
}

export function mappeDeal(r: SfRoh, kontext: MandatsBezug): Zeile {
  return {
    ...basis(r),
    name: text(r.Name) ?? r.Id,
    phase: text(r.StageName),
    betrag: betrag(r.Amount),
    abschluss_am: datum(r.CloseDate),
    record_type: text(bezug(r, "RecordType.DeveloperName")),
    mandat_sf_id: mandatFuerBezug(text(r.Real_Estate__c), kontext),
    account_sf_id: text(r.Interessent_Account__c) ?? text(r.AccountId),
    kontakt_sf_id: text(r.Interessent_Contact__c) ?? text(r.ContactId) ?? text(r.Primary_Contact__c),
    owner_sf_user_id: text(r.OwnerId),
  };
}

export function mappeAktivitaet(
  r: SfRoh,
  typ: "Task" | "Event" | "EmailMessage",
  kontext: MandatsBezug,
): Zeile {
  if (typ === "EmailMessage") {
    const what = text(r.RelatedToId);
    return {
      ...basis(r),
      sf_typ: typ,
      art: "E-Mail",
      betreff: text(r.Subject),
      datum: text(r.MessageDate) ?? text(r.CreatedDate),
      status: text(r.Status),
      who_sf_id: null,
      what_sf_id: what,
      mandat_sf_id: mandatFuerBezug(what, kontext),
      kampagne_sf_id: what?.startsWith("701") ? what : null,
      owner_sf_user_id: text(r.CreatedById),
    };
  }
  const what = text(r.WhatId);
  const art =
    typ === "Event"
      ? "Termin"
      : (({ Email: "E-Mail", Call: "Anruf", Task: "Aufgabe", ListEmail: "Serien-E-Mail" } as Record<string, string>)[
          String(r.TaskSubtype ?? "")
        ] ?? "Aufgabe");
  return {
    ...basis(r),
    sf_typ: typ,
    art,
    betreff: text(r.Subject),
    datum:
      typ === "Event"
        ? text(r.StartDateTime)
        : (text(r.CompletedDateTime) ?? (text(r.ActivityDate) ? `${datum(r.ActivityDate)}T12:00:00Z` : text(r.CreatedDate))),
    status: typ === "Event" ? null : text(r.Status),
    who_sf_id: text(r.WhoId),
    what_sf_id: what,
    mandat_sf_id: mandatFuerBezug(what, kontext),
    kampagne_sf_id: what?.startsWith("701") ? what : null,
    owner_sf_user_id: text(r.OwnerId),
  };
}
