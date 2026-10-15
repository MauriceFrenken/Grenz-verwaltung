/**
 * Postfach-Datenhinweise: Typen und reine Funktionen (client-safe).
 *
 * Eine Mail oder ein Anhang, der Zahlen im Board verändert (Mieterhöhung,
 * Bescheid, Mahnung, Kaufvertrag …), wird zu einem Hinweis unter
 * Datenqualität. Die KI-Antwort wird hier geprüft und vereinheitlicht.
 */

export const HINWEIS_ARTEN = [
  "mieterhoehung",
  "mieterwechsel",
  "nebenkosten",
  "feste_kosten",
  "zahlungsforderung",
  "darlehen",
  "transaktion",
  "bank",
  "sonstiges",
] as const;
export type HinweisArt = (typeof HINWEIS_ARTEN)[number];

export const HINWEIS_ART_LABEL: Record<HinweisArt, string> = {
  mieterhoehung: "Mieterhöhung",
  mieterwechsel: "Mieterwechsel",
  nebenkosten: "Nebenkosten",
  feste_kosten: "Feste Kosten",
  zahlungsforderung: "Zahlung fällig",
  darlehen: "Darlehen",
  transaktion: "Kauf / Verkauf",
  bank: "Bank",
  sonstiges: "Sonstiges",
};

/** Seite im Board, auf der der Hinweis nachgetragen wird */
export const HINWEIS_ZIEL = {
  mieterhoehung: "/board/mieten",
  mieterwechsel: "/board/mieten",
  nebenkosten: "/board/mieten",
  feste_kosten: "/board/cashflow",
  zahlungsforderung: "/board/liquiditaet",
  darlehen: "/board/darlehen",
  transaktion: "/board/transaktionen",
  bank: "/board/liquiditaet",
  sonstiges: "/board/daten",
} as const satisfies Record<HinweisArt, string>;

export type HinweisStatus = "offen" | "erledigt" | "ignoriert";

/** Ein Hinweis, wie ihn die KI liefert (nach Prüfung) */
export interface HinweisVorschlag {
  art: HinweisArt;
  titel: string;
  beschreibung: string | null;
  aktion: string | null;
  objektId: string | null;
  gesellschaftId: string | null;
  mieter: string | null;
  betrag: number | null;
  betragAlt: number | null;
  gueltigAb: string | null;
  faelligAm: string | null;
  konfidenz: number;
}

/** Gespeicherter Hinweis (Tabelle postfach_datenhinweise) */
export interface PostfachHinweis extends HinweisVorschlag {
  id: string;
  /** Mail im Postfach oder Datei in der OneDrive-Ablage */
  quelle: "postfach" | "ablage";
  /** Ablage: Pfad der Datei und Link zum Öffnen in OneDrive */
  pfad: string | null;
  webUrl: string | null;
  posteingangId: string | null;
  betreff: string | null;
  absender: string | null;
  anhangName: string | null;
  eingegangenAm: string | null;
  status: HinweisStatus;
  erledigtAm: string | null;
  notiz: string | null;
}

/** Unter dieser Sicherheit legt die KI keinen Hinweis an */
export const HINWEIS_MIN_KONFIDENZ = 0.5;

const text = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function zahl(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string" || !v.trim()) return null;
  // deutsche Schreibweise „1.234,56“ und „1234.56“
  const s = v.replace(/[€\s]/g, "");
  const n = /,\d{1,2}$/.test(s)
    ? Number(s.replace(/\./g, "").replace(",", "."))
    : Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isoTag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  return null;
}

/**
 * KI-Antwort → geprüfte Hinweise. Unbekannte Objekte/Gesellschaften werden
 * verworfen, unsichere Hinweise (Konfidenz < 0,5) fallen weg.
 */
