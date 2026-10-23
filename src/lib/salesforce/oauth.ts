import {
  SALESFORCE_OAUTH_MESSAGE,
  SALESFORCE_PKCE_STORAGE_PREFIX,
  SALESFORCE_PRODUCTION_ORIGIN,
  salesforceAuthorizeUrl,
  salesforceCallbackUrl,
  salesforceSessionSpeichern,
  type SalesforceSession,
} from "./config";
import type { SalesforceTokenExchangeResult } from "./token-exchange";

export type SalesforceOauthPayload = {
  type: typeof SALESFORCE_OAUTH_MESSAGE;
  ok: boolean;
  /** Autorisierungscode — der Austausch passiert im Ausgangsfenster. */
  code?: string;
  state?: string;
  /** Legacy: ältere Callback-Seiten schicken die fertige Session. */
  session?: SalesforceSession;
  error?: string;
};

const TOKEN_API = "/api/salesforce-oauth/token";

function base64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeText(text: string): string {
  return base64Url(new TextEncoder().encode(text));
}

function base64UrlDecodeText(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(digest) };
}

/**
 * Der OAuth-State transportiert die Herkunft des Ausgangsfensters. Die
 * Callback-Seite läuft ggf. auf der Produktionsdomain, während die App auf
 * localhost oder einem Preview-Deployment liegt — ohne diese Angabe kämen
 * die Tokens dort nie an.
 */
export function buildOauthState(nonce: string, origin: string): string {
  return base64UrlEncodeText(JSON.stringify({ n: nonce, o: origin }));
}

export function readOauthStateOrigin(state: string): string | null {
  try {
    const parsed = JSON.parse(base64UrlDecodeText(state)) as { o?: unknown };
    return typeof parsed.o === "string" ? parsed.o : null;
  } catch {
    return null;
  }
}

/**
 * Nur eigene Deployments dürfen den Autorisierungscode empfangen — sonst
 * könnte eine fremde Seite den gemeinsamen Callback für sich abgreifen.
 */
export function istErlaubteOauthHerkunft(origin: string): boolean {
  if (SALESFORCE_PRODUCTION_ORIGIN && origin === SALESFORCE_PRODUCTION_ORIGIN) {
    return true;
  }
  if (typeof window !== "undefined" && origin === window.location.origin) {
    return true;
  }
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      return true;
    // Preview-Deployments dieses Projekts: <projekt>-<hash>.vercel.app
    const produktion = SALESFORCE_PRODUCTION_ORIGIN
      ? new URL(SALESFORCE_PRODUCTION_ORIGIN).hostname
      : "";
    const projekt = produktion.endsWith(".vercel.app")
      ? produktion.slice(0, -".vercel.app".length)
      : "";
    return (
      Boolean(projekt) &&
      url.protocol === "https:" &&
      url.hostname.endsWith(".vercel.app") &&
      url.hostname.startsWith(`${projekt}-`)
    );
  } catch {
    return false;
  }
}

export function pkceSpeichern(state: string, verifier: string): void {
  localStorage.setItem(`${SALESFORCE_PKCE_STORAGE_PREFIX}${state}`, verifier);
}

export function pkceLesen(state: string): string | null {
  return localStorage.getItem(`${SALESFORCE_PKCE_STORAGE_PREFIX}${state}`);
}

export function pkceLoeschen(state: string): void {
  localStorage.removeItem(`${SALESFORCE_PKCE_STORAGE_PREFIX}${state}`);
}

function isTokenResult(value: unknown): value is SalesforceTokenExchangeResult {
  if (!value || typeof value !== "object") return false;
  const v = value as SalesforceTokenExchangeResult;
  return typeof v.accessToken === "string" && typeof v.instanceUrl === "string";
}

export async function exchangeSalesforceCodeClient(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<SalesforceTokenExchangeResult> {
  // Dev: Vite-Plugin unter /api/salesforce-oauth/token
  try {
    const res = await fetch(TOKEN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && contentType.includes("application/json")) {
      const json: unknown = await res.json();
      if (isTokenResult(json)) return json;
    }
    if (res.ok === false && res.status !== 404 && res.status !== 405) {
      let message = `Token-Austausch fehlgeschlagen (${res.status})`;
      try {
        const json = (await res.json()) as { error?: string };
        if (json.error) message = json.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.startsWith("Token-Austausch fehlgeschlagen")
    ) {
      throw e;
    }
    // Netzwerk / fehlende Dev-Route → Server-Fn (Vercel / TanStack Start)
  }

  const { exchangeSalesforceCodeFn } = await import("./exchange-fn");
  return exchangeSalesforceCodeFn({ data: input });
}

/** Popup: Login auf Salesforce → Callback auf unserer Domain → Tokens. */
export async function salesforceLoginPopup(): Promise<SalesforceSession> {
  const nonce = crypto.randomUUID();
  const state = buildOauthState(nonce, window.location.origin);
  const { verifier, challenge } = await createPkce();
  const redirectUri = salesforceCallbackUrl();

  // Fallback für den Fall, dass die Callback-Seite den Austausch selbst
  // erledigen muss (Popup blockiert → Weiterleitung im selben Tab).
  pkceSpeichern(state, verifier);

  const url = salesforceAuthorizeUrl(state, challenge, redirectUri);
  const popup = window.open(
    url,
    "salesforce-oauth",
    "width=520,height=720,menubar=no,toolbar=no,status=no",
  );

  if (!popup) {
    pkceLoeschen(state);
    throw new Error(
      "Popup wurde blockiert. Bitte Popups für diese Seite erlauben.",
    );
  }

  type Antwort =
    | { kind: "code"; code: string }
    | { kind: "session"; session: SalesforceSession };

  const antwort = await new Promise<Antwort>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      fn();
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as SalesforceOauthPayload | null;
      if (!data || data.type !== SALESFORCE_OAUTH_MESSAGE) return;

      // Der State ist das Bindeglied zwischen diesem Fenster und dem Callback.
      if (data.state && data.state !== state) return;
      if (!data.state && event.origin !== window.location.origin) return;

      if (data.ok && data.code) {
        const code = data.code;
        finish(() => resolve({ kind: "code", code }));
        return;
      }

      // Legacy-Callback liefert die fertige Session.
      if (data.ok && data.session?.accessToken) {
        const session = data.session;
        finish(() => resolve({ kind: "session", session }));
        return;
      }

      finish(() =>
        reject(new Error(data.error ?? "Salesforce-Anmeldung fehlgeschlagen.")),
      );
    };

    window.addEventListener("message", onMessage);

    const closedTimer = window.setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new Error("Salesforce-Anmeldung abgebrochen.")));
      }
    }, 500);
  });

  try {
    if (antwort.kind === "session") {
      return salesforceSessionSpeichern(antwort.session);
    }

    const tokens = await exchangeSalesforceCodeClient({
      code: antwort.code,
      codeVerifier: verifier,
      redirectUri,
    });

    const { enrichSalesforceSession } = await import("./api");
    const session = await enrichSalesforceSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      instanceUrl: tokens.instanceUrl,
      gespeichertAm: new Date().toISOString(),
      aktualisiertAm: new Date().toISOString(),
    });

    return salesforceSessionSpeichern(session);
  } finally {
    pkceLoeschen(state);
  }
}
