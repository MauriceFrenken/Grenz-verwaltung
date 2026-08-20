import { MICROSOFT_APP_SCOPE, MICROSOFT_DEFAULT_MAILBOX } from "./config";

export type MicrosoftTokenSet = {
  accessToken: string;
  /** App-only hat keinen Refresh Token — immer null. */
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
  tenantId: string | null;
};

function readEnv(name: string): string {
  if (typeof process === "undefined") return "";
  return (process.env[name] ?? "").trim();
}

export function microsoftServerClientId(): string {
  return readEnv("MICROSOFT_CLIENT_ID") || readEnv("VITE_MICROSOFT_CLIENT_ID");
}

export function microsoftServerClientSecret(): string {
  return readEnv("MICROSOFT_CLIENT_SECRET");
}

export function microsoftServerTenantId(): string {
  return readEnv("MICROSOFT_TENANT_ID") || readEnv("VITE_MICROSOFT_TENANT_ID") || "organizations";
}

/** Einziges Postfach, das die App auslesen darf (muss zur Access Policy passen). */
export function microsoftPostfach(): string {
  return (readEnv("MICROSOFT_MAILBOX") || MICROSOFT_DEFAULT_MAILBOX).trim().toLowerCase();
}

export function microsoftAzureIstKonfiguriert(): boolean {
  return Boolean(
    microsoftServerClientId() &&
      microsoftServerClientSecret() &&
      microsoftServerTenantId() &&
      microsoftServerTenantId() !== "organizations",
  );
}

function tokenUrl(): string {
  const tenant = microsoftServerTenantId();
  if (!tenant || tenant === "organizations" || tenant === "common") {
    throw new Error(
      "MICROSOFT_TENANT_ID muss die konkrete Tenant-GUID sein (App-only funktioniert nicht mit „organizations“).",
    );
  }
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
}

type TokenJson = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

/**
 * App-only Token (Client Credentials). Kein User-Login, kein Refresh Token —
 * bei Ablauf erneut mit Client-ID + Secret holen.
 */
export async function acquireMicrosoftAppToken(): Promise<MicrosoftTokenSet> {
  const clientId = microsoftServerClientId();
  const clientSecret = microsoftServerClientSecret();
  if (!clientId) {
    throw new Error("MICROSOFT_CLIENT_ID / VITE_MICROSOFT_CLIENT_ID ist nicht gesetzt.");
  }
  if (!clientSecret) {
    throw new Error("MICROSOFT_CLIENT_SECRET ist nicht gesetzt (Entra Client Secret).");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: MICROSOFT_APP_SCOPE,
  });

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as TokenJson;
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `Microsoft App-Token fehlgeschlagen (HTTP ${res.status}). In Entra Application-Permission „Mail.ReadWrite“ + Admin Consent prüfen.`,
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: null,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 3600,
    scope: data.scope || MICROSOFT_APP_SCOPE,
    tenantId: microsoftServerTenantId(),
  };
}
