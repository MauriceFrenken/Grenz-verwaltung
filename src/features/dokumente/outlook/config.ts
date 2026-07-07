export const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite",
] as const;

export const OUTLOOK_STORAGE_KEY = "frenken:outlook-tokens";
export const OUTLOOK_PKCE_KEY = "frenken:outlook-pkce";
export const OUTLOOK_OAUTH_STATE_KEY = "frenken:outlook-oauth-state";
export const OUTLOOK_CONNECTED_EVENT = "frenken:outlook-connected";
export const OUTLOOK_LAST_ERROR_KEY = "frenken:outlook-last-error";
export const OUTLOOK_OAUTH_CONTEXT_KEY = "frenken:outlook-oauth-context";

export type OutlookOAuthContext = {
  returnTo?: string;
};

/** Nur E-Mails ab diesem Datum laden (ISO 8601). */
export const OUTLOOK_MESSAGES_SINCE = "2026-06-24T00:00:00Z";

export function getMicrosoftClientId(): string | null {
  const id = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim();
  return id || null;
}

export function getMicrosoftTenantId(): string {
  return import.meta.env.VITE_MICROSOFT_TENANT_ID?.trim() || "common";
}

export function getOutlookRedirectUri(): string {
  const configured = import.meta.env.VITE_MICROSOFT_REDIRECT_URI?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/integrationen/outlook/callback`;
  }
  return "http://localhost:8080/integrationen/outlook/callback";
}

export function isOutlookConfigured(): boolean {
  return Boolean(getMicrosoftClientId());
}

export function getMicrosoftAuthorizeUrl(params: {
  clientId: string;
  tenantId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    response_type: "code",
    redirect_uri: params.redirectUri,
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });

  return `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/authorize?${query}`;
}
