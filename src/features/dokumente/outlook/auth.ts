import {
  getMicrosoftAuthorizeUrl,
  getMicrosoftClientId,
  getMicrosoftTenantId,
  getOutlookRedirectUri,
  OUTLOOK_CONNECTED_EVENT,
  OUTLOOK_LAST_ERROR_KEY,
  OUTLOOK_OAUTH_CONTEXT_KEY,
  OUTLOOK_OAUTH_STATE_KEY,
  OUTLOOK_PKCE_KEY,
  OUTLOOK_STORAGE_KEY,
  type OutlookOAuthContext,
} from "./config";
import { microsoftOAuthFn } from "./oauth-fn";
import { createPkcePair, generateRandomString } from "./pkce";
import type { OutlookAccount, OutlookProfile, OutlookTokens } from "./types";

const OAUTH_API = "/api/microsoft-oauth";

type PkceSession = {
  verifier: string;
  state: string;
};

type TokenApiResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
};

function readPkceSession(): PkceSession | null {
  const raw =
    sessionStorage.getItem(OUTLOOK_PKCE_KEY) ?? localStorage.getItem(OUTLOOK_PKCE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PkceSession;
  } catch {
    return null;
  }
}

function readOAuthState(): string | null {
  return (
    sessionStorage.getItem(OUTLOOK_OAUTH_STATE_KEY) ??
    localStorage.getItem(OUTLOOK_OAUTH_STATE_KEY)
  );
}

function persistPkceSession(session: PkceSession): void {
  const raw = JSON.stringify(session);
  sessionStorage.setItem(OUTLOOK_PKCE_KEY, raw);
  localStorage.setItem(OUTLOOK_PKCE_KEY, raw);
  sessionStorage.setItem(OUTLOOK_OAUTH_STATE_KEY, session.state);
  localStorage.setItem(OUTLOOK_OAUTH_STATE_KEY, session.state);
}

function isLegacyTokens(value: unknown): value is OutlookTokens {
  return (
    typeof value === "object" &&
    value !== null &&
    "accessToken" in value &&
    typeof (value as OutlookTokens).accessToken === "string"
  );
}

function isStoredAccount(value: unknown): value is OutlookAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "tokens" in value &&
    typeof (value as OutlookAccount).id === "string" &&
    isLegacyTokens((value as OutlookAccount).tokens)
  );
}

export function accountIdFromProfile(profile: OutlookProfile): string {
  const mail = profile.mail?.trim().toLowerCase();
  if (mail) return mail;
  return profile.userPrincipalName.trim().toLowerCase();
}

