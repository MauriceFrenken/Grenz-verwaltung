import { notFound, redirect } from "@tanstack/react-router";

/**
 * Frühere Adressen der App, die auf ihren neuen Ort weiterleiten (Lesezeichen, Links in
 * E-Mails). Eine Tabelle statt je einer Weiterleitungs-Route; ausgewertet in src/routes/$.tsx
 * und in Routen mit Parameter, die eine alte Adresse verdecken (z. B. /akquise/$reiter).
 */
type Ziel = { pfad: string; suche?: Record<string, string> };

const ALTE_ADRESSEN: Array<{
  muster: RegExp;
  ziel: (m: RegExpMatchArray, suche: URLSearchParams) => Ziel;
}> = [
  // Akquise: Verkäufer, Salesforce und Maßnahmen sind seit 27.10.2026 eine Seite.
  {
    muster: /^\/verkaeufer$/,
    ziel: (_, s) => ({
      pfad:
        s.get("tab") === "salesforce" ? "/akquise/potenzial" : "/akquise/radar",
    }),
  },
  {
    muster: /^\/akquise\/salesforce\/wiedervorlagen$/,
    ziel: () => ({ pfad: "/aufgaben" }),
  },
  {
    muster: /^\/akquise\/salesforce(?:\/(anschreiben|aktivitaeten))?$/,
    ziel: (m) => ({ pfad: m[1] ? `/akquise/${m[1]}` : "/akquise" }),
  },
  // Mandatsakte: Bewertung entfernt, Exposé-Editor und „Exposé & Teaser“ im Reiter Exposé.
  {
    muster: /^\/mandate\/([^/]+)\/bewertung$/,
    ziel: (m) => ({ pfad: `/mandate/${m[1]}` }),
  },
  {
    muster: /^\/mandate\/([^/]+)\/(?:exposes|dokument\/[^/]+)$/,
    ziel: (m) => ({ pfad: `/mandate/${m[1]}/expose` }),
  },
  {
    muster: /^\/ebics$/,
    ziel: () => ({ pfad: "/kennzahlen", suche: { tab: "liquiditaet" } }),
  },
  { muster: /^\/einstellungen\/vorlagen$/, ziel: () => ({ pfad: "/tools" }) },
];

/** Neue Adresse für eine frühere, sonst null. */
export function neueAdresse(
  pfad: string,
  suche: URLSearchParams = new URLSearchParams(),
): Ziel | null {
  const ohneSchraegstrich = pfad.length > 1 ? pfad.replace(/\/$/, "") : pfad;
  for (const a of ALTE_ADRESSEN) {
    const m = ohneSchraegstrich.match(a.muster);
    if (m) return a.ziel(m, suche);
  }
  return null;
}

/** Für Routen ohne passende Seite: frühere Adresse weiterleiten, sonst 404. */
export function alteAdresseUmleiten(location: {
  pathname: string;
  searchStr: string;
}): never {
  const ziel = neueAdresse(
    location.pathname,
    new URLSearchParams(location.searchStr),
  );
  if (!ziel) throw notFound();
  const suche = new URLSearchParams(ziel.suche).toString();
  throw redirect({
    href: suche ? `${ziel.pfad}?${suche}` : ziel.pfad,
    replace: true,
  });
}
