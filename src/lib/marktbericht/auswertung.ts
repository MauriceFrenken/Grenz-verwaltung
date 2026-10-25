/**
 * Reine Auswertung der Grenz-eigenen Daten für den Marktbericht (ohne Datenbankzugriff, testbar).
 * Ring 1 des Datenkonzepts: Exposé-Eingang, Ankaufsprofile, Mandate und Deals, Markt-Radar.
 */

import { teilmarktAus } from "./teilmarkt";
import {
  MINDEST_FALLZAHL,
  TEILMAERKTE,
  type AngebotsZeile,
  type Angebotsmarkt,
  type Kaeuferindex,
  type RadarMeldung,
  type Teilmarkt,
  type Vermarktung,
  type Verteilung,
} from "./typen";

/** Feld aus der KI-Extraktion des Exposé-Eingangs (postfach_exposes.felder). */
type ExposeFeld = { value?: unknown } | null | undefined;

export type ExposeZeile = {
  eingegangen_am: string | null;
  felder: Record<string, ExposeFeld> | null;
};

export type AnkaufsprofilZeile = {
  regionen: string[] | null;
  assetklassen: string[] | null;
  investor_typ: string | null;
  volumen_min: number | string | null;
  volumen_max: number | string | null;
};

export type MandatZeile = { beauftragt_am: string | null };

export type DealZeile = {
  phase: string | null;
  betrag: number | string | null;
  abschluss_am: string | null;
  sf_daten: Record<string, unknown> | null;
};

export type RadarZeile = {
  seite: "kaeufer" | "verkaeufer";
  akteur: string;
  ereignis: string;
  ort: string | null;
  volumen_eur: number | string | null;
  ereignis_am: string | null;
  created_at: string;
  quelle_url: string;
  relevanz: number;
};

