/** REST-Zugriff des Syncs (Server-Zugang, kein Browser-Token). */

import { salesforceDataApiPath, salesforceErrorText, type SfQueryResponse } from "@/lib/salesforce/query";

import { sfServerZugang, sfZugangCacheLeeren, type SfServerZugang } from "./jwt";

export type SfRoh = Record<string, unknown> & { Id: string; attributes?: { type?: string } };

async function mitZugang<T>(lauf: (z: SfServerZugang) => Promise<T>): Promise<T> {
  const zugang = await sfServerZugang();
  try {
    return await lauf(zugang);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/INVALID_SESSION|Session expired|\b401\b/i.test(msg)) throw err;
    sfZugangCacheLeeren();
    return lauf(await sfServerZugang({ erneuern: true }));
  }
}

/**
 * SOQL mit allen Seiten. `geloeschte: true` nutzt queryAll, damit
 * gelöschte Datensätze (IsDeleted) mitkommen.
 */
export async function sfAbfrage<T extends SfRoh = SfRoh>(
  soql: string,
  optionen: { geloeschte?: boolean } = {},
): Promise<T[]> {
  return mitZugang(async ({ accessToken, instanceUrl }) => {
    const endpunkt = optionen.geloeschte ? "queryAll" : "query";
    let url: string | null = `${instanceUrl}${salesforceDataApiPath()}/${endpunkt}?q=${encodeURIComponent(soql)}`;
    const records: T[] = [];
    while (url) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as SfQueryResponse<T>) : null;
      if (!res.ok || !data) throw new Error(salesforceErrorText(data, res.status, text));
      records.push(...(data.records ?? []));
      url = data.done || !data.nextRecordsUrl ? null : `${instanceUrl}${data.nextRecordsUrl}`;
    }
    return records;
  });
}

/** Einzelner REST-Aufruf (create/update). Kein automatischer Retry bei Schreibvorgängen. */
export async function sfRest<T>(pfad: string, init: RequestInit = {}): Promise<T> {
  const { accessToken, instanceUrl } = await sfServerZugang();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${instanceUrl}${salesforceDataApiPath()}${pfad}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(salesforceErrorText(data, res.status, text));
  return data as T;
}

/** SOQL-Datetime-Literal (ohne Anführungszeichen). */
export function soqlDatum(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** `Id IN (...)`-Listen in Häppchen, damit die SOQL-Länge im Rahmen bleibt. */
export function inHaeppchen<T>(liste: T[], groesse = 200): T[][] {
  const teile: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) teile.push(liste.slice(i, i + groesse));
  return teile;
}

export function soqlIdListe(ids: string[]): string {
  return ids.map((id) => `'${id.replace(/[^A-Za-z0-9]/g, "")}'`).join(",");
}
