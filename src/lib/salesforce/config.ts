/** Bevorzugte UI-Domain (Lightning). */
export const SALESFORCE_LIGHTNING_HOST = "scrmfh25.lightning.force.com";
export const SALESFORCE_LIGHTNING_URL = `https://${SALESFORCE_LIGHTNING_HOST}`;

/** My Domain — OAuth authorize + token endpoint. */
export const SALESFORCE_MY_DOMAIN = "scrmfh25.my.salesforce.com";
export const SALESFORCE_LOGIN_URL = `https://${SALESFORCE_MY_DOMAIN}`;

export const SALESFORCE_PREFERRED_URL = SALESFORCE_LIGHTNING_URL;

/**
 * Feste OAuth-Callback-URL (Vercel Produktion).
 * Diese URL dem Salesforce-Admin als einzige Callback URL senden.
 */
export const SALESFORCE_OAUTH_CALLBACK_URL =
  "https://frenken-expose-ai.vercel.app/salesforce/callback";

export const SALESFORCE_PRODUCTION_ORIGIN =
  "https://frenken-expose-ai.vercel.app";

export const SALESFORCE_OAUTH_SCOPES = "api refresh_token id";
export const SALESFORCE_OAUTH_MESSAGE = "frenken.salesforce.oauth";
export const SALESFORCE_PKCE_STORAGE_PREFIX = "frenken.salesforce.pkce.";

const STORAGE_KEY = "frenken.salesforce.session";
const SESSION_CHANGED_EVENT = "frenken.salesforce.session-changed";

/**
 * Access Tokens laufen je nach Org-Policy nach ~2 h ab. Ist der Token älter,
 * wird er vor einem Salesforce-Aufruf vorsorglich per Refresh Token erneuert.
 */
export const SALESFORCE_TOKEN_MAX_ALTER_MS = 45 * 60 * 1000;

export type SalesforceSession = {
  accessToken: string;
  refreshToken: string | null;
  instanceUrl: string;
  /** Erste erfolgreiche Verbindung. */
  gespeichertAm: string;
  /** Letzte Ausstellung des Access Tokens (Login oder Refresh). */
  aktualisiertAm: string;
  /** Optional — nach Connect via /services/oauth2/userinfo. */
  displayName?: string | null;
  preferredUsername?: string | null;
};

function envClientId(): string {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: { VITE_SALESFORCE_CLIENT_ID?: string } }).env
        ?.VITE_SALESFORCE_CLIENT_ID) ||
    ""
  ).trim();
}

export function salesforceClientId(): string {
  return envClientId();
}

export function salesforceCallbackPath(): string {
  return "/salesforce/callback";
}

/**
 * Redirect-URI für OAuth — immer die Produktions-Callback-URL,
 * damit jeder User auf Vercel sich verbinden kann.
 * Lokal (localhost) bleibt die lokale Callback-Route für Dev.
 */
export function salesforceCallbackUrl(): string {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return `${origin}${salesforceCallbackPath()}`;
    }
  }
  return SALESFORCE_OAUTH_CALLBACK_URL;
}

/** An den Salesforce-Admin: diese Callback URL eintragen. */
export function salesforceAdminCallbackUrl(): string {
  return SALESFORCE_OAUTH_CALLBACK_URL;
}

