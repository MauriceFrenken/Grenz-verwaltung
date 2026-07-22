import {
  salesforceSessionLesen,
  salesforceSessionLoeschen,
  type SalesforceSession,
} from "./config";

export type SalesforceUserInfo = {
  userId: string;
  organizationId: string;
  preferredUsername: string;
  displayName: string;
  email: string | null;
};

const API_VERSION = "v61.0";

function requireSession(): SalesforceSession {
  const session = salesforceSessionLesen();
  if (!session?.accessToken || !session.instanceUrl) {
    throw new Error("Nicht mit Salesforce verbunden. Bitte zuerst anmelden.");
  }
  return session;
}

/**
 * Authentifizierter Salesforce REST-Call mit der aktuellen Browser-Session.
 * Hinweis: Die Salesforce-Org muss die App-Origin unter Setup → CORS freigeben,
 * sonst schlagen Browser-Calls fehl (Token-Austausch läuft serverseitig).
 */
export async function salesforceApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const session = requireSession();
  const base = session.instanceUrl.replace(/\/$/, "");
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    salesforceSessionLoeschen();
    throw new Error("Salesforce-Sitzung abgelaufen. Bitte erneut verbinden.");
  }

  return res;
}

export async function salesforceApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await salesforceApiFetch(path, init);
  const data = (await res.json().catch(() => null)) as
    | T
    | { message?: string; error?: string; errorCode?: string }[]
    | { error?: string; error_description?: string }
    | null;

  if (!res.ok) {
    let message = `Salesforce API-Fehler (${res.status})`;
    if (Array.isArray(data) && data[0] && "message" in data[0] && data[0].message) {
      message = data[0].message;
    } else if (
      data &&
      !Array.isArray(data) &&
      "error_description" in data &&
      data.error_description
    ) {
      message = data.error_description;
    } else if (data && !Array.isArray(data) && "error" in data && typeof data.error === "string") {
      message = data.error;
    }
    throw new Error(message);
  }

  return data as T;
}

/** Prüft die Verbindung (serverseitig, ohne Salesforce-CORS). */
export async function salesforceUserInfo(
  sessionOverride?: SalesforceSession | null,
): Promise<SalesforceUserInfo> {
  const session = sessionOverride ?? requireSession();
  if (!session?.accessToken || !session.instanceUrl) {
    throw new Error("Nicht mit Salesforce verbunden. Bitte zuerst anmelden.");
  }

  const { fetchSalesforceUserInfoFn } = await import("./userinfo-fn");
  return fetchSalesforceUserInfoFn({
    data: {
      accessToken: session.accessToken,
      instanceUrl: session.instanceUrl,
    },
  });
}

/** Session um Userinfo anreichern (API-Smoke-Test nach OAuth). */
export async function enrichSalesforceSession(
  session: SalesforceSession,
): Promise<SalesforceSession> {
  try {
    const info = await salesforceUserInfo(session);
    return {
      ...session,
      displayName: info.displayName,
      preferredUsername: info.preferredUsername,
    };
  } catch {
    return session;
  }
}

/** REST-Basispfad der aktuellen Org (inkl. API-Version). */
export function salesforceDataApiBase(): string {
  return `/services/data/${API_VERSION}`;
}