export function loadStoredAccounts(): OutlookAccount[] {
  try {
    const raw = localStorage.getItem(OUTLOOK_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed.filter(isStoredAccount);
    }

    if (isLegacyTokens(parsed)) {
      const accounts: OutlookAccount[] = [{ id: "legacy", tokens: parsed, profile: null }];
      saveAccounts(accounts);
      return accounts;
    }

    return [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: OutlookAccount[]): void {
  localStorage.setItem(OUTLOOK_STORAGE_KEY, JSON.stringify(accounts));
  localStorage.removeItem(OUTLOOK_LAST_ERROR_KEY);
  window.dispatchEvent(new CustomEvent(OUTLOOK_CONNECTED_EVENT));
}

export function upsertAccount(account: OutlookAccount): OutlookAccount[] {
  const accounts = loadStoredAccounts();
  const index = accounts.findIndex((a) => a.id === account.id);
  if (index >= 0) {
    accounts[index] = account;
  } else {
    accounts.push(account);
  }
  saveAccounts(accounts);
  return accounts;
}

export function updateAccountTokens(accountId: string, tokens: OutlookTokens): void {
  const accounts = loadStoredAccounts();
  const index = accounts.findIndex((a) => a.id === accountId);
  if (index < 0) return;
  accounts[index] = { ...accounts[index], tokens };
  saveAccounts(accounts);
}

export function updateAccountProfile(accountId: string, profile: OutlookProfile): void {
  const accounts = loadStoredAccounts();
  const index = accounts.findIndex((a) => a.id === accountId);
  if (index < 0) return;
  const nextId = accountIdFromProfile(profile);
  const existing = accounts[index];
  if (nextId !== accountId) {
    accounts.splice(index, 1);
    const duplicateIndex = accounts.findIndex((a) => a.id === nextId);
    const merged: OutlookAccount = {
      id: nextId,
      tokens: existing.tokens,
      profile,
    };
    if (duplicateIndex >= 0) {
      accounts[duplicateIndex] = merged;
    } else {
      accounts.push(merged);
    }
  } else {
    accounts[index] = { ...existing, profile };
  }
  saveAccounts(accounts);
}

export function saveOAuthError(message: string | null): void {
  if (!message) {
    localStorage.removeItem(OUTLOOK_LAST_ERROR_KEY);
    return;
  }
  localStorage.setItem(OUTLOOK_LAST_ERROR_KEY, message);
}

export function loadOAuthError(): string | null {
  try {
    return localStorage.getItem(OUTLOOK_LAST_ERROR_KEY);
  } catch {
    return null;
  }
}

function formatOAuthError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return error;
    return new Error("Outlook OAuth fehlgeschlagen.");
  }
  if (typeof error === "string" && error.trim()) {
    return new Error(error.trim());
  }
  return new Error("Outlook OAuth fehlgeschlagen.");
}

export function removeOutlookAccount(accountId: string): void {
  const accounts = loadStoredAccounts().filter((a) => a.id !== accountId);
  if (accounts.length === 0) {
    clearOutlookSession();
    return;
  }
  saveAccounts(accounts);
}

export function clearOutlookSession(): void {
  localStorage.removeItem(OUTLOOK_STORAGE_KEY);
  sessionStorage.removeItem(OUTLOOK_PKCE_KEY);
  sessionStorage.removeItem(OUTLOOK_OAUTH_STATE_KEY);
  localStorage.removeItem(OUTLOOK_PKCE_KEY);
  localStorage.removeItem(OUTLOOK_OAUTH_STATE_KEY);
  window.dispatchEvent(new CustomEvent(OUTLOOK_CONNECTED_EVENT));
}

export function isTokenExpired(tokens: OutlookTokens, skewMs = 60_000): boolean {
  return Date.now() >= tokens.expiresAt - skewMs;
}

async function parseOAuthResponse(res: Response): Promise<TokenApiResponse> {
  const text = await res.text();
  let json: TokenApiResponse & { error?: string };
  try {
    json = JSON.parse(text) as TokenApiResponse & { error?: string };
  } catch {
    throw new Error(
      text.trim().startsWith("<")
        ? "OAuth-Server hat HTML statt JSON zurückgegeben. Dev-Server neu starten."
        : `OAuth-Antwort ungültig (${res.status})`,
    );
  }

  if (!res.ok) {
    throw new Error(json.error ?? `OAuth API fehlgeschlagen (${res.status})`);
  }

  return json;
}

async function callOAuthApi(body: Record<string, unknown>): Promise<TokenApiResponse> {
  const res = await fetch(OAUTH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    return parseOAuthResponse(res);
  }

  if (res.status === 404 || res.status === 405) {
    try {
      return await microsoftOAuthFn({ data: body });
    } catch (error) {
      throw formatOAuthError(error);
    }
  }

  return parseOAuthResponse(res);
}

function clearPkceSession(): void {
  sessionStorage.removeItem(OUTLOOK_PKCE_KEY);
  sessionStorage.removeItem(OUTLOOK_OAUTH_STATE_KEY);
  localStorage.removeItem(OUTLOOK_PKCE_KEY);
  localStorage.removeItem(OUTLOOK_OAUTH_STATE_KEY);
}

