/** Lädt die Grenz-Daten einer Periode und friert daraus die Kennzahlen des Marktberichts ein. Server-only. */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  angebotsmarkt,
  kaeuferindex,
  radarAuswahl,
  vermarktung,
  type AnkaufsprofilZeile,
  type DealZeile,
  type ExposeZeile,
  type MandatZeile,
  type RadarZeile,
} from "./auswertung";
import { ladeZinsumfeld } from "./bundesbank";
import {
  periodeVonBis,
  vorperiode,
  type MarktberichtKennzahlen,
  type Periode,
} from "./typen";

async function alle<T>(
  abfrage: (
    von: number,
    bis: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const seite = 1000;
  const ergebnis: T[] = [];
  for (let i = 0; ; i += seite) {
    const { data, error } = await abfrage(i, i + seite - 1);
    if (error) throw new Error(error.message);
    ergebnis.push(...(data ?? []));
    if (!data || data.length < seite) return ergebnis;
  }
}

export async function berechneKennzahlen(
  admin: SupabaseClient,
  periode: Periode,
): Promise<MarktberichtKennzahlen> {
  const { von, bis } = periodeVonBis(periode);
  const vor = periodeVonBis(vorperiode(periode));
  const heute = new Date().toISOString().slice(0, 10);
  const stichtag = bis < heute ? bis : heute;

  const [exposes, profile, mandate, deals, radar, zinsen] = await Promise.all([
    alle<ExposeZeile>((a, b) =>
      admin
        .from("postfach_exposes")
        .select("eingegangen_am, felder")
        .not("felder", "is", null)
        .gte("eingegangen_am", vor.von)
        .lte("eingegangen_am", `${bis}T23:59:59Z`)
        .range(a, b),
    ),
    alle<AnkaufsprofilZeile>((a, b) =>
      admin
        .from("sf_ankaufsprofile")
        .select(
          "regionen, assetklassen, investor_typ, volumen_min, volumen_max",
        )
        .range(a, b),
    ),
    alle<MandatZeile>((a, b) =>
      admin.from("sf_mandate").select("beauftragt_am").range(a, b),
    ),
    alle<DealZeile>((a, b) =>
      admin
        .from("sf_deals")
        .select("phase, betrag, abschluss_am, sf_daten")
        .range(a, b),
    ),
    alle<RadarZeile>((a, b) =>
      admin
        .from("markt_radar_meldungen")
        .select(
          "seite, akteur, ereignis, ort, volumen_eur, ereignis_am, created_at, quelle_url, relevanz",
        )
        .neq("status", "verworfen")
        .gte("created_at", von)
        .range(a, b),
    ),
    ladeZinsumfeld(stichtag),
  ]);

  return {
    periode,
    von,
    bis,
    stichtag,
    vorlaeufig: stichtag < bis,
    angebot: angebotsmarkt(exposes, von, bis, vor.von, vor.bis),
    kaeufer: kaeuferindex(profile),
    vermarktung: vermarktung(mandate, deals, von, bis),
    vermarktungVorperiode: vermarktung(mandate, deals, vor.von, vor.bis),
    zinsen,
    radar: radarAuswahl(radar, von, bis),
  };
}
