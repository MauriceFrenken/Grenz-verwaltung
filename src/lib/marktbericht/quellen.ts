/**
 * Bibliothek der Marktberichte anderer Häuser: reine Hilfsfunktionen für Download-Prüfung,
 * HTML-Text, automatische Belegprüfung der ausgelesenen Zitate und die Auswahl je Berichtsperiode.
 */

import { periodeVonBis, type Benchmark, type Periode } from "./typen";

export type DokumentStatus =
  | "neu"
  | "ausgelesen"
  | "gesperrt"
  | "fehler"
  | "ohne_werte";

export type MarktberichtQuelle = {
  id: string;
  kuerzel: string;
  name: string;
  suchauftrag: string;
  aktiv: boolean;
  zuletztGesucht: string | null;
  letzterFehler: string | null;
};

export type MarktberichtDokument = {
  id: string;
  quelleId: string;
  url: string;
  titel: string;
  art: "pdf" | "html";
  stichtag: string | null;
  region: string | null;
  status: DokumentStatus;
  fehler: string | null;
  seiten: number | null;
  kennzahlen: Benchmark[];
  gefundenAm: string;
  ausgelesenAm: string | null;
};

export const QUELLE_SPALTEN =
  "id, kuerzel, name, suchauftrag, aktiv, zuletzt_gesucht, letzter_fehler";
export const DOKUMENT_SPALTEN =
  "id, quelle_id, url, titel, art, stichtag, region, status, fehler, seiten, kennzahlen, gefunden_am, ausgelesen_am";

export function quelleAus(r: Record<string, unknown>): MarktberichtQuelle {
  return {
    id: String(r.id),
    kuerzel: String(r.kuerzel),
    name: String(r.name),
    suchauftrag: String(r.suchauftrag),
    aktiv: r.aktiv === true,
    zuletztGesucht: (r.zuletzt_gesucht as string) ?? null,
    letzterFehler: (r.letzter_fehler as string) ?? null,
  };
}

export function dokumentAus(r: Record<string, unknown>): MarktberichtDokument {
  return {
    id: String(r.id),
    quelleId: String(r.quelle_id),
    url: String(r.url),
    titel: String(r.titel),
    art: r.art === "html" ? "html" : "pdf",
    stichtag: (r.stichtag as string) ?? null,
    region: (r.region as string) ?? null,
    status: r.status as DokumentStatus,
    fehler: (r.fehler as string) ?? null,
    seiten: typeof r.seiten === "number" ? r.seiten : null,
    kennzahlen: Array.isArray(r.kennzahlen)
      ? (r.kennzahlen as Benchmark[])
      : [],
    gefundenAm: String(r.gefunden_am),
    ausgelesenAm: (r.ausgelesen_am as string) ?? null,
  };
}

/** Nur öffentliche http(s)-Adressen ohne IP-Literal, Port oder interne Namen. */
export function sichereUrl(roh: string): string | null {
  try {
    const u = new URL(roh.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".")) return null;
    if (/^[\d.]+$/.test(host) || host.includes(":")) return null;
    if (/(^|\.)(localhost|local|internal|intranet|lan|home)$/.test(host))
      return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const ENTITAETEN: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  euro: "€",
  ndash: "–",
  mdash: "—",
  sup2: "²",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  shy: "",
};

/** Lesbarer Text einer HTML-Seite ohne Skripte, Navigation und Fußzeile. */
export function htmlZuText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|nav|footer|header|form|iframe)\b[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(
      /<(br|\/p|\/h[1-6]|\/li|\/tr|\/div|\/section|\/table)\b[^>]*>/gi,
      "\n",
    )
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n: string) => ENTITAETEN[n] ?? m)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Login- oder Registrierungsseite statt Bericht (Lead-Formular, Anmeldung). */
export function istSperrseite(html: string, text: string): boolean {
  const formular =
    /<form\b/i.test(html) && /type=["']?(email|password)/i.test(html);
  const hinweis =
    /(jetzt herunterladen|download (the )?report|zum download registrieren|bitte (melden sie sich|registrieren)|sign in|log ?in to)/i.test(
      text,
    );
  return text.length < 4000 && (formular || hinweis);
}

/** Vergleichsform: nur Buchstaben, Ziffern, Komma und Punkt; ohne Trennstriche und Leerraum. */
export function vergleichsform(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u00ad/g, "")
    .replace(/[^\p{L}\p{N},.]/gu, "");
}

/** Alle Lesarten einer Zahl im Text („1.250“, „3,81“, „3.81“). */
function zahlenIn(text: string): number[] {
  const werte: number[] = [];
  for (const m of text.matchAll(/\d[\d.,]*\d|\d/g)) {
    const t = m[0];
    const deutsch = Number(t.replace(/\./g, "").replace(",", "."));
    const englisch = Number(t.replace(/,/g, ""));
    if (Number.isFinite(deutsch)) werte.push(deutsch);
    if (Number.isFinite(englisch)) werte.push(englisch);
  }
  return werte;
}

