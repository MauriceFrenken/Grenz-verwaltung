/**
 * Serverseitiger Salesforce-Zugang für Sync und Schreibpfad:
 * Connected App mit JWT Bearer Flow und eigenem Integrationsuser.
 * Env: SF_LOGIN_URL, SF_CLIENT_ID, SF_USERNAME, SF_PRIVATE_KEY (PEM).
 * Fallback für den Übergang: SALESFORCE_REFRESH_TOKEN bzw. SALESFORCE_ACCESS_TOKEN.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createSign } from "node:crypto";

import { resolveSalesforceCredentials } from "@/lib/salesforce/server-credentials";

export type SfServerZugang = {
  accessToken: string;
  instanceUrl: string;
  quelle: "jwt" | "env" | "sitzung";
};

function readEnv(name: string): string {
  if (typeof process === "undefined") return "";
  return (process.env[name] ?? "").trim();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** PEM aus der Env: Vercel speichert Zeilenumbrüche oft als `\n`. */
export function privaterSchluesselAusEnv(roh: string): string {
  const text = roh.includes("\\n") ? roh.replace(/\\n/g, "\n") : roh;
  return text.trim();
}

export function jwtZugangKonfiguriert(): boolean {
  return Boolean(readEnv("SF_CLIENT_ID") && readEnv("SF_USERNAME") && readEnv("SF_PRIVATE_KEY"));
}

function loginUrl(): string {
  return (readEnv("SF_LOGIN_URL") || readEnv("SALESFORCE_LOGIN_URL") || "https://login.salesforce.com").replace(
    /\/$/,
    "",
  );
}

/** Signierte JWT-Assertion (RS256) für den Token-Endpunkt. */
export function erzeugeJwtAssertion(input: {
  clientId: string;
  username: string;
  audience: string;
  privateKeyPem: string;
  jetztSekunden?: number;
}): string {
  const jetzt = input.jetztSekunden ?? Math.floor(Date.now() / 1000);
  const kopf = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const inhalt = base64url(
    JSON.stringify({ iss: input.clientId, sub: input.username, aud: input.audience, exp: jetzt + 180 }),
  );
  const signierer = createSign("RSA-SHA256");
  signierer.update(`${kopf}.${inhalt}`);
  const signatur = base64url(signierer.sign(input.privateKeyPem));
  return `${kopf}.${inhalt}.${signatur}`;
}

let cache: (SfServerZugang & { gueltigBis: number }) | null = null;

/**
 * Zugang für einen einzelnen Aufruf vorgeben, z. B. die Salesforce-Sitzung des
 * angemeldeten Nutzers, solange die Connected App noch fehlt.
 */
const vorgabe = new AsyncLocalStorage<SfServerZugang>();

export function mitSfZugang<T>(zugang: SfServerZugang, lauf: () => Promise<T>): Promise<T> {
  return vorgabe.run(zugang, lauf);
}

export function sfZugangCacheLeeren(): void {
  cache = null;
}

async function jwtToken(): Promise<SfServerZugang> {
  const login = loginUrl();
  // Die Audience ist der Login-Host, nicht die My Domain (Sandbox: test.salesforce.com).
  const audience = /test\.salesforce\.com|\.sandbox\./.test(login)
    ? "https://test.salesforce.com"
    : "https://login.salesforce.com";
  const assertion = erzeugeJwtAssertion({
    clientId: readEnv("SF_CLIENT_ID"),
    username: readEnv("SF_USERNAME"),
    audience,
    privateKeyPem: privaterSchluesselAusEnv(readEnv("SF_PRIVATE_KEY")),
  });

  const res = await fetch(`${login}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    instance_url?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !data?.access_token || !data.instance_url) {
    throw new Error(
      `Salesforce JWT-Anmeldung fehlgeschlagen: ${data?.error_description ?? data?.error ?? res.status}`,
    );
  }
  return { accessToken: data.access_token, instanceUrl: data.instance_url.replace(/\/$/, ""), quelle: "jwt" };
}

/** Gültiger Server-Zugang, 30 Minuten zwischengespeichert. */
export async function sfServerZugang(optionen: { erneuern?: boolean } = {}): Promise<SfServerZugang> {
  const vorgegeben = vorgabe.getStore();
  if (vorgegeben) return vorgegeben;
  if (!optionen.erneuern && cache && cache.gueltigBis > Date.now()) return cache;

  let zugang: SfServerZugang;
  if (jwtZugangKonfiguriert()) {
    zugang = await jwtToken();
  } else {
    const creds = await resolveSalesforceCredentials(null, { forceRefresh: optionen.erneuern });
    zugang = { accessToken: creds.accessToken, instanceUrl: creds.instanceUrl, quelle: "env" };
  }
  cache = { ...zugang, gueltigBis: Date.now() + 30 * 60 * 1000 };
  return zugang;
}
