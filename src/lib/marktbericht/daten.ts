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
  MINDEST_FALLZAHL,
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
  // Laufende eigene Erhebung: die letzten sechs Monate bis heute, falls die Periode selbst zu dünn ist.
  const erhebungVon = plusTage(heute, -182);

  const [exposes, profile, mandate, deals, radar, zinsen] = await Promise.all([
    alle<ExposeZeile>((a, b) =>
      admin
        .from("postfach_exposes")
        .select("eingegangen_am, felder")
        .not("felder", "is", null)
        .gte("eingegangen_am", vor.von)
        .lte("eingegangen_am", `${heute}T23:59:59Z`)
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
        .gte("created_at", von < erhebungVon ? von : erhebungVon)
        .range(a, b),
    ),
    ladeZinsumfeld(stichtag),
  ]);

  let angebot = angebotsmarkt(exposes, von, bis, vor.von, vor.bis);
  let radarWerte = radarAuswahl(radar, von, bis);
  const ersatz = { angebot: false, radar: false };
  // Eigene Quellen laufen erst seit 2026 (Exposé-Eingang ab August, Markt-Radar ab Oktober).
  // Ohne genug Fälle in der Periode zeigt der Bericht die laufende Erhebung, klar gekennzeichnet.
  if (erhebungVon > von) {
    const gesamt = angebot.zeilen.find((z) => z.teilmarkt === "Gesamt");
    if ((gesamt?.angebote ?? 0) < MINDEST_FALLZAHL) {
      const laufend = angebotsmarkt(
        exposes,
        erhebungVon,
        heute,
        plusTage(erhebungVon, -365),
        plusTage(heute, -365),
      );
      if (
        (laufend.zeilen.find((z) => z.teilmarkt === "Gesamt")?.angebote ?? 0) >
        (gesamt?.angebote ?? 0)
      ) {
        angebot = laufend;
        ersatz.angebot = true;
      }
    }
    if (radarWerte.kaeufer + radarWerte.verkaeufer === 0) {
      const laufend = radarAuswahl(radar, erhebungVon, heute);
      if (laufend.kaeufer + laufend.verkaeufer > 0) {
        radarWerte = laufend;
        ersatz.radar = true;
      }
    }
  }

  return {
    periode,
    von,
    bis,
    stichtag,
    vorlaeufig: stichtag < bis,
    angebot,
    kaeufer: kaeuferindex(profile),
    vermarktung: vermarktung(mandate, deals, von, bis),
    vermarktungVorperiode: vermarktung(mandate, deals, vor.von, vor.bis),
    zinsen,
    radar: radarWerte,
    ...(ersatz.angebot || ersatz.radar
      ? { erhebung: { von: erhebungVon, bis: heute, ...ersatz } }
      : {}),
  };
}

function plusTage(iso: string, tage: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
