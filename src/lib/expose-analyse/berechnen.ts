/**
 * Auswertung der Ankauf-Exposés aus `postfach_exposes`.
 * Reine Funktionen, damit sie ohne Datenbank testbar bleiben.
 */

import type { ExposeAnalyseDto } from "./types";

/** Felder, wie sie die KI-Analyse in `postfach_exposes.felder` ablegt. */
export type RohExpose = {
  id: string;
  eingegangenAm: string | null;
  status: string;
  absenderName: string | null;
  betreff: string | null;
  exportiertAm: string | null;
  felder: Record<string, { value: string | null } | undefined> | null;
};

function feld(e: RohExpose, id: string): string | null {
  const v = e.felder?.[id]?.value;
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

/** „1.234,5“, „1234.5“, „1 234“ → Zahl; alles andere → null. */
export function zahl(wert: string | null): number | null {
  if (!wert) return null;
  let t = wert.replace(/[^\d,.-]/g, "");
  if (t.includes(",") && t.includes(".")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function runde(n: number, stellen = 2): number {
  const f = 10 ** stellen;
  return Math.round(n * f) / f;
}

function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Montag der Kalenderwoche als ISO-Datum. */
function wochenStart(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const tag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - tag);
  return d.toISOString().slice(0, 10);
}

/** Stadtteil-Zusätze zusammenfassen: „Mönchengladbach-Wickrath“ → „Mönchengladbach“. */
export function stadtNormalisiert(stadt: string | null): string | null {
  if (!stadt) return null;
  const basis = stadt.split(/\s*[-/(,]\s*/)[0].trim();
  return basis || null;
}

const BAUJAHR_KLASSEN: Array<{ label: string; bis: number }> = [
  { label: "bis 1918", bis: 1918 },
  { label: "1919–1948", bis: 1948 },
  { label: "1949–1977", bis: 1977 },
  { label: "1978–1999", bis: 1999 },
  { label: "ab 2000", bis: Infinity },
];

const ENERGIE_KLASSEN = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];

function zaehle<T extends string>(
  werte: Array<T | null>,
  limit?: number,
): Array<{ name: string; anzahl: number }> {
  const m = new Map<string, number>();
  for (const w of werte) {
    if (!w) continue;
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  const liste = [...m.entries()]
    .map(([name, anzahl]) => ({ name, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name));
  return limit ? liste.slice(0, limit) : liste;
}

/** Kennzahlen eines einzelnen Exposés aus den KI-Feldern. */
export function objektAusExpose(e: RohExpose) {
  const preis = zahl(feld(e, "angebotspreis"));
  const miete = zahl(feld(e, "jahresnettokaltmiete"));
  const flaeche =
    zahl(feld(e, "mietflaecheGesamt")) ?? zahl(feld(e, "wohnflaeche"));
  const baujahrRoh = zahl(feld(e, "baujahr"));
  const baujahr =
    baujahrRoh && baujahrRoh >= 1700 && baujahrRoh <= 2100
      ? Math.round(baujahrRoh)
      : null;
  const faktor = preis && miete ? preis / miete : null;
  return {
    id: e.id,
    eingegangenAm: e.eingegangenAm,
    status: e.status,
    exportiert: Boolean(e.exportiertAm) || e.status === "exportiert",
    adresse: feld(e, "objektadresse"),
    plz: feld(e, "plz"),
    stadt: stadtNormalisiert(feld(e, "stadt")),
    objektart: feld(e, "objektart"),
    makler: feld(e, "makler") ?? e.absenderName?.trim() ?? null,
    energieklasse: feld(e, "energieausweis")?.toUpperCase() ?? null,
    einheiten: zahl(feld(e, "anzahlWohnungen")),
    baujahr,
    flaeche,
    preis,
    miete,
    faktor: faktor && faktor > 2 && faktor < 80 ? runde(faktor, 1) : null,
    rendite:
      faktor && faktor > 2 && faktor < 80 ? runde(100 / faktor, 2) : null,
    mieteQm: miete && flaeche ? runde(miete / 12 / flaeche) : null,
    preisQm: preis && flaeche ? Math.round(preis / flaeche) : null,
    betreff: e.betreff,
  };
}

export type ExposeObjekt = ReturnType<typeof objektAusExpose>;

export function berechneExposeAnalyse(exposes: RohExpose[]): ExposeAnalyseDto {
  const objekte = exposes.map(objektAusExpose);

  const analysiert = objekte.filter(
    (o) => o.status !== "neu" && o.status !== "fehler",
  );
  const mitMiete = objekte.filter((o) => o.miete);
  const mitPreis = objekte.filter((o) => o.preis);
  const faktoren = objekte.flatMap((o) => (o.faktor ? [o.faktor] : []));
  const mietenQm = objekte.flatMap((o) => (o.mieteQm ? [o.mieteQm] : []));
  const preiseQm = objekte.flatMap((o) => (o.preisQm ? [o.preisQm] : []));

  // Eingänge je Woche, lückenlos vom ersten bis zum letzten Eingang.
  const daten = objekte
    .flatMap((o) => (o.eingegangenAm ? [o.eingegangenAm.slice(0, 10)] : []))
    .sort();
  const jeWoche = new Map<string, { anzahl: number; exportiert: number }>();
  if (daten.length) {
    const ende = wochenStart(daten[daten.length - 1]);
    for (
      let w = wochenStart(daten[0]);
      w <= ende;
      w = new Date(Date.parse(`${w}T00:00:00Z`) + 7 * 864e5)
        .toISOString()
        .slice(0, 10)
    ) {
      jeWoche.set(w, { anzahl: 0, exportiert: 0 });
    }
  }
  for (const o of objekte) {
    if (!o.eingegangenAm) continue;
    const w = jeWoche.get(wochenStart(o.eingegangenAm));
    if (!w) continue;
    w.anzahl++;
    if (o.exportiert) w.exportiert++;
  }

  // Wochentag + Uhrzeit (Europe/Berlin) der Eingänge.
  const heatmap = Array.from(
    { length: 7 },
    () => Array(24).fill(0) as number[],
  );
  const wochentagFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const TAGE = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const o of objekte) {
    if (!o.eingegangenAm) continue;
    const teile = wochentagFmt.formatToParts(new Date(o.eingegangenAm));
    const tag = TAGE.indexOf(
      teile.find((t) => t.type === "weekday")?.value ?? "",
    );
    const stunde = Number(teile.find((t) => t.type === "hour")?.value);
    if (tag >= 0 && stunde >= 0 && stunde < 24) heatmap[tag][stunde]++;
  }

  // Makler-Ranking mit Volumen und Ø Faktor.
  const jeMakler = new Map<
    string,
    { anzahl: number; miete: number; faktoren: number[]; staedte: Set<string> }
  >();
  for (const o of objekte) {
    if (!o.makler) continue;
    const m = jeMakler.get(o.makler) ?? {
      anzahl: 0,
      miete: 0,
      faktoren: [],
      staedte: new Set<string>(),
    };
    m.anzahl++;
    m.miete += o.miete ?? 0;
    if (o.faktor) m.faktoren.push(o.faktor);
    if (o.stadt) m.staedte.add(o.stadt);
    jeMakler.set(o.makler, m);
  }

  // Städte mit Kennzahlen.
  const jeStadt = new Map<
    string,
    { anzahl: number; mietenQm: number[]; faktoren: number[]; miete: number }
  >();
  for (const o of objekte) {
    if (!o.stadt) continue;
    const s = jeStadt.get(o.stadt) ?? {
      anzahl: 0,
      mietenQm: [],
      faktoren: [],
      miete: 0,
    };
    s.anzahl++;
    s.miete += o.miete ?? 0;
    if (o.mieteQm) s.mietenQm.push(o.mieteQm);
    if (o.faktor) s.faktoren.push(o.faktor);
    jeStadt.set(o.stadt, s);
  }

  const baujahre = BAUJAHR_KLASSEN.map((k, i) => ({
    name: k.label,
    anzahl: objekte.filter(
      (o) =>
        o.baujahr !== null &&
        o.baujahr <= k.bis &&
        (i === 0 || o.baujahr > BAUJAHR_KLASSEN[i - 1].bis),
    ).length,
  }));

  const energie = ENERGIE_KLASSEN.map((k) => ({
    name: k,
    anzahl: objekte.filter((o) => o.energieklasse === k).length,
  }));

  const groessen = [
    { name: "bis 5 WE", von: 0, bis: 5 },
    { name: "6–10 WE", von: 6, bis: 10 },
    { name: "11–20 WE", von: 11, bis: 20 },
    { name: "21–50 WE", von: 21, bis: 50 },
    { name: "über 50 WE", von: 51, bis: Infinity },
  ].map((g) => ({
    name: g.name,
    anzahl: objekte.filter(
      (o) =>
        o.einheiten !== null && o.einheiten >= g.von && o.einheiten <= g.bis,
    ).length,
  }));

  const mieteGesamt = mitMiete.reduce((s, o) => s + (o.miete ?? 0), 0);
  const flaecheGesamt = objekte.reduce((s, o) => s + (o.flaeche ?? 0), 0);
  const medianFaktor = median(faktoren);

  return {
    anzahl: objekte.length,
    analysiert: analysiert.length,
    exportiert: objekte.filter((o) => o.exportiert).length,
    fehler: objekte.filter((o) => o.status === "fehler").length,
    erstesDatum: daten[0] ?? null,
    letztesDatum: daten[daten.length - 1] ?? null,
    mitMiete: mitMiete.length,
    mitPreis: mitPreis.length,
    mieteGesamt: Math.round(mieteGesamt),
    flaecheGesamt: Math.round(flaecheGesamt),
    medianMieteQm: median(mietenQm) !== null ? runde(median(mietenQm)!) : null,
    medianPreisQm:
      median(preiseQm) !== null ? Math.round(median(preiseQm)!) : null,
    medianFaktor: medianFaktor !== null ? runde(medianFaktor, 1) : null,
    medianRendite: medianFaktor ? runde(100 / medianFaktor, 2) : null,
    wochen: [...jeWoche.entries()].map(([woche, w]) => ({ woche, ...w })),
    heatmap,
    objektarten: zaehle(objekte.map((o) => o.objektart)),
    staedte: [...jeStadt.entries()]
      .map(([name, s]) => ({
        name,
        anzahl: s.anzahl,
        miete: Math.round(s.miete),
        medianMieteQm: s.mietenQm.length ? runde(median(s.mietenQm)!) : null,
        medianFaktor: s.faktoren.length ? runde(median(s.faktoren)!, 1) : null,
      }))
      .sort((a, b) => b.anzahl - a.anzahl || b.miete - a.miete)
      .slice(0, 12),
    makler: [...jeMakler.entries()]
      .map(([name, m]) => ({
        name,
        anzahl: m.anzahl,
        miete: Math.round(m.miete),
        medianFaktor: m.faktoren.length ? runde(median(m.faktoren)!, 1) : null,
        staedte: [...m.staedte].sort().slice(0, 4),
      }))
      .sort((a, b) => b.anzahl - a.anzahl || b.miete - a.miete)
      .slice(0, 12),
    baujahre,
    energie,
    groessen,
    streuung: objekte.flatMap((o) =>
      o.mieteQm && o.flaeche
        ? [
            {
              id: o.id,
              flaeche: o.flaeche,
              mieteQm: o.mieteQm,
              miete: o.miete ?? 0,
              label:
                [o.adresse, o.stadt].filter(Boolean).join(", ") || "Objekt",
            },
          ]
        : [],
    ),
    objekte: objekte
      .sort((a, b) =>
        (b.eingegangenAm ?? "").localeCompare(a.eingegangenAm ?? ""),
      )
      .map((o) => ({
        id: o.id,
        eingegangenAm: o.eingegangenAm,
        adresse: o.adresse,
        stadt: o.stadt,
        objektart: o.objektart,
        makler: o.makler,
        einheiten: o.einheiten,
        flaeche: o.flaeche,
        baujahr: o.baujahr,
        miete: o.miete,
        preis: o.preis,
        faktor: o.faktor,
        mieteQm: o.mieteQm,
        exportiert: o.exportiert,
      })),
  };
}
