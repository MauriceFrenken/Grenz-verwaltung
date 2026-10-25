/**
 * Gemeinsame Aufbereitung für Editor, KI und PDF: Zahlenformate, die Kennzahlenkacheln
 * „Auf einen Blick“ und der Kennzahlen-Text, aus dem die KI ihre Texte schreibt.
 */

import { zinsStand } from "./bundesbank";
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

/** Bis zu sechs Kennzahlen für „Auf einen Blick“: zuerst eigene Daten, dann Zins, dann zitierte Werte. */
export function kacheln(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
): Kachel[] {
  const liste: Kachel[] = [];
  const gesamt = k.angebot.zeilen.find((z) => z.teilmarkt === "Gesamt");
  const vor = k.angebot.vorperiode;
  if (gesamt?.faktor) {
    const delta = vor?.faktor ? gesamt.faktor.median - vor.faktor.median : null;
    liste.push({
      wert: fmt.faktor(gesamt.faktor.median),
      label: "Angebotsfaktor (Median)",
      veraenderung:
        delta != null
          ? `${delta >= 0 ? "+" : "-"}${fmt.faktor(Math.abs(delta))} ggü. Vorjahr`
          : null,
      richtung: richtungAus(delta),
      quelle: `Grenz Exposé-Eingang, n = ${gesamt.faktor.n}`,
    });
  }
  if (gesamt?.preisM2)
    liste.push({
      wert: fmt.euroM2(gesamt.preisM2.median),
      label: "Angebotspreis (Median)",
      veraenderung: null,
      richtung: null,
      quelle: `Grenz Exposé-Eingang, n = ${gesamt.preisM2.n}`,
    });
  if (gesamt)
    liste.push({
      wert: fmt.ganz(gesamt.angebote),
      label: "Angebote im Eingang",
      veraenderung: vor ? `${vor.angebote} im Vorjahreszeitraum` : null,
      richtung: vor ? richtungAus(gesamt.angebote - vor.angebote) : null,
      quelle: "Grenz Exposé-Eingang",
    });
  const bauzins = zinsStand(k.zinsen.reihen.find((r) => r.id === "bauzins"));
  if (bauzins)
    liste.push({
      wert: fmt.prozent(bauzins.wert),
      label: "Bauzins 10 Jahre",
      veraenderung:
        bauzins.deltaBp != null ? `${fmt.bp(bauzins.deltaBp)} y/y` : null,
      richtung: richtungAus(bauzins.deltaBp),
      quelle: "Deutsche Bundesbank",
    });
  liste.push({
    wert: fmt.ganz(k.kaeufer.profile),
    label: "Ankaufsprofile im Bestand",
    veraenderung: k.kaeufer.medianVolumenMax
      ? `Median bis ${fmt.mio(k.kaeufer.medianVolumenMax)}`
      : null,
    richtung: null,
    quelle: "Grenz Investorendatenbank",
  });
  for (const b of benchmarks.filter((b) => b.geprueft)) {
    if (liste.length >= 6) break;
    liste.push({
      wert: fmt.wert(b.wert, b.einheit),
      label: `${b.kennzahl}${b.region ? ` ${b.region}` : ""}`,
      veraenderung: b.veraenderung ?? null,
      richtung: /^\+/.test(b.veraenderung ?? "")
        ? "hoch"
        : /^[-−]/.test(b.veraenderung ?? "")
          ? "runter"
          : null,
      quelle: `zitiert: ${b.quelle}`,
    });
  }
  return liste.slice(0, 6);
}

