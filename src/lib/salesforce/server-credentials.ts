/**
 * Server-only Salesforce credentials.
 *
 * Primär: Browser-OAuth-Session (vom Client übergeben).
 * Fallback: SALESFORCE_ACCESS_TOKEN / SALESFORCE_REFRESH_TOKEN in der Env (Dev/Admin).
 */

import { refreshSalesforceAccessToken } from "./token-exchange";

export type SalesforceCredentials = {
  accessToken: string;
  instanceUrl: string;
  source: "env" | "session";
};

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
  return (readEnv("SALESFORCE_LOGIN_URL") || "https://scrmfh25.my.salesforce.com").replace(
    /\/$/,
    "",
  );
}

export async function resolveSalesforceCredentials(session?: {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
} | null): Promise<SalesforceCredentials> {
  const envInstance = defaultInstanceUrl();

  // 1) Browser-OAuth-Session (vom Client übergeben)
  const sessionToken = session?.accessToken?.trim() ?? "";
  const sessionInstance = session?.instanceUrl?.trim().replace(/\/$/, "") ?? "";
  if (sessionToken && sessionInstance) {
    return {
      accessToken: sessionToken,
      instanceUrl: sessionInstance,
      source: "session",
    };
  }

  const sessionRefresh = session?.refreshToken?.trim() ?? "";
  if (sessionRefresh) {
    const refreshed = await refreshSalesforceAccessToken(sessionRefresh);
    return {
      accessToken: refreshed.accessToken,
      instanceUrl:
        refreshed.instanceUrl || session?.instanceUrl?.trim().replace(/\/$/, "") || envInstance,
      source: "session",
    };
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
    if (envCredsCache && envCredsCache.expiresAt > now) {
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

  throw new Error(
    "Kein Salesforce-Zugang. Bitte zuerst über „Mit Salesforce verbinden“ anmelden.",
  );
}

export function clearSalesforceCredentialsCache(): void {
  envCredsCache = null;
}
