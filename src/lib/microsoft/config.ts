export const MICROSOFT_INTEGRATION_ID = "microsoft365";

/**
 * Postfächer und OneDrive kommen ausschließlich aus Server-Env (siehe
 * `.env.example`): MICROSOFT_MAILBOX (Exposés), MICROSOFT_POST_MAILBOX
 * (Dokumente), optional MICROSOFT_POST_MAILBOX_ZWEIT und
 * MICROSOFT_ONEDRIVE_USER. App-only (Client Credentials) + Exchange
 * Application Access Policy beschränken den Zugriff auf diese Adressen.
 */

/**
 * Outlook-Kategorie: Mails mit dieser Kategorie automatisch ablegen
 * (Postfach-Laden + Cron 00:00/12:00 Berlin). Farbe preset3 = Gelb.
 */
export const MICROSOFT_ABLEGEN_KATEGORIE = "ablegen";
export const MICROSOFT_ABLEGEN_KATEGORIE_FARBE = "preset3";

/**
 * Fester Ablagepfad für Rechnungen unter dem Gesellschafts-Root
 * (ohne KI-Ordnerwahl).
 */
export const MICROSOFT_EINGANGSRECHNUNGEN_PFAD = [
  "02_Finanzen",
  "01_Buchhaltung",
  "Eingangsrechnungen",
] as const;

/** OneDrive-Systemordner, die nie als Ablageziel erscheinen. */
export const MICROSOFT_ABLAGE_ROOT_AUSSCHLUSS: RegExp[] = [
  /^apps$/i,
  /^(attachments|anlagen)$/i,
  /^desktop$/i,
  /^(pictures|bilder)$/i,
  /^(recordings|aufnahmen)$/i,
  /microsoft teams/i,
];

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
