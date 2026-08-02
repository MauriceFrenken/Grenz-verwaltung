const API_VERSION = "v61.0";

export const salesforceDataApiPath = () => `/services/data/${API_VERSION}`;

export type SfQueryResponse<T> = {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
};

export function soqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

type SfError = { message?: string; errorCode?: string; fields?: string[] };

/**
 * Salesforce liefert Fehler als Array. Ohne errorCode und Feldnamen ist
 * z. B. ein Picklist- oder Berechtigungsproblem im UI nicht auffindbar.
 */
export function salesforceErrorText(
  data: unknown,
  status: number,
  rawText?: string,
): string {
  const standard = `Salesforce API-Fehler (${status})`;
  const errors = Array.isArray(data) ? (data as SfError[]) : null;

  if (errors?.length) {
    const text = errors
      .map((e) => {
        const felder = e.fields?.length ? ` [${e.fields.join(", ")}]` : "";
        const code = e.errorCode ? ` (${e.errorCode})` : "";
        return `${e.message ?? "Unbekannter Fehler"}${felder}${code}`;
      })
      .join("; ");
    if (text) return text;
  }

  const roh = rawText?.trim().slice(0, 200);
  return roh ? `${standard}: ${roh}` : standard;
}

export async function salesforceQueryAll<T>(
  accessToken: string,
  instanceUrl: string,
  soql: string,
): Promise<T[]> {
  const base = instanceUrl.replace(/\/$/, "");
  const api = `${base}${salesforceDataApiPath()}`;
  const firstUrl = `${api}/query?q=${encodeURIComponent(soql)}`;

  const records: T[] = [];
  let url: string | null = firstUrl;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json().catch(() => null)) as
      SfQueryResponse<T> | { message?: string; errorCode?: string }[] | null;

    if (!res.ok) {
      throw new Error(salesforceErrorText(data, res.status));
    }

    const page = data as SfQueryResponse<T>;
    records.push(...(page.records ?? []));
    url =
      page.done || !page.nextRecordsUrl
        ? null
        : page.nextRecordsUrl.startsWith("http")
          ? page.nextRecordsUrl
          : `${base}${page.nextRecordsUrl}`;
  }

  return records;
}

export async function salesforceRestJson<T>(
  accessToken: string,
  instanceUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = instanceUrl.replace(/\/$/, "");
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });

  // 204 / leerer Body (typisch für erfolgreiches PATCH)
  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: T | { message?: string; errorCode?: string }[] | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T | { message?: string; errorCode?: string }[];
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new Error(salesforceErrorText(data, res.status, text));
  }

  if (data == null) {
    return undefined as T;
  }

  return data as T;
}
