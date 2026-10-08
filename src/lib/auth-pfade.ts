/** Pfade ohne Login — alles andere ist geschützt. */
const OEFFENTLICHE_PFADE = new Set([
  "/anmelden",
  "/einladung",
  "/passwort-zuruecksetzen",
  "/datenschutz",
  "/salesforce/callback",
  "/microsoft/callback",
]);

/** Management Board unter /board. */
export function istBoardPfad(pathname: string): boolean {
  return pathname === "/board" || pathname.startsWith("/board/");
}

/** Steuerungsseiten: Cockpit (`/`) und alles unter /board. */
export function istSteuerungsPfad(pathname: string): boolean {
  const pfad = pathname.replace(/\/$/, "") || "/";
  return pfad === "/" || istBoardPfad(pfad);
}

/**
 * Demo-Modus des Boards (`npm run board`, VITE_BOARD_DEMO=1): Cockpit und /board sind dann ohne
 * Anmeldung erreichbar und zeigen ausschließlich fiktive Seed-Daten. In Produktion nie setzen.
 */
export function istBoardDemo(): boolean {
  return import.meta.env?.VITE_BOARD_DEMO === "1";
}

export function istOeffentlicherAuthPfad(pathname: string): boolean {
  const pfad = pathname.replace(/\/$/, "") || "/";
  if (istBoardDemo() && istSteuerungsPfad(pfad)) return true;
  return OEFFENTLICHE_PFADE.has(pfad);
}

/** Verhindert Open Redirects nach dem Login. */
export function sichererRueckweg(von: unknown): string | undefined {
  if (typeof von !== "string" || von.length === 0) return undefined;
  if (!von.startsWith("/") || von.startsWith("//")) return undefined;
  if (istOeffentlicherAuthPfad(von)) return undefined;
  return von;
}
