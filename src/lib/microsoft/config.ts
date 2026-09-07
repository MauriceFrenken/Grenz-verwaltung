export const MICROSOFT_INTEGRATION_ID = "microsoft365";

/**
 * Ankauf-Postfach (Offene Exposés). App-only (Client Credentials) + Exchange
 * Application Access Policy beschränken den Zugriff auf freigegebene Adressen.
 */
export const MICROSOFT_DEFAULT_MAILBOX = "ankauf@frenken-immobilien.com";

/** Shared Postfach für Dokumente › Postfach. */
export const MICROSOFT_POST_MAILBOX = "post@frenken-immobilien.com";

/** Zweites Postfach für Dokumente › Postfach (nur Anhänge ab Cutoff-Datum). */
export const MICROSOFT_POST_MAILBOX_ZWEIT = "m.frenken@frenken-immobilien.com";

/** Nur Mails ab diesem Datum aus dem zweiten Postfach (ISO). */
export const MICROSOFT_DOKUMENT_POSTEINGANG_SEIT = "2025-08-20T00:00:00Z";

/** OneDrive-Benutzer für Dokumente › Dokumentenablage. */
export const MICROSOFT_ONEDRIVE_USER = "m.frenken@frenken-immobilien.com";

/**
 * Erlaubte Root-Ordner (Kundenliste). Zahlen in der Liste waren nur Nummerierung —
 * Match über Gesellschaftsnamen; „Digitalisierung“ und Systemordner bleiben draußen.
 * Holding: nur die „-Maurice“-Variante (ohne Maurice wird ausgeblendet).
 * Archiv nur falls vorhanden.
 * TAM-Root auf OneDrive heißt „SellAnyMachine“ (nicht TradeAnyMachine).
 */
export const MICROSOFT_ABLAGE_ROOT_MUSTER: RegExp[] = [
  /FRENKEN[_\s.-]*HOLDING.*MAURICE/i,
  /FRENKEN[_\s.-]*IMMOBILIEN/i,
  /FRENKEN[_\s.-]*INVESTMENT/i,
  /FRENKEN[_\s.-]*CAPITAL/i,
  /MTF[_\s.-]*CAPITAL/i,
  /(?:SELL|TRADE)[_\s.-]*ANY[_\s.-]*MACHINE/i,
  /(?:^|[_\s.-])ARCHIV(?:$|[_\s.-])/i,
];

/** Explizit ausgeschlossene Root-Namen (trotz Muster-Treffer o. Ä.). */
export const MICROSOFT_ABLAGE_ROOT_AUSSCHLUSS: RegExp[] = [
  /DIGITALISIERUNG/i,
];

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