export function hinweiseAusAntwort(
  antwort: string,
  bekannt: { objekte: Set<string>; gesellschaften: Set<string> },
): HinweisVorschlag[] {
  const json = antwort.match(/\{[\s\S]*\}/);
  if (!json) return [];
  let roh: unknown;
  try {
    roh = JSON.parse(json[0]);
  } catch {
    return [];
  }
  const liste = (roh as { hinweise?: unknown }).hinweise;
  if (!Array.isArray(liste)) return [];
  const ergebnis: HinweisVorschlag[] = [];
  for (const h of liste.slice(0, 5)) {
    if (!h || typeof h !== "object") continue;
    const o = h as Record<string, unknown>;
    const art = HINWEIS_ARTEN.includes(o.art as HinweisArt)
      ? (o.art as HinweisArt)
      : null;
    const titel = text(o.titel, 160);
    if (!art || !titel) continue;
    const konfidenz =
      typeof o.konfidenz === "number"
        ? Math.min(1, Math.max(0, o.konfidenz))
        : 0.5;
    if (konfidenz < HINWEIS_MIN_KONFIDENZ) continue;
    const objekt = text(o.objekt, 20);
    const gesellschaft = text(o.gesellschaft, 20);
    ergebnis.push({
      art,
      titel,
      beschreibung: text(o.beschreibung, 1000),
      aktion: text(o.aktion, 300),
      objektId: objekt && bekannt.objekte.has(objekt) ? objekt : null,
      gesellschaftId:
        gesellschaft && bekannt.gesellschaften.has(gesellschaft)
          ? gesellschaft
          : null,
      mieter: text(o.mieter, 120),
      betrag: zahl(o.betrag),
      betragAlt: zahl(o.betragAlt),
      gueltigAb: isoTag(o.gueltigAb),
      faelligAm: isoTag(o.faelligAm),
      konfidenz,
    });
  }
  return ergebnis;
}

/**
 * Schlüssel gegen Doppelte: derselbe Sachverhalt kommt oft mehrfach
 * (mehrere Anhänge, Weiterleitung, Mahnung zur selben Rechnung).
 */
export function hinweisSchluessel(h: {
  art: HinweisArt;
  objektId: string | null;
  mieter: string | null;
  betrag: number | null;
  gueltigAb: string | null;
  titel: string;
}): string {
  const mieter = (h.mieter ?? "").toLowerCase().replace(/[^a-zäöüß]/g, "");
  const kern =
    h.betrag != null || h.gueltigAb
      ? `${h.betrag?.toFixed(2) ?? ""}|${h.gueltigAb ?? ""}`
      : h.titel.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  return [h.art, h.objektId ?? "", mieter, kern].join("|");
}

/** Dateitypen aus der Ablage, deren Inhalt die KI lesen kann */
const ABLAGE_ENDUNGEN = /\.(pdf|jpe?g|png|docx?|xlsx?|csv|txt)$/i;
/** Nur Dateien, die in den letzten Tagen neu oder geändert sind */
export const ABLAGE_RUECKBLICK_TAGE = 30;
const ABLAGE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Soll eine Datei aus dem OneDrive-Delta geprüft werden?
 * Nur Gesellschaftsordner (`istRoot` prüft den obersten Ordner), keine
 * Archive, keine temporären Office-Dateien, nur lesbare Typen.
 */
export function ablageDateiRelevant(
  d: {
    name: string;
    pfad: string;
    groesse: number;
    geaendertAm: string | null;
    istOrdner: boolean;
    geloescht: boolean;
  },
  jetzt: Date,
  istRoot: (ordner: string) => boolean,
): boolean {
  if (d.istOrdner || d.geloescht) return false;
  if (!ABLAGE_ENDUNGEN.test(d.name) || /^~\$|^\./.test(d.name)) return false;
  if (d.groesse <= 0 || d.groesse > ABLAGE_MAX_BYTES) return false;
  const segmente = d.pfad.split("/").filter(Boolean);
  if (!segmente.length || !istRoot(segmente[0])) return false;
  if (segmente.some((s) => /archiv/i.test(s))) return false;
  if (!d.geaendertAm) return false;
  const alter = jetzt.getTime() - new Date(d.geaendertAm).getTime();
  return alter <= ABLAGE_RUECKBLICK_TAGE * 86_400_000;
}
