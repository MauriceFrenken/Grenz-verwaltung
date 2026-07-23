import {
  EMPFEHLUNG_MIN_SCORE,
  scoreAddressMatch,
  textMatchesSearch,
} from "./address-match";
import { salesforceQueryAll, soqlEscape } from "./query";

export type SalesforceObjekt = {
  id: string;
  name: string;
  adresse: string;
  streetName: string | null;
  streetNumber: string | null;
  city: string | null;
  zip: string | null;
};

export type SalesforceObjektMatch = SalesforceObjekt & {
  score: number;
  reason: string;
};

type SfObjektRow = {
  Id: string;
  Name: string | null;
  Street_Name__c: string | null;
  Street_Number__c: string | null;
  City__c: string | null;
  ZIP_Code__c: string | null;
};

const OBJEKT_SELECT = [
  "Id",
  "Name",
  "Street_Name__c",
  "Street_Number__c",
  "City__c",
  "ZIP_Code__c",
].join(", ");

export function buildObjektAdresse(row: {
  Name?: string | null;
  Street_Name__c?: string | null;
  Street_Number__c?: string | null;
  City__c?: string | null;
  ZIP_Code__c?: string | null;
}): string {
  const name = row.Name?.trim() ?? "";
  if (name) return name;

  const street = [row.Street_Name__c, row.Street_Number__c]
    .filter(Boolean)
    .join(" ")
    .trim();
  const ort = [row.ZIP_Code__c, row.City__c].filter(Boolean).join(" ").trim();
  return [street, ort].filter(Boolean).join(", ");
}

function mapRow(row: SfObjektRow): SalesforceObjekt {
  return {
    id: row.Id,
    name: row.Name?.trim() || buildObjektAdresse(row) || row.Id,
    adresse: buildObjektAdresse(row),
    streetName: row.Street_Name__c,
    streetNumber: row.Street_Number__c,
    city: row.City__c,
    zip: row.ZIP_Code__c,
  };
}

/** Lädt Real-Estate-Objekte (neueste zuerst). */
export async function fetchAllSalesforceObjekte(
  accessToken: string,
  instanceUrl: string,
): Promise<SalesforceObjekt[]> {
  const soql = `SELECT ${OBJEKT_SELECT} FROM Real_Estate__c ORDER BY LastModifiedDate DESC`;
  const rows = await salesforceQueryAll<SfObjektRow>(accessToken, instanceUrl, soql);
  return rows.map(mapRow);
}

/** Freitextsuche in Real-Estate-Objekten. */
export async function searchSalesforceObjekte(
  accessToken: string,
  instanceUrl: string,
  query: string,
): Promise<SalesforceObjekt[]> {
  const q = query.trim();
  if (!q) {
    return fetchAllSalesforceObjekte(accessToken, instanceUrl);
  }

  const like = soqlEscape(`%${q}%`);
  const soql =
    `SELECT ${OBJEKT_SELECT} FROM Real_Estate__c WHERE (` +
    `Name LIKE '${like}' OR ` +
    `Street_Name__c LIKE '${like}' OR ` +
    `City__c LIKE '${like}' OR ` +
    `ZIP_Code__c LIKE '${like}'` +
    `) ORDER BY LastModifiedDate DESC LIMIT 50`;

  const rows = await salesforceQueryAll<SfObjektRow>(accessToken, instanceUrl, soql);
  return rows.map(mapRow);
}

export function rankObjekteByAdresse(
  objekte: SalesforceObjekt[],
  adresse: string,
): SalesforceObjektMatch[] {
  return objekte
    .map((o) => {
      const { score, reason } = scoreAddressMatch(adresse, o.adresse);
      return { ...o, score, reason };
    })
    .filter((o) => o.score >= EMPFEHLUNG_MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "de"));
}

export function filterObjekteLocal(
  objekte: SalesforceObjekt[],
  query: string,
): SalesforceObjekt[] {
  const q = query.trim();
  if (!q) return objekte;
  return objekte.filter((o) =>
    textMatchesSearch([o.name, o.adresse, o.city, o.zip].filter(Boolean).join(" "), q),
  );
}
