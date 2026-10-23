/** Server-Funktion für die Exposé-Karte. */

import { createServerFn } from "@tanstack/react-start";

import {
  objektAusExpose,
  type ExposeObjekt,
  type RohExpose,
} from "@/lib/expose-analyse/berechnen";
import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";

import { geocodeExpose } from "./geocode";
import { sucheVergleichsobjekte, type VergleichErgebnis } from "./vergleich";

export type { VergleichErgebnis };

/** Pro Aufruf nur wenige Adressen nachschlagen (Nominatim: 1 Anfrage/s). */
const GEOCODE_PRO_AUFRUF = 8;

export type KartenObjekt = Pick<
  ExposeObjekt,
  | "id"
  | "eingegangenAm"
  | "adresse"
  | "plz"
  | "stadt"
  | "objektart"
  | "makler"
  | "einheiten"
  | "baujahr"
  | "flaeche"
  | "preis"
  | "miete"
  | "faktor"
  | "rendite"
  | "mieteQm"
  | "preisQm"
  | "energieklasse"
  | "exportiert"
> & {
  lat: number | null;
  lng: number | null;
  /** false = nur Ort gefunden, Punkt liegt ungefähr. */
  genau: boolean;
};

export type ExposeKarteDto = {
  objekte: KartenObjekt[];
  /** Exposés, deren Adresse noch nicht nachgeschlagen wurde. */
  offen: number;
};

type Zeile = {
  id: string;
  eingegangen_am: string | null;
  status: string;
  absender_name: string | null;
  betreff: string | null;
  exportiert_am: string | null;
  felder: RohExpose["felder"];
  geo_lat: number | null;
  geo_lng: number | null;
  geo_genau: boolean | null;
  geo_gesucht_am: string | null;
};

/** Alle Exposés mit Koordinaten; ergänzt fehlende Koordinaten portionsweise. */
export async function ladeKartenObjekte(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<ExposeKarteDto> {
  const zeilen: Zeile[] = [];
  const SEITE = 1000;
  for (let von = 0; ; von += SEITE) {
    const { data: rows, error } = await admin
      .from("postfach_exposes")
      .select(
        "id, eingegangen_am, status, absender_name, betreff, exportiert_am, felder, geo_lat, geo_lng, geo_genau, geo_gesucht_am",
      )
      .order("eingegangen_am", { ascending: false, nullsFirst: false })
      .order("id")
      .range(von, von + SEITE - 1);
    if (error) throw new Error(error.message);
    zeilen.push(...((rows ?? []) as Zeile[]));
    if (!rows || rows.length < SEITE) break;
  }

  const objekte = zeilen.map((z) => {
    const o = objektAusExpose({
      id: String(z.id),
      eingegangenAm: z.eingegangen_am,
      status: String(z.status),
      absenderName: z.absender_name,
      betreff: z.betreff,
      exportiertAm: z.exportiert_am,
      felder: z.felder ?? null,
    });
    return { zeile: z, o };
  });

  // Fehlende Koordinaten nachschlagen, sobald die KI die Adresse kennt.
  const fehlend = objekte.filter(
    ({ zeile }) => !zeile.geo_gesucht_am && zeile.felder,
  );
  for (const { zeile, o } of fehlend.slice(0, GEOCODE_PRO_AUFRUF)) {
    let treffer: Awaited<ReturnType<typeof geocodeExpose>> = null;
    try {
      treffer = await geocodeExpose(o);
    } catch (err) {
      console.error("[expose-karte] Geocoding fehlgeschlagen", err);
      break;
    }
    const update = {
      geo_gesucht_am: new Date().toISOString(),
      geo_lat: treffer?.lat ?? null,
      geo_lng: treffer?.lng ?? null,
      geo_genau: treffer ? treffer.genau : null,
    };
    const { error } = await admin
      .from("postfach_exposes")
      .update(update)
      .eq("id", zeile.id);
    if (error) throw new Error(error.message);
    Object.assign(zeile, update);
  }

  return {
    offen: objekte.filter(({ zeile }) => !zeile.geo_gesucht_am && zeile.felder)
      .length,
    objekte: objekte.map(({ zeile, o }) => ({
      id: o.id,
      eingegangenAm: o.eingegangenAm,
      adresse: o.adresse,
      plz: o.plz,
      stadt: o.stadt,
      objektart: o.objektart,
      makler: o.makler,
      einheiten: o.einheiten,
      baujahr: o.baujahr,
      flaeche: o.flaeche,
      preis: o.preis,
      miete: o.miete,
      faktor: o.faktor,
      rendite: o.rendite,
      mieteQm: o.mieteQm,
      preisQm: o.preisQm,
      energieklasse: o.energieklasse,
      exportiert: o.exportiert,
      lat: zeile.geo_lat,
      lng: zeile.geo_lng,
      genau: zeile.geo_genau !== false,
    })),
  };
}

export const exposeKarteLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { supabaseAccessToken?: unknown };
    return {
      supabaseAccessToken:
        typeof d.supabaseAccessToken === "string" ? d.supabaseAccessToken : "",
    };
  })
  .handler(async ({ data }): Promise<ExposeKarteDto> => {
    await microsoftCallerAusJwt(data.supabaseAccessToken);
    return ladeKartenObjekte(createServiceRoleClient());
  });

/** Projektbeschreibung → passende Vergleichsobjekte aus den Exposés. */
export const exposeVergleichSuchenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { supabaseAccessToken?: unknown; text?: unknown };
    return {
      supabaseAccessToken:
        typeof d.supabaseAccessToken === "string" ? d.supabaseAccessToken : "",
      text: typeof d.text === "string" ? d.text.trim().slice(0, 4000) : "",
    };
  })
  .handler(async ({ data }): Promise<VergleichErgebnis> => {
    await microsoftCallerAusJwt(data.supabaseAccessToken);
    if (!data.text) throw new Error("Bitte das Projekt beschreiben.");
    const { objekte } = await ladeKartenObjekte(createServiceRoleClient());
    return sucheVergleichsobjekte(data.text, objekte);
  });
