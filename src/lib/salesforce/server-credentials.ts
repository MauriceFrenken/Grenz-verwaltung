/**
 * Server-only Salesforce credentials.
 *
 * Primär: Browser-OAuth-Session (vom Client übergeben).
 * Fallback: SALESFORCE_ACCESS_TOKEN / SALESFORCE_REFRESH_TOKEN in der Env (Dev/Admin).
 */

import { salesforceDataApiPath } from "./query";
import { refreshSalesforceAccessToken } from "./token-exchange";

export type SalesforceCredentials = {
  accessToken: string;
  instanceUrl: string;
  source: "env" | "session";
  /**
   * Gesetzt, wenn für diesen Aufruf ein neuer Access Token per Refresh Token
   * geholt wurde. Der Client speichert ihn, damit der nächste Aufruf direkt
   * mit einem gültigen Token startet.
   */
  erneuert?: {
    accessToken: string;
    instanceUrl: string;
    refreshToken: string;
  };
};

export type SalesforceSessionHintInput = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
} | null;

type CachedEnvCreds = {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number;
};

let envCredsCache: CachedEnvCreds | null = null;
const ACCESS_TOKEN_TTL_MS = 90 * 60 * 1000;

function readEnv(name: string): string {
  if (typeof process === "undefined") return "";
  return (process.env[name] ?? "").trim();
}

function defaultInstanceUrl(): string {
  return (
    readEnv("SALESFORCE_LOGIN_URL") || "https://scrmfh25.my.salesforce.com"
  ).replace(/\/$/, "");
}

export const SALESFORCE_NICHT_VERBUNDEN =
  "Nicht mit Salesforce verbunden. Bitte oben über „Mit Salesforce verbinden“ anmelden.";

export async function resolveSalesforceCredentials(
  session?: SalesforceSessionHintInput,
  options?: {
    /** Access Token ignorieren und direkt per Refresh Token erneuern. */
    forceRefresh?: boolean;
  },
): Promise<SalesforceCredentials> {
  const envInstance = defaultInstanceUrl();

  const sessionToken = session?.accessToken?.trim() ?? "";
  const sessionInstance = session?.instanceUrl?.trim().replace(/\/$/, "") ?? "";
  const sessionRefresh = session?.refreshToken?.trim() ?? "";

  // 1) Browser-OAuth-Session (vom Client übergeben)
  if (sessionToken && sessionInstance && !options?.forceRefresh) {
    return {
      accessToken: sessionToken,
      instanceUrl: sessionInstance,
      source: "session",
    };
  }

  if (sessionRefresh) {
    const refreshed = await refreshSalesforceAccessToken(sessionRefresh);
    const instanceUrl = refreshed.instanceUrl || sessionInstance || envInstance;
    return {
      accessToken: refreshed.accessToken,
      instanceUrl,
      source: "session",
      erneuert: {
        accessToken: refreshed.accessToken,
        instanceUrl,
        refreshToken: refreshed.refreshToken ?? sessionRefresh,
      },
    };
  }

  // Access Token abgelaufen und kein Refresh Token: erneuter Login nötig.
  if (sessionToken && options?.forceRefresh) {
    throw new Error(
      "Die Salesforce-Sitzung ist abgelaufen und es liegt kein Refresh Token vor. Bitte erneut mit Salesforce verbinden.",
    );
  }

  // 2) Env Access Token (Dev/Fallback ohne OAuth)
  const envToken = readEnv("SALESFORCE_ACCESS_TOKEN");
  if (envToken) {
    return {
      accessToken: envToken,
      instanceUrl: envInstance,
      source: "env",
    };
  }

  // 3) Env Refresh Token (nur wenn Admin das erlaubt)
  const envRefresh = readEnv("SALESFORCE_REFRESH_TOKEN");
  if (envRefresh) {
    const now = Date.now();
    if (
      envCredsCache &&
      envCredsCache.expiresAt > now &&
      !options?.forceRefresh
    ) {
      return {
        accessToken: envCredsCache.accessToken,
        instanceUrl: envCredsCache.instanceUrl,
        source: "env",
      };
    }
    const refreshed = await refreshSalesforceAccessToken(envRefresh);
    envCredsCache = {
      accessToken: refreshed.accessToken,
      instanceUrl: refreshed.instanceUrl || envInstance,
      expiresAt: now + ACCESS_TOKEN_TTL_MS,
    };
    return {
      accessToken: envCredsCache.accessToken,
      instanceUrl: envCredsCache.instanceUrl,
      source: "env",
    };
  }

  throw new Error(SALESFORCE_NICHT_VERBUNDEN);
}

export function clearSalesforceCredentialsCache(): void {
  envCredsCache = null;
}

export function istSalesforceAuthFehler(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /INVALID_SESSION|Session expired|Bad_OAuth_Token|expired access\/refresh token|\b401\b|UNAUTHORIZED/i.test(
    msg,
  );
}

/**
 * Führt einen Salesforce-Aufruf mit den Credentials des Users aus und
 * wiederholt ihn genau einmal mit frisch erneuertem Access Token, falls
 * Salesforce die Session ablehnt. Nur für lesende Aufrufe — ein Retry darf
 * keine Datensätze doppelt anlegen.
 */
export async function mitSalesforceCredentials<T>(
  session: SalesforceSessionHintInput,
  run: (creds: SalesforceCredentials) => Promise<T>,
): Promise<{ ergebnis: T; creds: SalesforceCredentials }> {
  let creds = await resolveSalesforceCredentials(session);

  try {
    return { ergebnis: await run(creds), creds };
  } catch (err) {
    if (!istSalesforceAuthFehler(err)) throw err;

    clearSalesforceCredentialsCache();
    creds = await resolveSalesforceCredentials(session, { forceRefresh: true });
    return { ergebnis: await run(creds), creds };
  }
}

/**
 * Credentials, die nachweislich gültig sind: der Token wird vorab gegen
 * Salesforce geprüft und bei Bedarf erneuert. Für schreibende Aufrufe, bei
 * denen ein Retry mitten in der Sequenz Duplikate erzeugen würde.
 */
export async function resolveVerifiedSalesforceCredentials(
  session: SalesforceSessionHintInput,
): Promise<SalesforceCredentials> {
  const creds = await resolveSalesforceCredentials(session);

  if (await tokenIstGueltig(creds)) return creds;

  clearSalesforceCredentialsCache();
  const erneuert = await resolveSalesforceCredentials(session, {
    forceRefresh: true,
  });

  if (!(await tokenIstGueltig(erneuert))) {
    throw new Error(
      "Salesforce hat den Zugriff abgelehnt. Bitte die Verbindung trennen und erneut mit Salesforce verbinden.",
    );
  }

  return erneuert;
}

async function tokenIstGueltig(creds: SalesforceCredentials): Promise<boolean> {
  try {
    // Ressourcen-Liste der API-Version: braucht eine gültige Session, aber
    // keine besonderen Berechtigungen.
    const res = await fetch(`${creds.instanceUrl}${salesforceDataApiPath()}/`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    return res.status !== 401;
  } catch {
    // Netzwerkfehler sagt nichts über den Token aus — Aufruf normal versuchen.
    return true;
  }
}
