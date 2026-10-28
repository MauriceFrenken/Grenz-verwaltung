/**
 * Kennzahlen › Markt: amtliche Reihen der Bundesbank, zitierfähige Werte aus der
 * Marktbericht-Bibliothek und die eigene Erhebung (Angebotsfaktoren, Ankaufsprofile).
 */

import { createServerFn } from "@tanstack/react-start";

import {
  angebotsmarkt,
  kaeuferindex,
  type AnkaufsprofilZeile,
  type ExposeZeile,
} from "@/lib/marktbericht/auswertung";
import { DOKUMENT_SPALTEN, dokumentAus } from "@/lib/marktbericht/quellen";
import type { AngebotsZeile, Benchmark } from "@/lib/marktbericht/typen";
import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  bundesbankCsv,
  INDIKATOREN,
  indikatorStand,
  startPeriode,
  type IndikatorStand,
} from "./indikatoren";
import { neuesteVergleichswerte } from "./vergleichswerte";

export type MarktUmfeldDto = {
  indikatoren: IndikatorStand[];
  /** Reihen, die die Bundesbank gerade nicht geliefert hat. */
  fehlend: string[];
  abgerufenAm: string;
  vergleichswerte: Benchmark[];
  /** Eigene Erhebung aus dem Ankauf-Postfach, letzte sechs Monate. */
  angebot: { von: string; bis: string; zeilen: AngebotsZeile[] };
  kaeufer: { profile: number; medianVolumenMax: number | null };
};

const BASIS = "https://api.statistiken.bundesbank.de/rest/data";
/** Die Reihen ändern sich höchstens täglich; zwischengespeichert, solange die Instanz lebt. */
const CACHE_MS = 6 * 60 * 60 * 1000;
let cache: {
  zeit: number;
  indikatoren: IndikatorStand[];
  fehlend: string[];
} | null = null;

async function ladeIndikatoren(): Promise<{
  indikatoren: IndikatorStand[];
  fehlend: string[];
}> {
  if (cache && Date.now() - cache.zeit < CACHE_MS) return cache;
  const startJahr = new Date().getUTCFullYear() - 6;
  const fehlend: string[] = [];
  const ergebnisse = await Promise.all(
    INDIKATOREN.map(async (d) => {
      try {
        const res = await fetch(
          `${BASIS}/${d.reihe}?startPeriod=${startPeriode(d.frequenz, startJahr)}`,
          {
            headers: { Accept: "application/vnd.bbk.data+csv" },
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const stand = indikatorStand(d, bundesbankCsv(await res.text()));
        if (!stand) throw new Error("keine Werte");
        return stand;
      } catch {
        fehlend.push(d.label);
        return null;
      }
    }),
  );
  const indikatoren = ergebnisse.filter((s): s is IndikatorStand => s !== null);
  // Nur vollständige Abrufe zwischenspeichern, sonst beim nächsten Laden erneut versuchen.
  if (!fehlend.length) cache = { zeit: Date.now(), indikatoren, fehlend };
  return { indikatoren, fehlend };
}

function plusTage(iso: string, tage: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

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

export const marktUmfeldLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<MarktUmfeldDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const heute = new Date().toISOString().slice(0, 10);
    const von = plusTage(heute, -182);
    const vorVon = plusTage(von, -365);
    const vorBis = plusTage(heute, -365);

    const [bundesbank, exposes, profile, doks, quellen] = await Promise.all([
      ladeIndikatoren(),
      alle<ExposeZeile>((a, b) =>
        admin
          .from("postfach_exposes")
          .select("eingegangen_am, felder")
          .not("felder", "is", null)
          .gte("eingegangen_am", vorVon)
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
      // Ohne Bibliothek (Migration fehlt) zeigt die Seite die übrigen Werte trotzdem.
      admin
        .from("marktbericht_dokumente")
        .select(DOKUMENT_SPALTEN)
        .eq("status", "ausgelesen")
        .limit(1000),
      admin.from("marktbericht_quellen").select("id, name"),
    ]);

    const angebot = angebotsmarkt(exposes, von, heute, vorVon, vorBis);
    const k = kaeuferindex(profile);
    return {
      indikatoren: bundesbank.indikatoren,
      fehlend: bundesbank.fehlend,
      abgerufenAm: new Date().toISOString(),
      vergleichswerte: doks.error
        ? []
        : neuesteVergleichswerte(
            (doks.data ?? []).map(dokumentAus),
            new Map(
              (quellen.data ?? []).map((q) => [String(q.id), String(q.name)]),
            ),
            heute,
          ),
      angebot: { von, bis: heute, zeilen: angebot.zeilen },
      kaeufer: { profile: k.profile, medianVolumenMax: k.medianVolumenMax },
    };
  });
