export type SalesforceTokenExchangeInput = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export type SalesforceTokenExchangeResult = {
  accessToken: string;
  refreshToken: string | null;
  instanceUrl: string;
};

function readEnv(name: string): string {
  if (typeof process === "undefined") return "";
  return (process.env[name] ?? "").trim();
}

/** Authorization Code → Access/Refresh Token (Server-only). */
export async function exchangeSalesforceAuthorizationCode(
  input: SalesforceTokenExchangeInput,
): Promise<SalesforceTokenExchangeResult> {
  const clientId = readEnv("SALESFORCE_CLIENT_ID") || readEnv("VITE_SALESFORCE_CLIENT_ID");
  const clientSecret = readEnv("SALESFORCE_CLIENT_SECRET");
  const loginUrl = (
    readEnv("SALESFORCE_LOGIN_URL") || "https://scrmfh25.my.salesforce.com"
  ).replace(/\/$/, "");

  if (!clientId) {
    throw new Error("SALESFORCE_CLIENT_ID / VITE_SALESFORCE_CLIENT_ID ist nicht gesetzt.");
  }
  if (!input.code?.trim() || !input.codeVerifier?.trim() || !input.redirectUri?.trim()) {
    throw new Error("code, codeVerifier und redirectUri sind erforderlich.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code.trim(),
    client_id: clientId,
    redirect_uri: input.redirectUri.trim(),
    code_verifier: input.codeVerifier.trim(),
  });

  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    instance_url?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Salesforce Token-Austausch fehlgeschlagen: ${detail}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    instanceUrl: (data.instance_url || loginUrl).replace(/\/$/, ""),
  };
}
