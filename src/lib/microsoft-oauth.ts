const GRAPH_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite",
].join(" ");

export type MicrosoftOAuthConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

export type MicrosoftTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export type MicrosoftOAuthError = {
  error: string;
  error_description?: string;
};

const ALLOWED_TENANT_IDS = new Set(["common", "organizations", "consumers"]);

export function resolveMicrosoftTenantId(override?: string): string {
  const candidate =
    override?.trim() ||
    process.env.VITE_MICROSOFT_TENANT_ID?.trim() ||
    process.env.MICROSOFT_TENANT_ID?.trim() ||
    "common";

  if (ALLOWED_TENANT_IDS.has(candidate)) return candidate;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
    return candidate;
  }

  return "common";
}

export function getMicrosoftOAuthConfig(tenantIdOverride?: string): MicrosoftOAuthConfig | null {
  const clientId =
    process.env.VITE_MICROSOFT_CLIENT_ID?.trim() ?? process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  const tenantId = resolveMicrosoftTenantId(tenantIdOverride);

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, tenantId };
}

function tokenEndpoint(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

async function parseTokenResponse(res: Response): Promise<MicrosoftTokenResponse> {
  const json = (await res.json()) as MicrosoftTokenResponse & MicrosoftOAuthError;
  if (!res.ok) {
    const msg = json.error_description ?? json.error ?? `Token request failed (${res.status})`;
    throw new Error(msg);
  }
  if (!json.access_token) {
    throw new Error("Microsoft token response missing access_token");
  }
  return json;
}

export async function exchangeAuthorizationCode(params: {
  config: MicrosoftOAuthConfig;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<MicrosoftTokenResponse> {
  const body = new URLSearchParams({
    client_id: params.config.clientId,
    client_secret: params.config.clientSecret,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
    scope: GRAPH_SCOPES,
  });

  const res = await fetch(tokenEndpoint(params.config.tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return parseTokenResponse(res);
}

export async function refreshAccessToken(params: {
  config: MicrosoftOAuthConfig;
  refreshToken: string;
}): Promise<MicrosoftTokenResponse> {
  const body = new URLSearchParams({
    client_id: params.config.clientId,
    client_secret: params.config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    scope: GRAPH_SCOPES,
  });

  const res = await fetch(tokenEndpoint(params.config.tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return parseTokenResponse(res);
}

export function tokenPayload(token: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}) {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope ?? "",
  };
}
