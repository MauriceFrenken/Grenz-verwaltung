/**
 * Zugriff auf die Objektablage der Mandate (OneDrive-Ordner „Grenz & Co (neu)“). Server-only.
 * Die Ablage kann in einem anderen Tenant liegen als Postfach und Dokumentenablage; dann holt
 * die App ein eigenes App-only-Token für MICROSOFT_OBJEKTE_TENANT_ID (Multi-Tenant-App mit
 * Admin-Consent und Files.Read.All im Ziel-Tenant).
 *
 * Env:
 * - MICROSOFT_OBJEKTE_ORDNER_URL: Web-Link des Ordners, oder
 * - MICROSOFT_OBJEKTE_USER + MICROSOFT_OBJEKTE_PFAD: OneDrive-Benutzer und Pfad ab Root; ohne
 *   Pfad sucht die App im OneDrive des Benutzers nach dem Ordner MICROSOFT_OBJEKTE_ORDNERNAME
 *   (Standard „Grenz & Co (neu)“)
 * - MICROSOFT_OBJEKTE_TENANT_ID: optional, Standard ist MICROSOFT_TENANT_ID
 */

import { MICROSOFT_APP_SCOPE } from "./config";
import {
  microsoftServerClientId,
  microsoftServerClientSecret,
  microsoftServerTenantId,
} from "./token-exchange";

const GRAPH = "https://graph.microsoft.com/v1.0";

function env(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return (process.env[name] ?? "").trim();
}

export function objektAblageKonfiguriert(): boolean {
  return Boolean(
    env("MICROSOFT_OBJEKTE_ORDNER_URL") || env("MICROSOFT_OBJEKTE_USER"),
  );
}

const tokenCache = new Map<string, { token: string; bis: number }>();

async function appToken(): Promise<string> {
  const tenant =
    env("MICROSOFT_OBJEKTE_TENANT_ID") || microsoftServerTenantId();
  const hit = tokenCache.get(tenant);
  if (hit && hit.bis > Date.now() + 60_000) return hit.token;
  const clientId = microsoftServerClientId();
  const secret = microsoftServerClientSecret();
  if (!clientId || !secret)
    throw new Error("Microsoft-App ist nicht konfiguriert (Client-Id/Secret).");
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: secret,
        scope: MICROSOFT_APP_SCOPE,
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const text = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    throw new Error(
      /AADSTS700016|AADSTS650052|AADSTS7000229|AADSTS500011|not found in the directory/i.test(
        text,
      )
        ? "Die App ist im Microsoft-Konto der Objektablage noch nicht freigegeben (Admin-Consent fehlt)."
        : `Microsoft-Anmeldung für die Objektablage fehlgeschlagen: ${text.split("\n")[0]}`,
    );
  }
  tokenCache.set(tenant, {
    token: json.access_token,
    bis: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

async function graph<T>(pfad: string, token: string): Promise<T> {
  const res = await fetch(
    pfad.startsWith("https://") ? pfad : `${GRAPH}${pfad}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } }).error?.message ??
      `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403)
      throw new Error(
        `Kein Zugriff auf die Objektablage. Die App braucht Files.Read.All mit Admin-Consent im Microsoft-Konto von Grenz & Co. (${msg})`,
      );
    if (res.status === 404)
      throw new Error(
        `Objektablage nicht gefunden. Ordner-Link prüfen. (${msg})`,
      );
    throw new Error(`Microsoft Graph (${res.status}): ${msg}`);
  }
  return json as T;
}

type Roh = {
  id?: string;
  name?: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
  folder?: { childCount?: number };
  parentReference?: { driveId?: string };
};

export type AblageElement = {
  id: string;
  name: string;
  istOrdner: boolean;
  groesse: number;
  geaendertAm: string | null;
  webUrl: string | null;
};

function element(r: Roh): AblageElement | null {
  if (!r.id || !r.name) return null;
  return {
    id: r.id,
    name: r.name,
    istOrdner: r.folder != null,
    groesse: typeof r.size === "number" ? r.size : 0,
    geaendertAm: r.lastModifiedDateTime ?? null,
    webUrl: r.webUrl ?? null,
  };
}

/** Teilen-Id nach Graph-Doku: „u!“ + base64url der URL ohne Padding. */
function teilenId(url: string): string {
  return `u!${Buffer.from(url, "utf8")
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\//g, "_")
    .replace(/\+/g, "-")}`;
}

export type AblageZugang = {
  token: string;
  driveId: string;
  wurzel: AblageElement;
};

let wurzelCache: {
  driveId: string;
  wurzel: AblageElement;
  bis: number;
} | null = null;

function vergleichsName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
}