/**
 * Ist der ausgelesene Wert belegt? Das Zitat muss wörtlich (bis auf Leerraum und Silbentrennung)
 * im Dokument stehen, bevorzugt auf der angegebenen Seite, und die Zahl muss im Zitat vorkommen.
 */
export function zitatBelegt(
  b: Pick<Benchmark, "zitat" | "wert" | "seite">,
  seiten: string[],
): boolean {
  const zitat = b.zitat?.trim();
  if (!zitat || zitat.length < 8) return false;
  const nadel = vergleichsform(zitat);
  if (nadel.length < 6) return false;
  const zahlDrin = zahlenIn(zitat).some(
    (z) => Math.abs(z - b.wert) <= Math.max(1e-9, Math.abs(b.wert) * 1e-6),
  );
  if (!zahlDrin) return false;
  const kandidaten =
    b.seite && b.seite >= 1 && b.seite <= seiten.length
      ? seiten.slice(Math.max(0, b.seite - 2), b.seite + 1)
      : seiten;
  const heu = vergleichsform(kandidaten.join(" "));
  if (heu.includes(nadel)) return true;
  // Seitenzahl der KI kann um mehr als eine Seite daneben liegen: ganzes Dokument prüfen.
  return (
    kandidaten !== seiten && vergleichsform(seiten.join(" ")).includes(nadel)
  );
}

function plusTage(iso: string, tage: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const RHEINLAND =
  /(köln|koeln|düsseldorf|duesseldorf|bonn|rheinland|nrw|nordrhein|leverkusen|neuss|bergisch|rhein-)/i;
const DEUTSCHLAND = /(deutschland|bund|top[- ]?7|a-städte|germany)/i;

export function regionsRang(region: string): number {
  if (RHEINLAND.test(region)) return 0;
  if (DEUTSCHLAND.test(region)) return 1;
  return 2;
}

/** Höchstens so viele Vergleichswerte übernimmt ein Bericht automatisch (gedruckt werden 16). */
export const MAX_UEBERNAHME = 24;

/**
 * Vergleichswerte der Bibliothek für eine Berichtsperiode: je Quelle die jüngsten ausgelesenen
 * Dokumente mit Stichtag zwischen sechs Monaten vor Periodenbeginn und 75 Tagen nach Periodenende,
 * davon nur automatisch belegte Werte, Rheinland vor Deutschland, nach Relevanz.
 */
export function bibliothekAuswahl(
  dokumente: MarktberichtDokument[],
  periode: Periode,
  quellenNamen: Map<string, string>,
): Benchmark[] {
  const { von, bis } = periodeVonBis(periode);
  const ab = plusTage(von, -183);
  const spaetestens = plusTage(bis, 75);
  const imFenster = dokumente.filter(
    (d) =>
      d.status === "ausgelesen" &&
      d.stichtag &&
      d.stichtag >= ab &&
      d.stichtag <= spaetestens,
  );
  const juengster = new Map<string, string>();
  for (const d of imFenster) {
    const j = juengster.get(d.quelleId);
    if (!j || d.stichtag! > j) juengster.set(d.quelleId, d.stichtag!);
  }
  const gesehen = new Set<string>();
  const werte: Benchmark[] = [];
  for (const d of imFenster) {
    if (d.stichtag! < plusTage(juengster.get(d.quelleId)!, -31)) continue;
    for (const b of d.kennzahlen) {
      if (!b.geprueft) continue;
      const schluessel =
        `${b.kennzahl}|${b.region}|${b.wert}|${d.quelleId}`.toLowerCase();
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      werte.push({
        ...b,
        quelle: b.quelle || quellenNamen.get(d.quelleId) || d.titel,
        url: b.url ?? d.url,
        dokumentId: d.id,
      });
    }
  }
  return werte
    .sort(
      (a, b) =>
        regionsRang(a.region) - regionsRang(b.region) ||
        (b.relevanz ?? 50) - (a.relevanz ?? 50) ||
        b.stichtag.localeCompare(a.stichtag),
    )
    .slice(0, MAX_UEBERNAHME);
}

/** Bibliothekswerte zu vorhandenen Vergleichswerten hinzufügen, ohne Dubletten. */
export function benchmarksZusammenfuehren(
  vorhanden: Benchmark[],
  neu: Benchmark[],
): { benchmarks: Benchmark[]; hinzugefuegt: number } {
  const schluessel = (b: Benchmark) =>
    `${b.kennzahl}|${b.region}|${b.wert}|${b.quelle}|${b.stichtag}`.toLowerCase();
  const da = new Set(vorhanden.map(schluessel));
  const dazu = neu.filter((b) => !da.has(schluessel(b)));
  return { benchmarks: [...vorhanden, ...dazu], hinzugefuegt: dazu.length };
}
