/**
 * Adresse → Koordinaten über OpenStreetMap Nominatim.
 * Nutzungsregeln: höchstens 1 Anfrage/Sekunde, eigener User-Agent.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Grenz-Verwaltung/1.0 (grenz-verwaltung-hazel.vercel.app)";
const PAUSE_MS = 1100;

export type GeoTreffer = { lat: number; lng: number; genau: boolean };

export type GeoAdresse = {
  adresse: string | null;
  plz: string | null;
  stadt: string | null;
};

let letzteAnfrage = 0;

async function suche(q: string): Promise<{ lat: number; lng: number } | null> {
  const warten = letzteAnfrage + PAUSE_MS - Date.now();
  if (warten > 0) await new Promise((r) => setTimeout(r, warten));
  letzteAnfrage = Date.now();

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("q", q);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const json = (await res.json()) as Array<{ lat: string; lon: string }>;
  const t = json[0];
  if (!t) return null;
  const lat = Number(t.lat);
  const lng = Number(t.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Ort ohne Zusatz in Klammern („Leichlingen (Rheinland)“ → „Leichlingen“). */
function ortOhneZusatz(ort: string | null): string | null {
  return ort?.replace(/\s*\(.*?\)\s*/g, " ").trim() || null;
}

/**
 * Erst Straße + Ort, sonst nur PLZ/Ort (ungefähre Lage).
 * Mehrere Adressen („A 3 / B 6“, „A 3; B 6“, „A 3, 5“) → nur die erste.
 */
export async function geocodeExpose(
  input: GeoAdresse,
): Promise<GeoTreffer | null> {
  const ort = [input.plz, ortOhneZusatz(input.stadt)]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!ort) return null;
  const strasse = input.adresse?.split(/[/;]/)[0]?.split(",")[0]?.trim();

  if (strasse) {
    const t = await suche(`${strasse}, ${ort}`);
    if (t) return { ...t, genau: true };
  }
  const t = await suche(ort);
  return t ? { ...t, genau: false } : null;
}

/** Schlüssel für den Geo-Cache: dieselbe Adresse ergibt denselben Schlüssel. */
export function geoSchluessel(input: GeoAdresse): string | null {
  const teile = [input.adresse, input.plz, input.stadt].map((t) =>
    (t ?? "").toLowerCase().replace(/\s+/g, " ").trim(),
  );
  return teile[2] ? teile.join("|") : null;
}