/** Ordner MICROSOFT_OBJEKTE_ORDNERNAME im OneDrive des Benutzers; flachster Treffer gewinnt. */
async function ordnerSuchen(
  user: string,
  token: string,
  sel: string,
): Promise<Roh> {
  const gesucht = env("MICROSOFT_OBJEKTE_ORDNERNAME") || "Grenz & Co (neu)";
  const ziel = vergleichsName(gesucht);
  const wurzel = await graph<{ value?: Roh[] }>(
    `/users/${user}/drive/root/children?${sel}&$top=200`,
    token,
  );
  const direkt = (wurzel.value ?? []).find(
    (r) => r.folder && r.name && vergleichsName(r.name) === ziel,
  );
  if (direkt) return direkt;
  const suche = await graph<{
    value?: (Roh & { parentReference?: { path?: string } })[];
  }>(
    `/users/${user}/drive/root/search(q='${encodeURIComponent(
      gesucht.replace(/'/g, "''"),
    )}')?${sel}&$top=50`,
    token,
  );
  const treffer = (suche.value ?? [])
    .filter((r) => r.folder && r.name && vergleichsName(r.name) === ziel)
    .sort(
      (a, b) =>
        (a.parentReference?.path ?? "").length -
        (b.parentReference?.path ?? "").length,
    );
  if (!treffer[0])
    throw new Error(
      `Ordner „${gesucht}“ im OneDrive von ${decodeURIComponent(user)} nicht gefunden.`,
    );
  return treffer[0];
}

/** Token plus Drive und Wurzelordner der Objektablage. */
export async function objektAblageZugang(): Promise<AblageZugang> {
  if (!objektAblageKonfiguriert())
    throw new Error(
      "Die Objektablage ist noch nicht eingerichtet (MICROSOFT_OBJEKTE_ORDNER_URL).",
    );
  const token = await appToken();
  if (wurzelCache && wurzelCache.bis > Date.now())
    return { token, driveId: wurzelCache.driveId, wurzel: wurzelCache.wurzel };

  const sel =
    "$select=id,name,size,lastModifiedDateTime,webUrl,folder,parentReference";
  const url = env("MICROSOFT_OBJEKTE_ORDNER_URL");
  const user = encodeURIComponent(env("MICROSOFT_OBJEKTE_USER"));
  const pfad = env("MICROSOFT_OBJEKTE_PFAD");
  const roh = url
    ? await graph<Roh>(`/shares/${teilenId(url)}/driveItem?${sel}`, token)
    : pfad
      ? await graph<Roh>(
          `/users/${user}/drive/root:/${pfad
            .split("/")
            .filter(Boolean)
            .map(encodeURIComponent)
            .join("/")}?${sel}`,
          token,
        )
      : await ordnerSuchen(user, token, sel);
  const wurzel = element(roh);
  const driveId = roh.parentReference?.driveId;
  if (!wurzel || !driveId || !wurzel.istOrdner)
    throw new Error("Die Objektablage ist kein Ordner.");
  wurzelCache = { driveId, wurzel, bis: Date.now() + 10 * 60_000 };
  return { token, driveId, wurzel };
}

/** Kinder eines Ordners (alle Seiten). */
export async function ablageKinder(
  z: AblageZugang,
  itemId: string,
): Promise<AblageElement[]> {
  const items: AblageElement[] = [];
  let url: string | null =
    `/drives/${encodeURIComponent(z.driveId)}/items/${encodeURIComponent(itemId)}/children?$select=id,name,size,lastModifiedDateTime,webUrl,folder&$top=200`;
  while (url) {
    const seite: { value?: Roh[]; "@odata.nextLink"?: string } = await graph(
      url,
      z.token,
    );
    for (const r of seite.value ?? []) {
      const e = element(r);
      if (e) items.push(e);
    }
    url = seite["@odata.nextLink"] ?? null;
  }
  return items;
}

/** Ein Element der Ablage (z. B. zum Prüfen einer gespeicherten Verknüpfung). */
export async function ablageElement(
  z: AblageZugang,
  itemId: string,
): Promise<AblageElement> {
  const e = element(
    await graph<Roh>(
      `/drives/${encodeURIComponent(z.driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,size,lastModifiedDateTime,webUrl,folder`,
      z.token,
    ),
  );
  if (!e) throw new Error("Element nicht gefunden.");
  return e;
}

/** Dateiinhalt. */
export async function ablageDateiInhalt(
  z: AblageZugang,
  itemId: string,
): Promise<Uint8Array> {
  const res = await fetch(
    `${GRAPH}/drives/${encodeURIComponent(z.driveId)}/items/${encodeURIComponent(itemId)}/content`,
    { headers: { Authorization: `Bearer ${z.token}` } },
  );
  if (!res.ok)
    throw new Error(`Datei konnte nicht geladen werden (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}
