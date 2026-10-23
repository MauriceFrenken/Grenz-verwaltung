/** Pfade ohne Login — alles andere ist geschützt. */
const OEFFENTLICHE_PFADE = new Set([
  "/anmelden",
  "/einladung",
  "/passwort-zuruecksetzen",
  "/datenschutz",
  "/impressum",
  "/salesforce/callback",
  "/microsoft/callback",
]);

export function istOeffentlicherAuthPfad(pathname: string): boolean {
  const pfad = pathname.replace(/\/$/, "") || "/";
  return OEFFENTLICHE_PFADE.has(pfad);
}

/** Verhindert Open Redirects nach dem Login. */
export function sichererRueckweg(von: unknown): string | undefined {
  if (typeof von !== "string" || von.length === 0) return undefined;
  if (!von.startsWith("/") || von.startsWith("//")) return undefined;
  if (istOeffentlicherAuthPfad(von)) return undefined;
  return von;
}
