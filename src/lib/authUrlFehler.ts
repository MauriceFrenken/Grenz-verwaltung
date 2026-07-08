export type AuthUrlFehler = {
  code: string | null;
  beschreibung: string | null;
};

function paramsAusSuchstring(suchstring: string): URLSearchParams {
  const normalisiert = suchstring.startsWith("?") || suchstring.startsWith("#")
    ? suchstring.slice(1)
    : suchstring;
  return new URLSearchParams(normalisiert);
}

/** Liest Supabase-Auth-Fehler aus Hash oder Query (z. B. nach abgelaufenem Einladungslink). */
export function authUrlFehlerLesen(): AuthUrlFehler | null {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash;
  const search = window.location.search;

  const hashParams = hash ? paramsAusSuchstring(hash) : null;
  const searchParams = search ? paramsAusSuchstring(search) : null;

  const error =
    hashParams?.get("error") ??
    hashParams?.get("error_code") ??
    searchParams?.get("error") ??
    searchParams?.get("error_code") ??
    null;

  const beschreibung =
    hashParams?.get("error_description") ?? searchParams?.get("error_description") ?? null;

  if (!error && !beschreibung) return null;

  return {
    code: error,
    beschreibung: beschreibung ? beschreibung.replace(/\+/g, " ") : null,
  };
}

export function authUrlFehlerAnzeige(fehler: AuthUrlFehler): string {
  const code = fehler.code?.toLowerCase() ?? "";
  const text = fehler.beschreibung?.toLowerCase() ?? "";

  if (code.includes("otp_expired") || text.includes("expired")) {
    return "Der Einladungslink ist abgelaufen (gültig für etwa eine Stunde). Bitte lassen Sie sich vom Administrator eine neue Einladung senden.";
  }
  if (code.includes("invalid") || text.includes("invalid")) {
    return "Der Einladungslink ist ungültig oder wurde bereits verwendet. Bitte lassen Sie sich eine neue Einladung senden.";
  }
  if (fehler.beschreibung) return fehler.beschreibung;

  return "Der Einladungslink konnte nicht verarbeitet werden. Bitte lassen Sie sich eine neue Einladung senden.";
}

export function authUrlFehlerBereinigen(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, document.title, url.pathname + url.search);
}