/** Deutsche Zahlenangabe aus Exposé-Texten („2.560.000 €“, „ca. 454,5 m²“) als Zahl. */
export function zahlAus(wert: unknown): number | null {
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : null;
  if (typeof wert !== "string") return null;
  let t = wert.replace(/[^\d,.-]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function feld(z: ExposeZeile, name: string): unknown {
  return z.felder?.[name]?.value ?? null;
}

function quantil(sortiert: number[], q: number): number {
  const pos = (sortiert.length - 1) * q;
  const u = Math.floor(pos);
  const o = Math.ceil(pos);
  return sortiert[u] + (sortiert[o] - sortiert[u]) * (pos - u);
}

/** Median und Quartile; null unter der Mindestfallzahl, damit keine Einzelfälle erkennbar sind. */
export function verteilung(
  werte: number[],
  mindest = MINDEST_FALLZAHL,
): Verteilung | null {
  const s = werte.filter((w) => Number.isFinite(w)).sort((a, b) => a - b);
  if (s.length < mindest) return null;
  return {
    median: quantil(s, 0.5),
    p25: quantil(s, 0.25),
    p75: quantil(s, 0.75),
    n: s.length,
  };
}

export function imZeitraum(
  datum: string | null | undefined,
  von: string,
  bis: string,
): boolean {
  if (!datum) return false;
  const tag = datum.slice(0, 10);
  return tag >= von && tag <= bis;
}

type Angebot = {
  teilmarkt: Teilmarkt;
  objektart: string | null;
  preis: number | null;
  faktor: number | null;
  preisM2: number | null;
  mieteM2: number | null;
};

/** Plausibilitätsgrenzen gegen Lesefehler der KI (z. B. Monats- statt Jahresmiete). */
const GRENZEN = {
  faktor: [5, 60],
  preisM2: [300, 20_000],
  mieteM2: [2, 60],
} as const;

function inGrenzen(w: number | null, [min, max]: readonly [number, number]) {
  return w != null && w >= min && w <= max ? w : null;
}

export function angebotAus(z: ExposeZeile): Angebot {
  const preis = zahlAus(feld(z, "angebotspreis"));
  const miete = zahlAus(feld(z, "jahresnettokaltmiete"));
  const flaeche =
    zahlAus(feld(z, "mietflaecheGesamt")) ??
    (() => {
      const w = zahlAus(feld(z, "wohnflaeche"));
      const g = zahlAus(feld(z, "gewerbeflaeche"));
      return w != null || g != null ? (w ?? 0) + (g ?? 0) : null;
    })();
  const art = feld(z, "objektart");
  return {
    teilmarkt: teilmarktAus(
      feld(z, "stadt") as string | null,
      feld(z, "plz") as string | null,
    ),
    objektart: typeof art === "string" && art.trim() ? art.trim() : null,
    preis: preis && preis > 10_000 ? preis : null,
    faktor: preis && miete ? inGrenzen(preis / miete, GRENZEN.faktor) : null,
    preisM2:
      preis && flaeche ? inGrenzen(preis / flaeche, GRENZEN.preisM2) : null,
    mieteM2:
      miete && flaeche
        ? inGrenzen(miete / 12 / flaeche, GRENZEN.mieteM2)
        : null,
  };
}

function zeileAus(
  teilmarkt: AngebotsZeile["teilmarkt"],
  liste: Angebot[],
): AngebotsZeile {
  const zahlen = (f: (a: Angebot) => number | null) =>
    liste.map(f).filter((w): w is number => w != null);
  return {
    teilmarkt,
    angebote: liste.length,
    mitPreis: liste.filter((a) => a.preis != null).length,
    faktor: verteilung(zahlen((a) => a.faktor)),
    preisM2: verteilung(zahlen((a) => a.preisM2)),
    mieteM2: verteilung(zahlen((a) => a.mieteM2)),
    volumen: zahlen((a) => a.preis).reduce((s, w) => s + w, 0),
  };
}

/** Objektart-Bezeichnungen der Exposés vereinheitlichen. */
export function objektartGruppe(art: string | null): string {
  const a = (art ?? "").toLowerCase();
  if (!a) return "Ohne Angabe";
  if (/wohn.*gesch|wgh/.test(a)) return "Wohn- und Geschäftshaus";
  if (/mehrfamilien|mfh|zinshaus|wohnanlage|wohnhaus|apartment/.test(a))
    return "Mehrfamilienhaus";
  if (/gesch[aä]ftshaus|b[uü]ro|einzelhandel|gewerbe|praxis/.test(a))
    return "Gewerbe";
  return "Sonstige";
}

function zaehle(werte: string[]): { label: string; wert: number }[] {
  const m = new Map<string, number>();
  for (const w of werte) m.set(w, (m.get(w) ?? 0) + 1);
  return [...m.entries()]
    .map(([label, wert]) => ({ label, wert }))
    .sort((a, b) => b.wert - a.wert || a.label.localeCompare(b.label));
}

export function angebotsmarkt(
  exposes: ExposeZeile[],
  von: string,
  bis: string,
  vorVon: string,
  vorBis: string,
): Angebotsmarkt {
  const aktuell = exposes
    .filter((e) => imZeitraum(e.eingegangen_am, von, bis))
    .map(angebotAus);
  const vor = exposes
    .filter((e) => imZeitraum(e.eingegangen_am, vorVon, vorBis))
    .map(angebotAus);
  const zeilen: AngebotsZeile[] = [];
  for (const t of [...TEILMAERKTE, "Sonstige"] as const) {
    const liste = aktuell.filter((a) => a.teilmarkt === t);
    if (liste.length) zeilen.push(zeileAus(t, liste));
  }
  zeilen.push(zeileAus("Gesamt", aktuell));
  const daten = exposes
    .map((e) => e.eingegangen_am?.slice(0, 10))
    .filter((d): d is string => !!d)
    .sort();
  return {
    zeilen,
    objektarten: zaehle(aktuell.map((a) => objektartGruppe(a.objektart))),
    vorperiode: vor.length ? zeileAus("Gesamt", vor) : null,
    ersterEingang: daten[0] ?? null,
  };
}

const VOLUMENBAENDER: { label: string; bis: number }[] = [
  { label: "bis 2,5 Mio. €", bis: 2_500_000 },
  { label: "2,5 bis 5 Mio. €", bis: 5_000_000 },
  { label: "5 bis 10 Mio. €", bis: 10_000_000 },
  { label: "10 bis 25 Mio. €", bis: 25_000_000 },
  { label: "über 25 Mio. €", bis: Infinity },
];

/** Das Volumenband eines Profils richtet sich nach dem Höchstvolumen, sonst nach dem Mindestvolumen. */
export function volumenband(
  min: number | null,
  max: number | null,
): string | null {
  const bezug = max ?? min;
  // Profile mit Kleinstbeträgen sind in Salesforce falsch gepflegt (z. B. 100.000 € als Volumen).
  if (bezug == null || bezug < 250_000) return null;
  return VOLUMENBAENDER.find((b) => bezug <= b.bis)!.label;
}

const FOKUS_REGIONEN = ["Köln", "Düsseldorf", "Bonn", "Leverkusen", "Neuss"];

export function kaeuferindex(profile: AnkaufsprofilZeile[]): Kaeuferindex {
  const baender: string[] = [];
  const maxima: number[] = [];
  for (const p of profile) {
    const min = zahlAus(p.volumen_min);
    const max = zahlAus(p.volumen_max);
    const band = volumenband(min, max);
    if (band) baender.push(band);
    if (max != null && max >= 250_000) maxima.push(max);
  }
  const reihenfolge = new Map(VOLUMENBAENDER.map((b, i) => [b.label, i]));
  const volumenbaender = zaehle(baender).sort(
    (a, b) => reihenfolge.get(a.label)! - reihenfolge.get(b.label)!,
  );
  const regionen = FOKUS_REGIONEN.map((r) => ({
    label: r,
    wert: profile.filter((p) => (p.regionen ?? []).includes(r)).length,
  }));
  const assetklasse = (a: string) => a.replace(/\s*\(.*\)$/, "").trim();
  const v = verteilung(maxima);
  return {
    profile: profile.length,
    mitVolumen: baender.length,
    regionen,
    volumenbaender,
    assetklassen: zaehle(
      profile.flatMap((p) => [
        ...new Set((p.assetklassen ?? []).map(assetklasse)),
      ]),
    ),
    investorTypen: zaehle(
      profile.map((p) => p.investor_typ).filter((t): t is string => !!t),
    ),
    medianVolumenMax: v?.median ?? null,
  };
}

export function vermarktung(
  mandate: MandatZeile[],
  deals: DealZeile[],
  von: string,
  bis: string,
): Vermarktung {
  const abgeschlossen = deals.filter(
    (d) =>
      /invoice paid|closed won|notar|beurkund/i.test(d.phase ?? "") &&
      imZeitraum(d.abschluss_am, von, bis),
  );
  return {
    neueMandate: mandate.filter((m) => imZeitraum(m.beauftragt_am, von, bis))
      .length,
    abschluesse: abgeschlossen.length,
    abschlussVolumen: abgeschlossen.reduce(
      (s, d) => s + (zahlAus(d.betrag) ?? 0),
      0,
    ),
    verloren: deals.filter(
      (d) =>
        /closed lost/i.test(d.phase ?? "") &&
        imZeitraum(d.abschluss_am, von, bis),
    ).length,
  };
}

export function radarAuswahl(
  zeilen: RadarZeile[],
  von: string,
  bis: string,
): { kaeufer: number; verkaeufer: number; auswahl: RadarMeldung[] } {
  const imZr = zeilen.filter((z) =>
    imZeitraum(z.ereignis_am ?? z.created_at, von, bis),
  );
  return {
    kaeufer: imZr.filter((z) => z.seite === "kaeufer").length,
    verkaeufer: imZr.filter((z) => z.seite === "verkaeufer").length,
    auswahl: [...imZr]
      .sort((a, b) => b.relevanz - a.relevanz)
      .slice(0, 8)
      .map((z) => ({
        seite: z.seite,
        akteur: z.akteur,
        ereignis: z.ereignis,
        ort: z.ort,
        volumen: zahlAus(z.volumen_eur),
        datum: z.ereignis_am,
        url: z.quelle_url,
      })),
  };
}
