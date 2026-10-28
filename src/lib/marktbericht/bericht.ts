/**
 * Gemeinsame Aufbereitung für Editor, KI und PDF: Zahlenformate, die Kennzahlenkacheln
 * „Auf einen Blick“ und der Kennzahlen-Text, aus dem die KI ihre Texte schreibt.
 */

import { zinsStand } from "./bundesbank";
import {
  bruttorendite,
  deutschland,
  standortZeilen,
  type MarktArt,
} from "./standorte";
import {
  MINDEST_FALLZAHL,
  periodeText,
  type Benchmark,
  type MarktberichtKennzahlen,
  type Verteilung,
} from "./typen";

const de1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const de2 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const de0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

export const fmt = {
  faktor: (w: number) => de1.format(w),
  euroM2: (w: number) => `${de0.format(Math.round(w / 10) * 10)} €/m²`,
  mieteM2: (w: number) => `${de2.format(w)} €/m²`,
  prozent: (w: number) => `${de2.format(w)} %`,
  /** Renditen mit einer Nachkommastelle, z. B. „4,7 %“. */
  rendite: (w: number) => `${de1.format(w)} %`,
  ganz: (w: number) => de0.format(w),
  mio: (w: number) => `${de1.format(w / 1_000_000)} Mio. €`,
  bp: (w: number) => `${w > 0 ? "+" : w < 0 ? "-" : "±"}${Math.abs(w)} bp`,
  datum: (iso: string) => {
    const [j, m, t] = iso.slice(0, 10).split("-");
    return `${t}.${m}.${j}`;
  },
  wert: (w: number, einheit: string) => {
    const e = einheit.trim();
    if (/mio/i.test(e)) return `${de0.format(w)} ${e}`;
    return `${Number.isInteger(w) ? de0.format(w) : de2.format(w)} ${e}`.trim();
  },
};

export function spanne(v: Verteilung | null, f: (w: number) => string): string {
  return v ? `${f(v.p25)} – ${f(v.p75)}` : "–";
}

export function median(v: Verteilung | null, f: (w: number) => string): string {
  return v ? f(v.median) : `n < ${MINDEST_FALLZAHL}`;
}

/** Zeitraum der laufenden Erhebung, falls der Bericht sie statt der Periode zeigt. */
export function erhebungZeitraum(
  k: MarktberichtKennzahlen,
  teil: "angebot" | "radar",
): string | null {
  const e = k.erhebung;
  if (!e?.[teil]) return null;
  return `${fmt.datum(e.von)} bis ${fmt.datum(e.bis)}`;
}

export type Kachel = {
  wert: string;
  label: string;
  veraenderung: string | null;
  richtung: "hoch" | "runter" | null;
  quelle: string;
};

function richtungAus(delta: number | null): Kachel["richtung"] {
  if (delta == null || delta === 0) return null;
  return delta > 0 ? "hoch" : "runter";
}

function richtungAusText(v: string | null): Kachel["richtung"] {
  if (!v) return null;
  if (/^\s*\+/.test(v)) return "hoch";
  if (/^\s*[-−]/.test(v)) return "runter";
  return null;
}

