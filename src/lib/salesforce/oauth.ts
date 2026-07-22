import {
  SALESFORCE_OAUTH_MESSAGE,
  SALESFORCE_PKCE_STORAGE_PREFIX,
  salesforceAuthorizeUrl,
  salesforceCallbackUrl,
  salesforceSessionSpeichern,
  type SalesforceSession,
} from "./config";
import type { SalesforceTokenExchangeResult } from "./token-exchange";

export type SalesforceOauthPayload = {
  type: typeof SALESFORCE_OAUTH_MESSAGE;
  ok: boolean;
  session?: SalesforceSession;
  error?: string;
};

const TOKEN_API = "/api/salesforce-oauth/token";

function base64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(digest) };
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
    if (e instanceof Error && e.message.startsWith("Token-Austausch fehlgeschlagen")) {
      throw e;
    }
    // Netzwerk / fehlende Dev-Route → Server-Fn (Vercel / TanStack Start)
  }

  const { exchangeSalesforceCodeFn } = await import("./exchange-fn");
  return exchangeSalesforceCodeFn({ data: input });
}

/** Popup: Login auf Salesforce → Callback auf unserer Domain → Tokens. */
export async function salesforceLoginPopup(): Promise<SalesforceSession> {
  const state = crypto.randomUUID();
  const { verifier, challenge } = await createPkce();
  const redirectUri = salesforceCallbackUrl();

  pkceSpeichern(state, verifier);

  const url = salesforceAuthorizeUrl(state, challenge, redirectUri);
  const popup = window.open(
    url,
    "salesforce-oauth",
    "width=520,height=720,menubar=no,toolbar=no,status=no",
  );

  if (!popup) {
    pkceLoeschen(state);
    throw new Error("Popup wurde blockiert. Bitte Popups für diese Seite erlauben.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      pkceLoeschen(state);
      fn();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as SalesforceOauthPayload | null;
      if (!data || data.type !== SALESFORCE_OAUTH_MESSAGE) return;

      if (data.ok && data.session?.accessToken) {
        const gespeichert = salesforceSessionSpeichern(data.session);
        finish(() => {
          try {
            popup.close();
          } catch {
            /* ignore */
          }
          resolve(gespeichert);
        });
        return;
      }

      finish(() => {
        try {
          popup.close();
        } catch {
          /* ignore */
        }
        reject(new Error(data.error ?? "Salesforce-Anmeldung fehlgeschlagen."));
      });
    };

    window.addEventListener("message", onMessage);

    const closedTimer = window.setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new Error("Salesforce-Anmeldung abgebrochen.")));
      }
    }, 500);
  });
}
