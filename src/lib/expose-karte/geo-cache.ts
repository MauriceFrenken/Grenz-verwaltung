/**
 * Koordinaten für Salesforce-Objekte: Salesforce selbst hat keine Geodaten gepflegt,
 * daher Nominatim mit Cache. Reihenfolge: vorbelegte Datei → Speicher → Tabelle geo_cache → Nominatim.
 * Fehlt die Tabelle (Migration noch nicht eingespielt), bleibt es beim Speicher-Cache.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { geocodeExpose, geoSchluessel, type GeoAdresse } from "./geocode";
import vorbelegt from "./geo-vorbelegt.json";

type Eintrag = { lat: number; lng: number; genau: boolean } | null;

const VORBELEGT = vorbelegt as Record<string, [number, number, 0 | 1] | null>;
const speicher = new Map<string, Eintrag>();
let tabelleFehlt = false;

function ausVorbelegt(k: string): Eintrag | undefined {
  if (!(k in VORBELEGT)) return undefined;
  const v = VORBELEGT[k];
  return v ? { lat: v[0], lng: v[1], genau: v[2] === 1 } : null;
}

/** Bekannte Koordinaten für die Schlüssel laden (ohne Nominatim). */
async function ladeBekannte(admin: SupabaseClient, schluessel: string[]) {
  const fehlend = schluessel.filter((k) => {
    if (speicher.has(k)) return false;
    const v = ausVorbelegt(k);
    if (v !== undefined) {
      speicher.set(k, v);
      return false;
    }
    return true;
  });
  if (!fehlend.length || tabelleFehlt) return;
  for (let i = 0; i < fehlend.length; i += 200) {
    const { data, error } = await admin
      .from("geo_cache")
      .select("schluessel, lat, lng, genau")
      .in("schluessel", fehlend.slice(i, i + 200));
    if (error) {
      tabelleFehlt = true;
      return;
    }
    for (const z of data ?? []) {
      speicher.set(
        String(z.schluessel),
        z.lat == null || z.lng == null
          ? null
          : {
              lat: Number(z.lat),
              lng: Number(z.lng),
              genau: z.genau !== false,
            },
      );
    }
  }
}

async function speichere(admin: SupabaseClient, k: string, e: Eintrag) {
  speicher.set(k, e);
  if (tabelleFehlt) return;
  const { error } = await admin.from("geo_cache").upsert({
    schluessel: k,
    lat: e?.lat ?? null,
    lng: e?.lng ?? null,
    genau: e ? e.genau : null,
    gesucht_am: new Date().toISOString(),
  });
  if (error) tabelleFehlt = true;
}

/**
 * Ergänzt lat/lng/genau an Objekten ohne Koordinaten. Höchstens `budget` neue
 * Nominatim-Abfragen je Aufruf; Rückgabe: Anzahl Objekte, die noch offen sind.
 */
export async function ergaenzeKoordinaten<
  T extends GeoAdresse & {
    lat: number | null;
    lng: number | null;
    genau: boolean;
  },
>(admin: SupabaseClient, objekte: T[], budget: number): Promise<number> {
  const ohne = objekte.filter((o) => o.lat === null || o.lng === null);
  const mitSchluessel = ohne.flatMap((o) => {
    const k = geoSchluessel(o);
    return k ? [{ o, k }] : [];
  });
  await ladeBekannte(
    admin,
    mitSchluessel.map((x) => x.k),
  );

  let offen = 0;
  for (const { o, k } of mitSchluessel) {
    if (!speicher.has(k)) {
      if (budget <= 0) {
        offen++;
        continue;
      }
      budget--;
      let treffer: Eintrag = null;
      try {
        treffer = await geocodeExpose(o);
      } catch (err) {
        console.error("[marktkarte] Geocoding fehlgeschlagen", err);
        budget = 0;
        offen++;
        continue;
      }
      await speichere(admin, k, treffer);
    }
    const e = speicher.get(k);
    if (e) {
      o.lat = e.lat;
      o.lng = e.lng;
      o.genau = e.genau;
    }
  }
  return offen;
}
