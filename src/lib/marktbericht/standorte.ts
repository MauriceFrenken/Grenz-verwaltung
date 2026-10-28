/**
 * Standortkennzahlen für den Investorenbericht: ordnet die belegten Vergleichswerte der Bibliothek
 * je Stadt einer festen Kennzahl zu (Kaufpreisfaktor, Mieten, Renditen, Umsatz) und ergänzt die
 * eigenen Angebotsdaten. Im Bericht erscheinen die Werte als Grenz & Co. Research ohne Herausgeber;
 * die Belege (Quelle, Seite, Zitat) bleiben intern am Vergleichswert gespeichert.
 */

import type { Benchmark, MarktberichtKennzahlen, Teilmarkt } from "./typen";

export const STANDORTE = ["Köln", "Düsseldorf", "Bonn"] as const;
export type Standort = (typeof STANDORTE)[number];

export type MarktArt =
  | "faktor"
  | "kaufpreis"
  | "miete"
  | "rendite"
  | "liegenschaftszins"
  | "umsatz";

export type MarktWert = {
  art: MarktArt;
  /** Anzeige, z. B. „21,0“, „16–20“, „17,01 €/m²“. */
  text: string;
  wert: number;
  veraenderung: string | null;
  stichtag: string;
  benchmarkId: string;
};

export type StandortZeile = {
  standort: Standort | "Übriges Rheinland";
  markt: Partial<Record<MarktArt, MarktWert>>;
  /** Eigene Angebotsdaten (Median), nur ab Mindestfallzahl. */
  angebotsfaktor: number | null;
  angebotspreisM2: number | null;
  /** Bruttoanfangsrendite aus dem Angebotsfaktor (100 / Faktor). */
  bruttorendite: number | null;
};

export type Deutschland = {
  rendite: MarktWert | null;
  umsatz: MarktWert | null;
};

const klein = (s: string) => s.toLowerCase();

/** Zugeordnete Kennzahl oder null, wenn der Wert für den Investorenbericht nicht taugt. */
export function marktArt(b: Benchmark): MarktArt | null {
  const k = klein(b.kennzahl);
  const e = klein(b.einheit);
  const wohnen = /(mietwohn|mehrfamilien|wohnhaus|zinsh|wohnen|wohnung|mfh)/;
  const fremd =
    /(büro|buero|logistik|einzelhandel|high street|geschäftshaus 1a|hotel|gewerblich)/;
  if (fremd.test(k)) return null;
  if (
    /(gemischt|neubau|eigentumswohn|\betw\b|spitzenfaktor|spitzenmiete)/.test(k)
  )
    return null;
  if (
    /(rohertragsfaktor|ertragsfaktor|einstiegsfaktor|kaufpreisfaktor|vervielf)/.test(
      k,
    ) &&
    wohnen.test(k)
  )
    return "faktor";
  const prozent = e.startsWith("%");
  if (/liegenschaftszins/.test(k) && wohnen.test(k) && prozent)
    return "liegenschaftszins";
  if (/spitzenrendite|nettoanfangsrendite/.test(k) && wohnen.test(k) && prozent)
    return "rendite";
  if (/miete/.test(k) && /(wohnen|wohnung|bestand)/.test(k) && /€\/m/.test(e))
    return "miete";
  if (/kaufpreis/.test(k) && wohnen.test(k) && /€\/m/.test(e))
    return "kaufpreis";
  if (
    /(transaktionsvolumen|geldumsatz)/.test(k) &&
    /(zinsh|mehrfamilien|mietwohn)/.test(k) &&
    /(mio|mrd)/.test(e)
  )
    return "umsatz";
  return null;
}

/** Stadt der Region; Stadtteile („Düsseldorf-Altstadt“) zählen nicht. */
export function standortAus(region: string): Standort | null {
  const r = klein(region.trim())
    .replace(/^(stadt|bundesstadt|landeshauptstadt)\s+/, "")
    .replace(/\s*\(.*\)$/, "");
  if (/^(köln|koeln|cologne)$/.test(r)) return "Köln";
  if (/^(düsseldorf|duesseldorf)$/.test(r)) return "Düsseldorf";
  if (/^bonn$/.test(r)) return "Bonn";
  return null;
}

