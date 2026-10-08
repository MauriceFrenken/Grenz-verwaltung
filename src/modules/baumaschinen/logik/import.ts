/**
 * Import des Maschinenbestands aus Excel oder CSV (eine Zeile je Maschine).
 * Reine Funktion: bekommt bereits gelesene Zeilen (Spaltenüberschrift → Zellwert)
 * und liefert gültige Maschinen plus Fehlerliste je Zeile.
 */
import {
  machineSchema,
  MASCHINEN_STATUS,
  type Company,
  type Machine,
  type MaschinenStatus,
} from "@/lib/db/typen";
import { parseDeutscheZahl, parseDeutschesDatum } from "@/lib/format/de";

export const MASCHINEN_SPALTEN = {
  id: "Maschinen-ID",
  gesellschaft: "Gesellschaft",
  hersteller: "Hersteller",
  modell: "Modell",
  kategorie: "Kategorie",
  baujahr: "Baujahr",
  stunden: "Betriebsstunden",
  seriennummer: "Seriennummer",
  standort: "Standort",
  status: "Status",
  ankaufAm: "Ankauf am",
  einkaufspreis: "Einkaufspreis",
  lieferant: "Lieferant",
  angebotspreis: "Angebotspreis",
  inseratUrl: "Inserat-URL",
  verkaufAm: "Verkauf am",
  verkaufspreis: "Verkaufspreis",
  kaeufer: "Käufer",
  bemerkung: "Bemerkung",
} as const;

export interface MaschinenImportFehler {
  /** Zeilennummer in der Datei (1 = Kopfzeile) */
  zeile: number;
  feld: string;
  meldung: string;
}

export interface MaschinenImportErgebnis {
  gueltig: Machine[];
  fehler: MaschinenImportFehler[];
  neu: string[];
  aktualisiert: string[];
}

export interface MaschinenImportKontext {
  /** Gesellschaften, denen Maschinen zugeordnet werden dürfen */
  companies: Company[];
  vorhandeneIds: string[];
  stichtag: string;
}

type Zeile = Record<string, unknown>;

/** Spaltennamen tolerant vergleichen (Groß/klein, Leerzeichen, Bindestriche). */
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9]/g, "");
}

function wert(z: Zeile, spalte: string): unknown {
  if (spalte in z) return z[spalte];
  const n = norm(spalte);
  const k = Object.keys(z).find((x) => norm(x) === n);
  return k ? z[k] : undefined;
}

