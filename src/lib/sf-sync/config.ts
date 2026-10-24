/**
 * Abgrenzung der Grenz-Datensätze in der geteilten Salesforce-Org
 * (FRENKEN, TradeAnyMachine und Baumaschinen arbeiten in derselben Org).
 */

function readEnv(name: string): string {
  if (typeof process === "undefined") return "";
  return (process.env[name] ?? "").trim();
}

/** Sebastian Grenz („Head Grenz & Co.“) und „Business Development SG“ (research@grenz-co.de). */
export const GRENZ_SF_USER_IDS_STANDARD = ["005J5000001Uue4IAC", "005Jy00000CzIcDIAV"];

/** Sebastians Salesforce-User, Owner für Tasks aus dem Postfach-Sync. */
export const SEBASTIAN_SF_USER_ID = "005J5000001Uue4IAC";

/** Grenz-User aus `SF_GRENZ_USER_IDS` (kommagetrennt), sonst die bekannten zwei. */
export function grenzSfUserIds(): string[] {
  const env = readEnv("SF_GRENZ_USER_IDS");
  const ids = env
    ? env.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
    : GRENZ_SF_USER_IDS_STANDARD;
  return [...new Set(ids)];
}

/** Record Type der Grenz-Deals. */
export const GRENZ_DEAL_RECORD_TYPE = "Real_Estate_Broker";

/** Salesforce-Objekte, die der Sync abruft (Reihenfolge = Abrufreihenfolge). */
export const SF_SYNC_OBJEKTE = [
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
] as const;

export type SfSyncObjekt = (typeof SF_SYNC_OBJEKTE)[number];