/** „06/2026“ aus einem ISO-Datum. */
export function monatJahr(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Sechs Kennzahlen für „Auf einen Blick“, ausgewählt für Privatanleger: Faktoren und Mieten in
 * Köln und Düsseldorf, Bauzins, Rendite im Angebot. Ohne Herausgeber, nur mit Stand.
 */
export function kacheln(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
): Kachel[] {
  const liste: Kachel[] = [];
  const zeilen = standortZeilen(k, benchmarks);
  const top = zeilen.filter(
    (z) => z.standort === "Köln" || z.standort === "Düsseldorf",
  );
  const laufend = erhebungZeitraum(k, "angebot");
  const angebotsStand = laufend
    ? `Angebote ${laufend}`
    : `Angebote ${periodeText(k.periode)}`;
  for (const z of top) {
    const f = z.markt.faktor;
    if (f)
      liste.push({
        wert: f.text,
        label: `Kaufpreisfaktor ${z.standort}`,
        veraenderung: f.veraenderung ?? "Mehrfamilienhäuser Bestand",
        richtung: richtungAusText(f.veraenderung),
        quelle: `Stand ${monatJahr(f.stichtag)}`,
      });
    else if (z.angebotsfaktor)
      liste.push({
        wert: fmt.faktor(z.angebotsfaktor),
        label: `Angebotsfaktor ${z.standort}`,
        veraenderung: null,
        richtung: null,
        quelle: angebotsStand,
      });
  }
  for (const z of top) {
    const m = z.markt.miete;
    if (m)
      liste.push({
        wert: m.text,
        label: `Angebotsmiete ${z.standort}`,
        veraenderung: m.veraenderung,
        richtung: richtungAusText(m.veraenderung),
        quelle: `Stand ${monatJahr(m.stichtag)}`,
      });
  }
  const bauzins = zinsStand(k.zinsen.reihen.find((r) => r.id === "bauzins"));
  if (bauzins)
    liste.push({
      wert: fmt.prozent(bauzins.wert),
      label: "Bauzins 10 Jahre",
      veraenderung:
        bauzins.deltaBp != null
          ? `${fmt.bp(bauzins.deltaBp)} ggü. Vorjahr`
          : null,
      richtung: richtungAus(bauzins.deltaBp),
      quelle: `Stand ${bauzins.monat.slice(5, 7)}/${bauzins.monat.slice(0, 4)}`,
    });
  const gesamt = k.angebot.zeilen.find((z) => z.teilmarkt === "Gesamt");
  const rendite = bruttorendite(gesamt?.faktor?.median);
  if (rendite != null)
    liste.push({
      wert: fmt.rendite(rendite),
      label: "Bruttorendite im Angebot",
      veraenderung: `Faktor ${fmt.faktor(gesamt!.faktor!.median)}`,
      richtung: null,
      quelle: angebotsStand,
    });
  const d = deutschland(benchmarks);
  for (const [w, label] of [
    [d.rendite, "Spitzenrendite Wohnen Top-7"],
    [d.umsatz, "Wohninvestment Deutschland"],
  ] as const) {
    if (liste.length >= 6 || !w) continue;
    liste.push({
      wert: w.text,
      label,
      veraenderung: w.veraenderung,
      richtung: richtungAusText(w.veraenderung),
      quelle: `Stand ${monatJahr(w.stichtag)}`,
    });
  }
  return liste.slice(0, 6);
}

const ART_TEXT: Record<MarktArt, string> = {
  faktor: "Kaufpreisfaktor Mehrfamilienhäuser (Bestand)",
  kaufpreis: "Kaufpreis Mehrfamilienhäuser je m² Wohnfläche",
  miete: "Angebotsmiete Wohnen (Neuvermietung)",
  rendite: "Spitzenrendite Wohnen",
  liegenschaftszins: "Liegenschaftszins Mietwohnhäuser",
  umsatz: "Umsatz Zinshäuser/Mehrfamilienhäuser",
};

/**
 * Alle Kennzahlen als Text für die KI, ohne Herausgeber. Jede Zahl, die im Bericht stehen darf,
 * steht hier (abgeleitete Renditen inklusive).
 */
export function kennzahlenText(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
): string {
  const laufend = erhebungZeitraum(k, "angebot");
  const z: string[] = [
    `Bericht: Marktbericht Zinshäuser Rheinland, ${periodeText(k.periode)} (${fmt.datum(k.von)} bis ${fmt.datum(k.bis)}), Stand ${fmt.datum(k.stichtag)}${k.vorlaeufig ? ", Periode läuft noch (vorläufige Zahlen)" : ""}.`,
    "",
    "Standorte (Marktdaten, Stand jeweils in Klammern):",
  ];
  const zeilen = standortZeilen(k, benchmarks);
  for (const s of zeilen) {
    const teile = (Object.keys(ART_TEXT) as MarktArt[])
      .filter((a) => s.markt[a])
      .map((a) => {
        const w = s.markt[a]!;
        return `${ART_TEXT[a]} ${w.text}${w.veraenderung ? ` (${w.veraenderung})` : ""} (${monatJahr(w.stichtag)})`;
      });
    if (s.angebotsfaktor)
      teile.push(
        `Angebotsfaktor ${fmt.faktor(s.angebotsfaktor)}, entspricht Bruttorendite ${fmt.rendite(s.bruttorendite!)}${s.angebotspreisM2 ? `, Angebotspreis ${fmt.euroM2(s.angebotspreisM2)}` : ""} (eigene Angebotsdaten)`,
      );
    z.push(`- ${s.standort}: ${teile.join("; ") || "keine belastbaren Werte"}`);
  }
  const d = deutschland(benchmarks);
  if (d.rendite)
    z.push(
      `- Deutschland Top-7: Spitzenrendite Wohnen ${d.rendite.text}${d.rendite.veraenderung ? ` (${d.rendite.veraenderung})` : ""} (${monatJahr(d.rendite.stichtag)})`,
    );
  if (d.umsatz)
    z.push(
      `- Deutschland: Wohninvestment-Transaktionsvolumen ${d.umsatz.text}${d.umsatz.veraenderung ? ` (${d.umsatz.veraenderung})` : ""} (${monatJahr(d.umsatz.stichtag)})`,
    );

  z.push(
    "",
    laufend
      ? `Eigene Angebotsdaten (Zinshaus-Angebote, die Grenz & Co. erhalten hat; Werte der letzten sechs Monate ${laufend}, nicht der Berichtsperiode, im Text als „aktuelle Angebote“ bezeichnen; Werte nur ab ${MINDEST_FALLZAHL} Fällen):`
      : `Eigene Angebotsdaten (Zinshaus-Angebote, die Grenz & Co. erhalten hat; Werte nur ab ${MINDEST_FALLZAHL} Fällen):`,
  );
  for (const r of k.angebot.zeilen) {
    const br = bruttorendite(r.faktor?.median);
    z.push(
      `- ${r.teilmarkt}: ${r.angebote} Angebote; Faktor Median ${median(r.faktor, fmt.faktor)} (Spanne ${spanne(r.faktor, fmt.faktor)})${br != null ? `, Bruttorendite ${fmt.rendite(br)}` : ""}; Preis ${median(r.preisM2, fmt.euroM2)}; Ist-Miete ${median(r.mieteM2, fmt.mieteM2)}`,
    );
  }

  z.push("", "Finanzierung:");
  const bauzins = zinsStand(k.zinsen.reihen.find((r) => r.id === "bauzins"));
  for (const r of k.zinsen.reihen) {
    const s = zinsStand(r);
    if (s)
      z.push(
        `- ${r.label}: ${fmt.prozent(s.wert)} im ${s.monat}${s.deltaBp != null ? `, ${fmt.bp(s.deltaBp)} gegenüber Vorjahresmonat` : ""}`,
      );
  }
  const gesamt = k.angebot.zeilen.find((r) => r.teilmarkt === "Gesamt");
  const br = bruttorendite(gesamt?.faktor?.median);
  if (bauzins && br != null) {
    const abstand = Math.round((br - bauzins.wert) * 100) / 100;
    z.push(
      `- Abstand Bruttorendite im Angebot (${fmt.rendite(br)}) zum Bauzins (${fmt.prozent(bauzins.wert)}): ${abstand >= 0 ? "+" : "-"}${fmt.prozent(Math.abs(abstand)).replace(" %", "")} Prozentpunkte`,
    );
  }

  z.push(
    "",
    `Nachfrage (Investorenbasis von Grenz & Co., ${k.kaeufer.profile} Ankaufsprofile, ${k.kaeufer.mitVolumen} mit Volumen${k.kaeufer.medianVolumenMax ? `, mittleres Höchstvolumen ${fmt.mio(k.kaeufer.medianVolumenMax)}` : ""}):`,
    `- Gesuchte Volumina: ${k.kaeufer.volumenbaender.map((r) => `${r.label} ${r.wert}`).join(", ") || "–"}`,
    `- Strategien: ${k.kaeufer.assetklassen.map((r) => `${r.label} ${r.wert}`).join(", ") || "–"}`,
    `- Suchregionen: ${k.kaeufer.regionen.map((r) => `${r.label} ${r.wert}`).join(", ") || "–"}`,
  );

  const gepr = benchmarks.filter((b) => b.geprueft);
  z.push("", "Weitere Marktdaten (ohne Herausgeber verwenden):");
  if (!gepr.length) z.push("- keine");
  for (const b of gepr)
    z.push(
      `- ${b.kennzahl}${b.region ? `, ${b.region}` : ""}: ${fmt.wert(b.wert, b.einheit)}${b.veraenderung ? ` (${b.veraenderung})` : ""} (${monatJahr(b.stichtag)})`,
    );
  return z.join("\n");
}

/** Zahlen in einem Text (deutsches Format), z. B. „21,4“, „2.540“, „3,81“. */
export function zahlenIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((z) =>
    z.replace(/[.,]$/, ""),
  );
}

/**
 * Prüft, ob jede Zahl eines KI-Textes in den Kennzahlen vorkommt. Kleine Zahlen bis 12
 * (Aufzählungen, Monate) und Jahreszahlen sind erlaubt.
 */
export function unbelegteZahlen(text: string, kontext: string): string[] {
  const erlaubt = new Set(zahlenIn(kontext));
  return [
    ...new Set(
      zahlenIn(text).filter((z) => {
        if (erlaubt.has(z)) return false;
        const n = Number(z.replace(/\./g, "").replace(",", "."));
        if (Number.isInteger(n) && (n <= 12 || (n >= 2000 && n <= 2100)))
          return false;
        return true;
      }),
    ),
  ];
}
