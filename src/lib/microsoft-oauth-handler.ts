import {
  exchangeAuthorizationCode,
  getMicrosoftOAuthConfig,
  refreshAccessToken,
  resolveMicrosoftTenantId,
  tokenPayload,
} from "./microsoft-oauth";

export type MicrosoftOAuthApiResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
};

export async function handleMicrosoftOAuthRequest(
  body: Record<string, unknown>,
): Promise<MicrosoftOAuthApiResponse> {
  const tenantId = resolveMicrosoftTenantId(
    typeof body.tenantId === "string" ? body.tenantId : undefined,
  );

  const config = getMicrosoftOAuthConfig(tenantId);
  if (!config) {
    throw new Error(
      "Microsoft OAuth ist nicht konfiguriert. Setze VITE_MICROSOFT_CLIENT_ID und MICROSOFT_CLIENT_SECRET in .env.local und starte den Dev-Server neu.",
    );
  }

  const action = typeof body.action === "string" ? body.action : "exchange";

  if (action === "refresh") {
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
    if (!refreshToken) {
      throw new Error("refreshToken is required");
    }
    const token = await refreshAccessToken({ config, refreshToken });
    return tokenPayload(token);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const codeVerifier = typeof body.codeVerifier === "string" ? body.codeVerifier.trim() : "";
  const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";

  if (!code || !codeVerifier || !redirectUri) {
    throw new Error("code, codeVerifier and redirectUri are required");
  }

  const token = await exchangeAuthorizationCode({ config, code, redirectUri, codeVerifier });
  return tokenPayload(token);
}
