export const MICROSOFT_INTEGRATION_ID = "microsoft365";

/**
 * Einziges Zielpostfach. App-only (Client Credentials) + Exchange Application
 * Access Policy beschränken den Zugriff auf genau diese Adresse.
 */
export const MICROSOFT_DEFAULT_MAILBOX = "ankauf@frenken-immobilien.com";

export const MICROSOFT_PRODUCTION_ORIGIN = "https://frenken-expose-ai.vercel.app";

/** Scope für Client Credentials — lädt alle Application-Permissions der Entra-App. */
export const MICROSOFT_APP_SCOPE = "https://graph.microsoft.com/.default";

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