function text(z: Zeile, spalte: string): string {
  const v = wert(z, spalte);
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function datum(z: Zeile, spalte: string): string | null {
  const v = wert(z, spalte);
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const t = text(z, spalte);
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return parseDeutschesDatum(t);
}

function zahl(z: Zeile, spalte: string): number | null {
  const v = wert(z, spalte);
  if (v === null || v === undefined || String(v).trim() === "") return null;
  return parseDeutscheZahl(v as string | number);
}

const STATUS: Record<string, MaschinenStatus> = {
  einkauf: "einkauf",
  angekauft: "einkauf",
  lager: "lager",
  bestand: "lager",
  inseriert: "inseriert",
  online: "inseriert",
  reserviert: "reserviert",
  verkauft: "verkauft",
};

export function importiereMaschinen(
  zeilen: Zeile[],
  kontext: MaschinenImportKontext,
): MaschinenImportErgebnis {
  const fehler: MaschinenImportFehler[] = [];
  const gueltig: Machine[] = [];
  const gesehen = new Set<string>();
  const jahr = kontext.stichtag.slice(0, 4);
  let laufend = Math.max(
    0,
    ...kontext.vorhandeneIds
      .filter((id) => id.startsWith(`BM-${jahr}-`))
      .map((id) => Number(id.slice(8))),
  );
  const S = MASCHINEN_SPALTEN;

  const findeGesellschaft = (name: string) => {
    const n = name.toLowerCase();
    return kontext.companies.find(
      (c) =>
        c.id.toLowerCase() === n ||
        c.name.toLowerCase() === n ||
        c.shortName.toLowerCase() === n,
    );
  };

  zeilen.forEach((z, index) => {
    const nr = index + 2;
    const f = (feld: string, meldung: string) =>
      fehler.push({ zeile: nr, feld, meldung });
    const vorher = fehler.length;

    if (
      Object.values(z).every(
        (v) => v === null || v === undefined || String(v).trim() === "",
      )
    )
      return;

    let id = text(z, S.id).toUpperCase();
    if (!id) {
      laufend += 1;
      id = `BM-${jahr}-${String(laufend).padStart(3, "0")}`;
    }
    if (gesehen.has(id)) f(S.id, `Maschinen-ID ${id} kommt mehrfach vor`);
    gesehen.add(id);

    const gName = text(z, S.gesellschaft);
    const gesellschaft =
      gName === "" && kontext.companies.length === 1
        ? kontext.companies[0]
        : findeGesellschaft(gName);
    if (!gesellschaft)
      f(
        S.gesellschaft,
        gName ? `Unbekannte Gesellschaft „${gName}“` : "Gesellschaft fehlt",
      );

    const statusText = norm(text(z, S.status));
    const status = statusText ? STATUS[statusText] : "lager";
    if (!status) f(S.status, `Status muss ${MASCHINEN_STATUS.join(", ")} sein`);

    const kandidat = {
      id,
      companyId: gesellschaft?.id ?? "",
      hersteller: text(z, S.hersteller),
      modell: text(z, S.modell),
      kategorie: text(z, S.kategorie) || null,
      baujahr: zahl(z, S.baujahr),
      betriebsstunden: zahl(z, S.stunden),
      seriennummer: text(z, S.seriennummer) || null,
      standort: text(z, S.standort) || null,
      status: status ?? "lager",
      ankaufAm: datum(z, S.ankaufAm),
      einkaufspreis: zahl(z, S.einkaufspreis),
      lieferant: text(z, S.lieferant) || null,
      angebotspreis: zahl(z, S.angebotspreis),
      inseratUrl: text(z, S.inseratUrl) || null,
      verkaufAm: datum(z, S.verkaufAm),
      verkaufspreis: zahl(z, S.verkaufspreis),
      kaeufer: text(z, S.kaeufer) || null,
      bemerkung: text(z, S.bemerkung) || null,
    };
    if (kandidat.baujahr != null)
      kandidat.baujahr = Math.round(kandidat.baujahr);
    if (kandidat.betriebsstunden != null)
      kandidat.betriebsstunden = Math.round(kandidat.betriebsstunden);

    if (!kandidat.hersteller) f(S.hersteller, "Hersteller fehlt");
    if (!kandidat.modell) f(S.modell, "Modell fehlt");
    if (text(z, S.ankaufAm) && !kandidat.ankaufAm)
      f(S.ankaufAm, "Datum ungültig (TT.MM.JJJJ)");
    if (text(z, S.verkaufAm) && !kandidat.verkaufAm)
      f(S.verkaufAm, "Datum ungültig (TT.MM.JJJJ)");
    if (status && status !== "einkauf" && !kandidat.ankaufAm)
      f(S.ankaufAm, "Ankaufsdatum fehlt (nötig für Lagerdauer)");
    if (status && status !== "einkauf" && kandidat.einkaufspreis == null)
      f(S.einkaufspreis, "Einkaufspreis fehlt");
    if (status === "verkauft") {
      if (!kandidat.verkaufAm) f(S.verkaufAm, "Verkaufsdatum fehlt");
      if (kandidat.verkaufspreis == null)
        f(S.verkaufspreis, "Verkaufspreis fehlt");
    }

    if (fehler.length > vorher) return;
    const geprueft = machineSchema.safeParse(kandidat);
    if (!geprueft.success) {
      for (const p of geprueft.error.issues)
        f(String(p.path[0] ?? "Zeile"), p.message);
      return;
    }
    gueltig.push(geprueft.data);
  });

  const vorhanden = new Set(kontext.vorhandeneIds);
  return {
    gueltig,
    fehler,
    neu: gueltig.filter((m) => !vorhanden.has(m.id)).map((m) => m.id),
    aktualisiert: gueltig.filter((m) => vorhanden.has(m.id)).map((m) => m.id),
  };
}

/** Kopfzeile für die Vorlage zum Herunterladen. */
export function maschinenVorlage(): Record<string, unknown>[] {
  const S = MASCHINEN_SPALTEN;
  return [
    {
      [S.id]: "",
      [S.gesellschaft]: "FB",
      [S.hersteller]: "Muster",
      [S.modell]: "Bagger 140",
      [S.kategorie]: "Kettenbagger",
      [S.baujahr]: 2018,
      [S.stunden]: 7500,
      [S.seriennummer]: "",
      [S.standort]: "",
      [S.status]: "Lager",
      [S.ankaufAm]: "01.09.2026",
      [S.einkaufspreis]: 50000,
      [S.lieferant]: "",
      [S.angebotspreis]: 64000,
      [S.inseratUrl]: "",
      [S.verkaufAm]: "",
      [S.verkaufspreis]: "",
      [S.kaeufer]: "",
      [S.bemerkung]: "Beispielzeile, bitte überschreiben",
    },
  ];
}
