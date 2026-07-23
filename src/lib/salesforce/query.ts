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
    let message = `Salesforce API-Fehler (${res.status})`;
    if (Array.isArray(data) && data[0]?.message) message = data[0].message;
    throw new Error(message);
  }

  if (data == null) {
    return undefined as T;
  }

  return data as T;
}
