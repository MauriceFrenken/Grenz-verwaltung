export const MICROSOFT_INTEGRATION_ID = "microsoft365";

/**
 * Ankauf-Postfach (Offene Exposés). App-only (Client Credentials) + Exchange
 * Application Access Policy beschränken den Zugriff auf freigegebene Adressen.
 */
export const MICROSOFT_DEFAULT_MAILBOX = "ankauf@frenken-immobilien.com";

/** Shared Postfach für Dokumente › Postfach. */
export const MICROSOFT_POST_MAILBOX = "post@frenken-immobilien.com";

/** OneDrive-Benutzer für Dokumente › Dokumentenablage. */
export const MICROSOFT_ONEDRIVE_USER = "m.frenken@frenken-immobilien.com";

/**
 * Erlaubte Root-Ordner in der Dokumentenablage (Präfix-Match, case-insensitive).
 * Holding: beide Varianten inkl. „- maurice“. Archiv nur falls vorhanden.
 */
export const MICROSOFT_ABLAGE_ROOT_PREFIXES = [
  "01_FRENKEN HOLDING",
  "02_FRENKEN IMMOBILIEN",
  "03_FRENKEN INVESTMENT",
  "04_FRENKEN CAPITAL",
  "05_MTF CAPITAL",
  "99_ARCHIV",
] as const;

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
