import {
  MICROSOFT_DEFAULT_MAILBOX,
  MICROSOFT_OAUTH_MESSAGE,
  MICROSOFT_PKCE_STORAGE_PREFIX,
  MICROSOFT_PRODUCTION_ORIGIN,
  microsoftAuthorizeUrl,
  microsoftCallbackUrl,
  microsoftEnvClientId,
} from "./config";
import type { MicrosoftStatusPayload } from "./connect";

export type MicrosoftOauthPayload = {
  type: typeof MICROSOFT_OAUTH_MESSAGE;
  ok: boolean;
  code?: string;
  state?: string;
  error?: string;
};

const CONNECT_API = "/api/microsoft-oauth/connect";

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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(digest) };
}

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

export function istErlaubteOauthHerkunft(origin: string): boolean {
  if (origin === MICROSOFT_PRODUCTION_ORIGIN) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    if (url.hostname.endsWith(".vercel.app")) return true;
  } catch {
    return false;
  }
  return false;
}

function pkceSpeichern(state: string, verifier: string): void {
  localStorage.setItem(`${MICROSOFT_PKCE_STORAGE_PREFIX}${state}`, verifier);
}

export function pkceLesen(state: string): string | null {
  return localStorage.getItem(`${MICROSOFT_PKCE_STORAGE_PREFIX}${state}`);
}

export function pkceLoeschen(state: string): void {
  localStorage.removeItem(`${MICROSOFT_PKCE_STORAGE_PREFIX}${state}`);
}

function isStatusPayload(value: unknown): value is MicrosoftStatusPayload {
  if (!value || typeof value !== "object") return false;
  return (value as MicrosoftStatusPayload).id === "microsoft365";
}

export async function completeMicrosoftConnectClient(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  supabaseAccessToken: string;
}): Promise<MicrosoftStatusPayload> {
  try {
    const res = await fetch(CONNECT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && contentType.includes("application/json")) {
      const json: unknown = await res.json();
      if (isStatusPayload(json)) return json;
    }
    if (res.ok === false && res.status !== 404 && res.status !== 405) {
      let message = `Microsoft-Verbindung fehlgeschlagen (${res.status})`;
      try {
        const json = (await res.json()) as { error?: string };
        if (json.error) message = json.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Microsoft-Verbindung fehlgeschlagen")) {
      throw e;
    }
  }

  const { microsoftConnectFn } = await import("./server-fn");
  return microsoftConnectFn({ data: input });
}

export async function microsoftLoginPopup(supabaseAccessToken: string): Promise<MicrosoftStatusPayload> {
  if (!microsoftEnvClientId()) {
    throw new Error(
      "VITE_MICROSOFT_CLIENT_ID fehlt. Entra-App anlegen und die Client-ID in .env.local sowie Vercel setzen.",
    );
  }
  if (!supabaseAccessToken) {
    throw new Error("Nicht angemeldet.");
  }

  const nonce = crypto.randomUUID();
  const state = buildOauthState(nonce, window.location.origin);
  const { verifier, challenge } = await createPkce();
  const redirectUri = microsoftCallbackUrl();
  pkceSpeichern(state, verifier);

  const url = microsoftAuthorizeUrl(state, challenge, redirectUri, MICROSOFT_DEFAULT_MAILBOX);
  const popup = window.open(
    url,
    "microsoft-oauth",
    "width=520,height=720,menubar=no,toolbar=no,status=no",
  );

  if (!popup) {
    pkceLoeschen(state);
    throw new Error("Popup wurde blockiert. Bitte Popups für diese Seite erlauben.");
  }

  const code = await new Promise<string>((resolve, reject) => {
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
      const data = event.data as MicrosoftOauthPayload | null;
      if (!data || data.type !== MICROSOFT_OAUTH_MESSAGE) return;
      if (data.state && data.state !== state) return;
      if (!data.state && event.origin !== window.location.origin) return;

      if (data.ok && data.code) {
        const authCode = data.code;
        finish(() => resolve(authCode));
        return;
      }

      finish(() => reject(new Error(data.error ?? "Microsoft-Anmeldung fehlgeschlagen.")));
    };

    window.addEventListener("message", onMessage);

    const closedTimer = window.setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new Error("Microsoft-Anmeldung abgebrochen.")));
      }
    }, 500);
  });

  try {
    return await completeMicrosoftConnectClient({
      code,
      codeVerifier: verifier,
      redirectUri,
      supabaseAccessToken,
    });
  } finally {
    pkceLoeschen(state);
  }
}