const de0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const de1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const de2 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const de12 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function anzeige(art: MarktArt, b: Benchmark): string {
  const e = b.einheit.trim();
  if (art === "faktor") {
    const spanne = e.match(/(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)/);
    return spanne ? `${spanne[1]}–${spanne[2]}` : de1.format(b.wert);
  }
  if (art === "rendite" || art === "liegenschaftszins")
    return `${de12.format(b.wert)} %`;
  if (art === "miete") return `${de2.format(b.wert)} €/m²`;
  if (art === "kaufpreis") return `${de0.format(b.wert)} €/m²`;
  // Umsatz einheitlich in Mio. €.
  const mio = /mrd/i.test(e) ? b.wert * 1000 : b.wert;
  return mio >= 1000
    ? `${de12.format(Math.round(mio / 10) / 100)} Mrd. €`
    : `${de0.format(Math.round(mio))} Mio. €`;
}

function marktWert(art: MarktArt, b: Benchmark): MarktWert {
  return {
    art,
    text: anzeige(art, b),
    wert: b.wert,
    veraenderung: b.veraenderung?.trim() || null,
    stichtag: b.stichtag,
    benchmarkId: b.id,
  };
}

/** Bester Wert je Art: höchste Relevanz, dann jüngster Stichtag. */
function besterJeArt(werte: Benchmark[]): Partial<Record<MarktArt, MarktWert>> {
  const sortiert = [...werte].sort(
    (a, b) =>
      (b.relevanz ?? 50) - (a.relevanz ?? 50) ||
      b.stichtag.localeCompare(a.stichtag),
  );
  const out: Partial<Record<MarktArt, MarktWert>> = {};
  for (const b of sortiert) {
    const art = marktArt(b);
    if (art && !out[art]) out[art] = marktWert(art, b);
  }
  return out;
}

export function bruttorendite(
  faktor: number | null | undefined,
): number | null {
  return faktor && faktor > 0 ? Math.round(1000 / faktor) / 10 : null;
}

export function standortZeilen(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
): StandortZeile[] {
  const gepr = benchmarks.filter((b) => b.geprueft);
  const angebot = (t: Teilmarkt) =>
    k.angebot.zeilen.find((z) => z.teilmarkt === t);
  const zeilen: StandortZeile[] = STANDORTE.map((s) => {
    const a = angebot(s);
    return {
      standort: s,
      markt: besterJeArt(gepr.filter((b) => standortAus(b.region) === s)),
      angebotsfaktor: a?.faktor?.median ?? null,
      angebotspreisM2: a?.preisM2?.median ?? null,
      bruttorendite: bruttorendite(a?.faktor?.median),
    };
  });
  const rest = angebot("Übriges Rheinland");
  if (rest?.faktor)
    zeilen.push({
      standort: "Übriges Rheinland",
      markt: {},
      angebotsfaktor: rest.faktor.median,
      angebotspreisM2: rest.preisM2?.median ?? null,
      bruttorendite: bruttorendite(rest.faktor.median),
    });
  return zeilen;
}

const DEUTSCHLAND = /(deutschland|germany|top[- ]?7|a-städte|tier-1)/i;

export function deutschland(benchmarks: Benchmark[]): Deutschland {
  const d = besterJeArt(
    benchmarks.filter((b) => b.geprueft && DEUTSCHLAND.test(b.region)),
  );
  // Bundesweit zählt das Wohninvestment-Volumen, nicht nur Zinshäuser.
  const umsatz = benchmarks
    .filter(
      (b) =>
        b.geprueft &&
        DEUTSCHLAND.test(b.region) &&
        /transaktionsvolumen/i.test(b.kennzahl) &&
        /wohn/i.test(b.kennzahl) &&
        /(mio|mrd)/i.test(b.einheit),
    )
    .sort(
      (a, b) =>
        (b.relevanz ?? 50) - (a.relevanz ?? 50) ||
        b.stichtag.localeCompare(a.stichtag),
    )[0];
  return {
    rendite: d.rendite ?? null,
    umsatz: umsatz ? marktWert("umsatz", umsatz) : null,
  };
}