export function persistOAuthContext(context: OutlookOAuthContext): void {
  const raw = JSON.stringify(context);
  sessionStorage.setItem(OUTLOOK_OAUTH_CONTEXT_KEY, raw);
  localStorage.setItem(OUTLOOK_OAUTH_CONTEXT_KEY, raw);
}

export function readOAuthContext(): OutlookOAuthContext | null {
  const raw =
    sessionStorage.getItem(OUTLOOK_OAUTH_CONTEXT_KEY) ??
    localStorage.getItem(OUTLOOK_OAUTH_CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OutlookOAuthContext;
  } catch {
    return null;
  }
}

export function clearOAuthContext(): void {
  sessionStorage.removeItem(OUTLOOK_OAUTH_CONTEXT_KEY);
  localStorage.removeItem(OUTLOOK_OAUTH_CONTEXT_KEY);
}

export async function exchangeCodeForTokens(code: string): Promise<OutlookTokens> {
  const session = readPkceSession();
  if (!session) {
    throw new Error("OAuth-Sitzung abgelaufen. Bitte erneut verbinden.");
  }

  const redirectUri = getOutlookRedirectUri();

  const response = await callOAuthApi({
    action: "exchange",
    code,
    codeVerifier: session.verifier,
    redirectUri,
    tenantId: getMicrosoftTenantId(),
  });

  const tokens: OutlookTokens = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: response.expiresAt,
    scope: response.scope,
  };

  clearPkceSession();
  return tokens;
}

export async function refreshOutlookTokens(
  accountId: string,
  refreshToken: string,
): Promise<OutlookTokens> {
  const response = await callOAuthApi({
    action: "refresh",
    refreshToken,
    tenantId: getMicrosoftTenantId(),
  });

  const tokens: OutlookTokens = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? refreshToken,
    expiresAt: response.expiresAt,
    scope: response.scope,
  };

  updateAccountTokens(accountId, tokens);
  return tokens;
}

export async function getValidAccessToken(accountId: string): Promise<string | null> {
  const account = loadStoredAccounts().find((a) => a.id === accountId);
  if (!account) return null;

  const { tokens } = account;
  if (!isTokenExpired(tokens)) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    removeOutlookAccount(accountId);
    return null;
  }

  try {
    const refreshed = await refreshOutlookTokens(accountId, tokens.refreshToken);
    return refreshed.accessToken;
  } catch (error) {
    removeOutlookAccount(accountId);
    throw formatOAuthError(error);
  }
}

export async function startOutlookOAuth(context?: OutlookOAuthContext): Promise<void> {
  const clientId = getMicrosoftClientId();
  if (!clientId) {
    throw new Error("VITE_MICROSOFT_CLIENT_ID ist nicht konfiguriert.");
  }

  if (context) {
    persistOAuthContext(context);
  } else {
    clearOAuthContext();
  }

  const { verifier, challenge } = await createPkcePair();
  const state = generateRandomString(16);
  const session: PkceSession = { verifier, state };
  persistPkceSession(session);

  const redirectUri = getOutlookRedirectUri();

  const url = getMicrosoftAuthorizeUrl({
    clientId,
    tenantId: getMicrosoftTenantId(),
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  window.location.assign(url);
}

export function validateOAuthCallback(params: URLSearchParams): { code: string } {
  const error = params.get("error");
  const errorDescription = params.get("error_description");
  if (error) {
    throw new Error(errorDescription ?? error);
  }

  const state = params.get("state");
  const expectedState = readOAuthState();
  if (!state || !expectedState || state !== expectedState) {
    throw new Error(
      "Ungültiger OAuth-Status. Bitte erneut verbinden (Session verloren — gleiche URL/Port wie beim Start verwenden).",
    );
  }

  const code = params.get("code");
  if (!code) {
    throw new Error("Kein Autorisierungscode von Microsoft erhalten.");
  }

  return { code };
}
