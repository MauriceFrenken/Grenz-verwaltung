import { formatDetailAdresse, formatObjektName } from "./address-format";
import {
  EMPFEHLUNG_MIN_SCORE,
  scoreAddressMatch,
  textMatchesSearch,
} from "./address-match";

const API_VERSION = "v61.0";
const dataApiBase = () => `/services/data/${API_VERSION}`;

export type SalesforceTransaktion = {
  id: string;
  name: string;
  status: string | null;
  makler: string | null;
  realEstateId: string | null;
  adresse: string;
  streetName: string | null;
  streetNumber: string | null;
  city: string | null;
  zip: string | null;
};

export type SalesforceTransaktionMatch = SalesforceTransaktion & {
  score: number;
  reason: string;
};

type SfQueryResponse<T> = {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
};

type SfTransaktionRow = {
  Id: string;
  Name: string;
  Status__c: string | null;
  Makler__c: string | null;
  Real_Estate__c: string | null;
  Real_Estate__r: {
    Name: string | null;
    Street_Name__c: string | null;
    Street_Number__c: string | null;
    City__c: string | null;
    ZIP_Code__c: string | null;
  } | null;
};

const TRANS_SELECT = [
  "Id",
  "Name",
  "Status__c",
  "Makler__c",
  "Real_Estate__c",
  "Real_Estate__r.Name",
  "Real_Estate__r.Street_Name__c",
  "Real_Estate__r.Street_Number__c",
  "Real_Estate__r.City__c",
  "Real_Estate__r.ZIP_Code__c",
].join(", ");

function soqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildAdresse(row: SfTransaktionRow): string {
  const re = row.Real_Estate__r;
  if (!re) return "";

  const detail = formatDetailAdresse(
    re.Street_Name__c,
    re.Street_Number__c,
    re.ZIP_Code__c,
    re.City__c,
  );
  if (detail) return detail;

  return (
    formatObjektName(re.Street_Name__c, re.Street_Number__c, re.City__c) ||
    re.Name?.trim() ||
    ""
  );
}

function mapRow(row: SfTransaktionRow): SalesforceTransaktion {
  const re = row.Real_Estate__r;
  return {
    id: row.Id,
    name: row.Name,
    status: row.Status__c,
    makler: row.Makler__c,
    realEstateId: row.Real_Estate__c,
    adresse: buildAdresse(row),
    streetName: re?.Street_Name__c ?? null,
    streetNumber: re?.Street_Number__c ?? null,
    city: re?.City__c ?? null,
    zip: re?.ZIP_Code__c ?? null,
  };
}

async function salesforceQueryAll<T>(
  accessToken: string,
  instanceUrl: string,
  soql: string,
): Promise<T[]> {
  const base = instanceUrl.replace(/\/$/, "");
  const api = `${base}${dataApiBase()}`;
  const firstUrl = `${api}/query?q=${encodeURIComponent(soql)}`;

  const records: T[] = [];
  let url: string | null = firstUrl;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json().catch(() => null)) as
      | SfQueryResponse<T>
      | { message?: string; errorCode?: string }[]
      | null;

    if (!res.ok) {
      let message = `Salesforce-Abfrage fehlgeschlagen (${res.status})`;
      if (Array.isArray(data) && data[0]?.message) message = data[0].message;
      throw new Error(message);
    }

    const page = data as SfQueryResponse<T>;
    records.push(...(page.records ?? []));
    url = page.done || !page.nextRecordsUrl
      ? null
      : page.nextRecordsUrl.startsWith("http")
        ? page.nextRecordsUrl
        : `${base}${page.nextRecordsUrl}`;
  }

  return records;
}

/** Lädt alle Transaktionen inkl. Real-Estate-Adresse. */
export async function fetchAllSalesforceTransaktionen(
  accessToken: string,
  instanceUrl: string,
): Promise<SalesforceTransaktion[]> {
  const soql = `SELECT ${TRANS_SELECT} FROM Transaktion__c WHERE Real_Estate__c != null ORDER BY LastModifiedDate DESC`;
  const rows = await salesforceQueryAll<SfTransaktionRow>(
    accessToken,
    instanceUrl,
    soql,
  );
  return rows.map(mapRow);
}

/** Einfache Textsuche in Salesforce (Name / Adresse). */
export async function searchSalesforceTransaktionen(
  accessToken: string,
  instanceUrl: string,
  query: string,
): Promise<SalesforceTransaktion[]> {
  const q = query.trim();
  if (!q) {
    return fetchAllSalesforceTransaktionen(accessToken, instanceUrl);
  }

  const like = soqlEscape(`%${q}%`);
  const soql =
    `SELECT ${TRANS_SELECT} FROM Transaktion__c ` +
    `WHERE Real_Estate__c != null AND (` +
    `Name LIKE '${like}' OR ` +
    `Real_Estate__r.Name LIKE '${like}' OR ` +
    `Real_Estate__r.Street_Name__c LIKE '${like}' OR ` +
    `Makler__c LIKE '${like}'` +
    `) ORDER BY LastModifiedDate DESC LIMIT 50`;

  const rows = await salesforceQueryAll<SfTransaktionRow>(
    accessToken,
    instanceUrl,
    soql,
  );
  return rows.map(mapRow);
}

export function rankTransaktionenByAdresse(
  transactions: SalesforceTransaktion[],
  adresse: string,
): SalesforceTransaktionMatch[] {
  const ranked = transactions
    .map((t) => {
      const { score, reason } = scoreAddressMatch(adresse, t.adresse);
      return { ...t, score, reason };
    })
    .filter((t) => t.score >= EMPFEHLUNG_MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "de"));

  return ranked;
}

export function filterTransaktionenLocal(
  transactions: SalesforceTransaktion[],
  query: string,
): SalesforceTransaktion[] {
  const q = query.trim();
  if (!q) return transactions;
  return transactions.filter((t) =>
    textMatchesSearch(
      [t.name, t.adresse, t.makler, t.status, t.city].filter(Boolean).join(" "),
      q,
    ),
  );
}