/** Alle Kennzahlen als Text für die KI. Jede Zahl, die im Bericht stehen darf, steht hier. */
export function kennzahlenText(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
): string {
  const z: string[] = [
    `Bericht: Marktbericht Zinshäuser Rheinland, ${periodeText(k.periode)} (${fmt.datum(k.von)} bis ${fmt.datum(k.bis)}), Stichtag ${fmt.datum(k.stichtag)}${k.vorlaeufig ? ", Periode läuft noch (vorläufige Zahlen)" : ""}.`,
    "",
    `Angebotsmarkt (Grenz Exposé-Eingang, Zinshäuser von Maklern und Eigentümern, erster Eingang ${k.angebot.ersterEingang ? fmt.datum(k.angebot.ersterEingang) : "–"}; Werte nur ab ${MINDEST_FALLZAHL} Fällen):`,
  ];
  for (const r of k.angebot.zeilen)
    z.push(
      `- ${r.teilmarkt}: ${r.angebote} Angebote, davon ${r.mitPreis} mit Preis; Faktor Median ${median(r.faktor, fmt.faktor)} (Spanne ${spanne(r.faktor, fmt.faktor)}); Preis ${median(r.preisM2, fmt.euroM2)} (Spanne ${spanne(r.preisM2, fmt.euroM2)}); Ist-Miete ${median(r.mieteM2, fmt.mieteM2)}`,
    );
  if (k.angebot.vorperiode) {
    const v = k.angebot.vorperiode;
    z.push(
      `- Vorjahreszeitraum gesamt: ${v.angebote} Angebote; Faktor Median ${median(v.faktor, fmt.faktor)}`,
    );
  } else
    z.push("- Vorjahreszeitraum: keine Daten (Erfassung lief noch nicht).");
  z.push(
    `- Objektarten: ${k.angebot.objektarten.map((o) => `${o.label} ${o.wert}`).join(", ")}`,
    "",
    `Nachfrage (Grenz Investorendatenbank, Ankaufsprofile aus Salesforce): ${k.kaeufer.profile} Profile, ${k.kaeufer.mitVolumen} mit Volumenangabe${k.kaeufer.medianVolumenMax ? `, Median-Höchstvolumen ${fmt.mio(k.kaeufer.medianVolumenMax)}` : ""}.`,
    `- Suchregionen: ${k.kaeufer.regionen.map((r) => `${r.label} ${r.wert}`).join(", ")}`,
    `- Volumenbänder: ${k.kaeufer.volumenbaender.map((r) => `${r.label} ${r.wert}`).join(", ") || "–"}`,
    `- Strategien: ${k.kaeufer.assetklassen.map((r) => `${r.label} ${r.wert}`).join(", ") || "–"}`,
    `- Investorentypen (soweit gepflegt): ${k.kaeufer.investorTypen.map((r) => `${r.label} ${r.wert}`).join(", ") || "–"}`,
    "",
    `Grenz-Vermarktung im Zeitraum (Salesforce): ${k.vermarktung.neueMandate} neue Mandate, ${k.vermarktung.abschluesse} Abschlüsse${k.vermarktung.abschlussVolumen ? ` (${fmt.mio(k.vermarktung.abschlussVolumen)})` : ""}, ${k.vermarktung.verloren} verlorene Interessenten.`,
    `Vorjahreszeitraum: ${k.vermarktungVorperiode.neueMandate} neue Mandate, ${k.vermarktungVorperiode.abschluesse} Abschlüsse${k.vermarktungVorperiode.abschlussVolumen ? ` (${fmt.mio(k.vermarktungVorperiode.abschlussVolumen)})` : ""}, ${k.vermarktungVorperiode.verloren} verlorene Interessenten.`,
    "",
    "Zinsumfeld (Deutsche Bundesbank):",
  );
  for (const r of k.zinsen.reihen) {
    const s = zinsStand(r);
    if (s)
      z.push(
        `- ${r.label}: ${fmt.prozent(s.wert)} im ${s.monat}${s.deltaBp != null ? `, ${fmt.bp(s.deltaBp)} gegenüber Vorjahresmonat` : ""}`,
      );
  }
  if (k.zinsen.fehler) z.push(`- Hinweis: ${k.zinsen.fehler}`);
  z.push(
    "",
    `Markt-Radar (Pressemeldungen): ${k.radar.kaeufer} Käufer-Meldungen, ${k.radar.verkaeufer} Verkäufer-Meldungen.`,
  );
  for (const m of k.radar.auswahl.slice(0, 5))
    z.push(
      `- ${m.akteur}: ${m.ereignis}${m.ort ? ` (${m.ort})` : ""}${m.volumen ? `, ${fmt.mio(m.volumen)}` : ""}`,
    );
  const gepr = benchmarks.filter((b) => b.geprueft);
  z.push(
    "",
    "Zitierte Vergleichswerte anderer Häuser (nur mit Quelle nennen):",
  );
  if (!gepr.length) z.push("- keine");
  for (const b of gepr)
    z.push(
      `- ${b.kennzahl}${b.region ? ` ${b.region}` : ""}: ${fmt.wert(b.wert, b.einheit)}${b.veraenderung ? ` (${b.veraenderung})` : ""}, Quelle ${b.quelle}, Stand ${fmt.datum(b.stichtag)}`,
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
