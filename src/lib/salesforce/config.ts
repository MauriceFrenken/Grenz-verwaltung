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

export const SALESFORCE_PRODUCTION_ORIGIN = "https://frenken-expose-ai.vercel.app";

export const SALESFORCE_OAUTH_SCOPES = "api refresh_token id";
export const SALESFORCE_OAUTH_MESSAGE = "frenken.salesforce.oauth";
export const SALESFORCE_PKCE_STORAGE_PREFIX = "frenken.salesforce.pkce.";

const STORAGE_KEY = "frenken.salesforce.session";

export type SalesforceSession = {
  accessToken: string;
  refreshToken: string | null;
  instanceUrl: string;
  gespeichertAm: string;
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

export function salesforceAuthorizeUrl(state: string, codeChallenge: string, redirectUri: string): string {
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
    prompt: "login",
  });

  return `${SALESFORCE_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`;
}

export function salesforceSessionLesen(): SalesforceSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SalesforceSession;
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function salesforceSessionSpeichern(
  session: Omit<SalesforceSession, "gespeichertAm"> & { gespeichertAm?: string },
): SalesforceSession {
  const neu: SalesforceSession = {
    accessToken: session.accessToken.trim(),
    refreshToken: session.refreshToken?.trim() || null,
    instanceUrl: (session.instanceUrl || SALESFORCE_LOGIN_URL).replace(/\/$/, ""),
    gespeichertAm: session.gespeichertAm ?? new Date().toISOString(),
    displayName: session.displayName?.trim() || null,
    preferredUsername: session.preferredUsername?.trim() || null,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(neu));
  return neu;
}

export function salesforceSessionLoeschen(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function istSalesforceVerbunden(): boolean {
  return Boolean(salesforceSessionLesen()?.accessToken);
}