export function salesforceAuthorizeUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string,
): string {
  const clientId = salesforceClientId();
  if (!clientId) {
    throw new Error(
      "VITE_SALESFORCE_CLIENT_ID fehlt. Consumer Key der Connected App setzen (von Salesforce-Admin).",
    );
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SALESFORCE_OAUTH_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${SALESFORCE_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`;
}

function parseSession(raw: string | null): SalesforceSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SalesforceSession>;
    if (!parsed?.accessToken || !parsed.instanceUrl) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken ?? null,
      instanceUrl: parsed.instanceUrl,
      gespeichertAm: parsed.gespeichertAm ?? new Date().toISOString(),
      aktualisiertAm:
        parsed.aktualisiertAm ??
        parsed.gespeichertAm ??
        new Date().toISOString(),
      displayName: parsed.displayName ?? null,
      preferredUsername: parsed.preferredUsername ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Liest die Verbindung aus localStorage — bleibt über Tabs und Neustarts
 * erhalten. Ältere Versionen lagen in sessionStorage; die werden einmalig
 * übernommen.
 */
export function salesforceSessionLesen(): SalesforceSession | null {
  if (typeof window === "undefined") return null;

  const aktuell = parseSession(localStorage.getItem(STORAGE_KEY));
  if (aktuell) return aktuell;

  const migriert = parseSession(sessionStorage.getItem(STORAGE_KEY));
  if (migriert) {
    sessionStorage.removeItem(STORAGE_KEY);
    return salesforceSessionSpeichern(migriert);
  }

  return null;
}

function sessionAenderungMelden(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function salesforceSessionSpeichern(
  session: Omit<SalesforceSession, "gespeichertAm" | "aktualisiertAm"> & {
    gespeichertAm?: string;
    aktualisiertAm?: string;
  },
): SalesforceSession {
  const jetzt = new Date().toISOString();
  const neu: SalesforceSession = {
    accessToken: session.accessToken.trim(),
    refreshToken: session.refreshToken?.trim() || null,
    instanceUrl: (session.instanceUrl || SALESFORCE_LOGIN_URL).replace(
      /\/$/,
      "",
    ),
    gespeichertAm: session.gespeichertAm ?? jetzt,
    aktualisiertAm: session.aktualisiertAm ?? jetzt,
    displayName: session.displayName?.trim() || null,
    preferredUsername: session.preferredUsername?.trim() || null,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(neu));
  sessionAenderungMelden();
  return neu;
}

/**
 * Übernimmt einen frisch ausgestellten Access Token in die bestehende
 * Verbindung (z. B. nach einem serverseitigen Refresh).
 */
export function salesforceSessionAktualisieren(tokens: {
  accessToken: string;
  instanceUrl?: string | null;
  refreshToken?: string | null;
}): SalesforceSession | null {
  const vorhanden = salesforceSessionLesen();
  if (!vorhanden) return null;
  if (!tokens.accessToken?.trim()) return vorhanden;
  if (tokens.accessToken.trim() === vorhanden.accessToken) return vorhanden;

  return salesforceSessionSpeichern({
    ...vorhanden,
    accessToken: tokens.accessToken,
    instanceUrl: tokens.instanceUrl?.trim() || vorhanden.instanceUrl,
    refreshToken: tokens.refreshToken?.trim() || vorhanden.refreshToken,
    aktualisiertAm: new Date().toISOString(),
  });
}

export function salesforceSessionLoeschen(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  sessionAenderungMelden();
}

export function istSalesforceVerbunden(): boolean {
  return Boolean(salesforceSessionLesen()?.accessToken);
}

/** Access Token ist alt genug, dass er vorsorglich erneuert werden sollte. */
export function salesforceTokenIstAlt(session: SalesforceSession): boolean {
  const alter = Date.now() - new Date(session.aktualisiertAm).getTime();
  return !Number.isFinite(alter) || alter > SALESFORCE_TOKEN_MAX_ALTER_MS;
}

/** Benachrichtigt über Connect/Disconnect — auch aus anderen Tabs. */
export function salesforceSessionAbonnieren(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };

  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** OAuth-Session für serverseitige Salesforce-Aufrufe (Export, Objektsuche). */
export type SalesforceSessionHint = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
};

export function salesforceSessionHint(): SalesforceSessionHint {
  const session = salesforceSessionLesen();
  if (!session) return {};
  return {
    accessToken: session.accessToken,
    instanceUrl: session.instanceUrl,
    refreshToken: session.refreshToken ?? undefined,
  };
}
