export const MICROSOFT_INTEGRATION_ID = "microsoft365";

/** Festes App-Konto — die Verbindung gilt für alle Nutzer. */
export const MICROSOFT_DEFAULT_MAILBOX = "ankauf@frenken-immobilien.com";

export const MICROSOFT_PRODUCTION_ORIGIN = "https://frenken-expose-ai.vercel.app";
export const MICROSOFT_OAUTH_CALLBACK_URL = `${MICROSOFT_PRODUCTION_ORIGIN}/microsoft/callback`;

export const MICROSOFT_OAUTH_MESSAGE = "frenken.microsoft.oauth";
export const MICROSOFT_PKCE_STORAGE_PREFIX = "frenken.microsoft.pkce.";

/**
 * Delegierte Graph-Rechte für das Ankauf-Postfach und Excel (OneDrive/SharePoint
 * dieses Kontos). offline_access liefert den Refresh Token für die App-Ebene.
 */
export const MICROSOFT_OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Files.ReadWrite",
  "Sites.ReadWrite.All",
].join(" ");

export function microsoftEnvClientId(): string {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: { VITE_MICROSOFT_CLIENT_ID?: string } }).env
        ?.VITE_MICROSOFT_CLIENT_ID) ||
    ""
  ).trim();
}

export function microsoftEnvTenantId(): string {
  const fromVite =
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: { VITE_MICROSOFT_TENANT_ID?: string } }).env
        ?.VITE_MICROSOFT_TENANT_ID) ||
    "";
  return fromVite.trim() || "organizations";
}

export function microsoftCallbackPath(): string {
  return "/microsoft/callback";
}

export function microsoftCallbackUrl(): string {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return `${origin}${microsoftCallbackPath()}`;
    }
  }
  return MICROSOFT_OAUTH_CALLBACK_URL;
}

export function microsoftAuthorizeUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string,
  loginHint: string,
): string {
  const clientId = microsoftEnvClientId();
  if (!clientId) {
    throw new Error(
      "VITE_MICROSOFT_CLIENT_ID fehlt. Bitte die Entra-App-ID in .env.local und auf Vercel setzen.",
    );
  }

  const tenant = microsoftEnvTenantId();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_OAUTH_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    login_hint: loginHint,
    domain_hint: "organizations",
  });

  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`;
}
