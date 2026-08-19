import { MICROSOFT_DEFAULT_MAILBOX, MICROSOFT_OAUTH_SCOPES } from "./config";

export type MicrosoftTokenExchangeInput = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export type MicrosoftTokenSet = {
  accessToken: string;
  refreshToken: string;
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

export function microsoftErwartetesKonto(): string {
  return (readEnv("MICROSOFT_MAILBOX") || MICROSOFT_DEFAULT_MAILBOX).trim().toLowerCase();
}

export function microsoftAzureIstKonfiguriert(): boolean {
  return Boolean(microsoftServerClientId() && microsoftServerClientSecret());
}

function tokenUrl(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(microsoftServerTenantId())}/oauth2/v2.0/token`;
}

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function parseTokenJson(data: TokenJson, fallbackRefresh?: string): MicrosoftTokenSet {
  if (!data.access_token) {
    const detail = data.error_description || data.error || "Kein Access Token";
    throw new Error(`Microsoft Token-Antwort unvollständig: ${detail}`);
  }
  const refresh = data.refresh_token?.trim() || fallbackRefresh?.trim() || "";
  if (!refresh) {
    throw new Error(
      "Microsoft hat keinen Refresh Token geliefert. In der Entra-App „offline_access“ prüfen und erneut verbinden.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: refresh,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 3600,
    scope: data.scope || MICROSOFT_OAUTH_SCOPES,
    tenantId: null,
  };
}

export async function exchangeMicrosoftAuthorizationCode(
  input: MicrosoftTokenExchangeInput,
): Promise<MicrosoftTokenSet> {
  const clientId = microsoftServerClientId();
  const clientSecret = microsoftServerClientSecret();
  if (!clientId) {
    throw new Error("MICROSOFT_CLIENT_ID / VITE_MICROSOFT_CLIENT_ID ist nicht gesetzt.");
  }
  if (!clientSecret) {
    throw new Error("MICROSOFT_CLIENT_SECRET ist nicht gesetzt (Entra Client Secret).");
  }
  if (!input.code?.trim() || !input.codeVerifier?.trim() || !input.redirectUri?.trim()) {
    throw new Error("code, codeVerifier und redirectUri sind erforderlich.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code.trim(),
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri.trim(),
    code_verifier: input.codeVerifier.trim(),
    scope: MICROSOFT_OAUTH_SCOPES,
  });

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as TokenJson;
  if (!res.ok) {
    throw new Error(
      data.error_description || data.error || `Microsoft Token-Austausch fehlgeschlagen (HTTP ${res.status})`,
    );
  }
  return parseTokenJson(data);
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<MicrosoftTokenSet> {
  const clientId = microsoftServerClientId();
  const clientSecret = microsoftServerClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft Client-ID oder Secret fehlt.");
  }
  const token = refreshToken?.trim();
  if (!token) throw new Error("refreshToken ist erforderlich.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token,
    client_id: clientId,
    client_secret: clientSecret,
    scope: MICROSOFT_OAUTH_SCOPES,
  });

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as TokenJson;
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || `Microsoft Token-Refresh fehlgeschlagen (HTTP ${res.status})`,
    );
  }
  return parseTokenJson(data, token);
}
