/**
 * OneDrive-Objektordner eines Mandats: Ordner zur Adresse finden und Unterlagen einordnen.
 * Rein funktional, damit testbar; Graph-Zugriffe stehen in ordner-server-fn.ts.
 */

export type MandatAdresse = {
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  /** Mandatsnummer, z. B. „M-10053“ (manche Ordner tragen sie im Namen). */
  mandatName: string | null;
};

/** Kleinbuchstaben, Umlaute ausgeschrieben, „straße“ → „str“, nur Buchstaben und Ziffern. */
export function normalisiereName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/strasse\b|str\b\.?/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Straßenname ohne Hausnummer und die Hausnummer (erste Zahl, auch „14-16“ → „14“). */
export function zerlegeStrasse(strasse: string): {
  name: string;
  nummer: string | null;
} {
  const m = strasse
    .trim()
    .match(/^(.*?)[\s,]*(\d+)\s*[a-zA-Z]?(?:\s*[-–/]\s*\d+\s*[a-zA-Z]?)?\s*$/);
  if (!m) return { name: strasse.trim(), nummer: null };
  return { name: m[1].trim(), nummer: m[2] };
}

export type OrdnerKandidat = {
  id: string;
  name: string;
  pfad: string | null;
  webUrl: string | null;
  geaendertAm: string | null;
};

const ARCHIV = /(^|\s)(archiv|alt|old|backup)(\s|$)/;

/**
 * Wie gut passt ein Ordner zur Adresse? 0 bis 100. Straßenname ist Pflicht;
 * Hausnummer und Ort heben, Archiv-Pfade senken.
 */
export function ordnerScore(k: OrdnerKandidat, a: MandatAdresse): number {
  const name = ` ${normalisiereName(k.name)} `;
  const pfad = ` ${normalisiereName(k.pfad ?? "")} `;
  const kompakt = name.replace(/\s+/g, "");
  let score = 0;

  if (a.mandatName && name.includes(` ${normalisiereName(a.mandatName)} `))
    score += 70;

  if (a.strasse) {
    const { name: strName, nummer } = zerlegeStrasse(a.strasse);
    const strNorm = normalisiereName(strName);
    if (!strNorm) return score;
    const strKompakt = strNorm.replace(/\s+/g, "");
    const strTreffer =
      name.includes(` ${strNorm} `) ||
      kompakt.includes(strKompakt) ||
      // „Bilker Alle“ (Tippfehler) oder abgekürzte Straßennamen: erste 6 Zeichen
      (strKompakt.length >= 8 && kompakt.includes(strKompakt.slice(0, 6)));
    if (strTreffer) {
      score += 50;
      if (nummer && new RegExp(`(^|[^0-9])${nummer}([^0-9]|$)`).test(name))
        score += 30;
    } else if (score === 0) {
      return 0;
    }
  }
  if (a.ort) {
    const ort = normalisiereName(a.ort);
    if (ort && (name.includes(ort) || pfad.includes(ort))) score += 10;
  }
  if (ARCHIV.test(pfad) || ARCHIV.test(name)) score -= 25;
  return Math.max(0, Math.min(100, score));
}

/** Kandidaten nach Score, nur ab 50 (Straße getroffen oder Mandatsnummer im Namen). */
export function besteOrdner(
  kandidaten: OrdnerKandidat[],
  a: MandatAdresse,
): (OrdnerKandidat & { score: number })[] {
  const gesehen = new Set<string>();
  return kandidaten
    .filter((k) => !gesehen.has(k.id) && gesehen.add(k.id))
    .map((k) => ({ ...k, score: ordnerScore(k, a) }))
    .filter((k) => k.score >= 50)
    .sort(
      (x, y) =>
        y.score - x.score ||
        (y.geaendertAm ?? "").localeCompare(x.geaendertAm ?? ""),
    );
}

export type UnterlagenKategorie =
  | "expose"
  | "kalkulation"
  | "mieterliste"
  | "energieausweis"
  | "grundbuch"
  | "teilung"
  | "plaene"
  | "auftrag"
  | "betriebskosten"
  | "technik"
  | "fotos"
  | "sonstiges";

export const KATEGORIEN: {
  id: UnterlagenKategorie;
  label: string;
  /** Für die Vermarktung erforderlich (Unterlagen-Check). */
  pflicht: boolean;
  muster: RegExp;
}[] = [
  {
    id: "auftrag",
    label: "Auftrag und Vereinbarungen",
    pflicht: true,
    muster:
      /alleinauftrag|maklervertrag|maklerauftrag|vermarktungsauftrag|auftrag|provision|vollmacht|nda|vertraulichkeit/,
  },
  {
    id: "expose",
    label: "Exposé und Teaser",
    pflicht: true,
    muster: /expose|teaser|objektbeschreibung|verkaufsunterlage/,
  },
  {
    id: "mieterliste",
    label: "Mieterliste und Mietverträge",
    pflicht: true,
    muster:
      /mieterliste|mieteraufstellung|mietaufstellung|mietuebersicht|rent ?roll|mietvertr|mieter|mieten/,
  },
  {
    id: "energieausweis",
    label: "Energieausweis",
    pflicht: true,
    muster: /energieausweis|energiepass|energie|geg/,
  },
  {
    id: "grundbuch",
    label: "Grundbuch, Flurkarte, Baulasten",
    pflicht: true,
    muster:
      /grundbuch|flurkarte|liegenschaft|kataster|baulast|lageplan|altlast/,
  },
  {
    id: "plaene",
    label: "Grundrisse und Pläne",
    pflicht: true,
    muster:
      /grundriss|plaene|(^| )plan( |$)|(^| )schnitt|ansicht|bauzeichnung|wohnflaeche|flaechenberechnung|flaechenaufstellung/,
  },
  {
    id: "kalkulation",
    label: "Kalkulation und Bewertung",
    pflicht: false,
    muster:
      /kalkulation|dcf|bewertung|wertermittlung|verkehrswert|gutachten|rendite|cashflow/,
  },
  {
    id: "teilung",
    label: "Teilungserklärung (WEG)",
    pflicht: false,
    muster:
      /teilungserkl|aufteilung|gemeinschaftsordnung|weg protokoll|eigentuemerversammlung/,
  },
  {
    id: "betriebskosten",
    label: "Betriebs- und Nebenkosten",
    pflicht: false,
    muster:
      /betriebskosten|nebenkosten|hausgeld|wirtschaftsplan|abrechnung|grundsteuer|versicherung/,
  },
  {
    id: "technik",
    label: "Technik und Zustand",
    pflicht: false,
    muster:
      /baubeschreibung|sanierung|modernisierung|instandhaltung|wartung|heizung|dach|brandschutz|schadstoff|asbest/,
  },
  {
    id: "fotos",
    label: "Fotos",
    pflicht: true,
    muster: /foto|bild|photo|image|drohne/,
  },
];

const BILD = /\.(jpe?g|png|heic|webp|tiff?)$/i;

/** Ordnet eine Datei anhand ihres Namens und Ordnerpfads einer Kategorie zu. */
export function kategorieFuer(
  dateiname: string,
  pfad = "",
): UnterlagenKategorie {
  if (BILD.test(dateiname)) return "fotos";
  const ohneEndung = normalisiereName(
    dateiname.replace(/\.[a-z0-9]{2,5}$/i, ""),
  );
  for (const k of KATEGORIEN) if (k.muster.test(ohneEndung)) return k.id;
  // Unterordner wie „03_Mietvertraege“ ordnen die Dateien darin ein.
  const p = normalisiereName(pfad);
  for (const k of KATEGORIEN) if (k.muster.test(p)) return k.id;
  return "sonstiges";
}

export type OrdnerDatei = {
  id: string;
  name: string;
  /** Unterordner relativ zum Objektordner, „“ für die oberste Ebene. */
  unterordner: string;
  groesse: number;
  geaendertAm: string | null;
  webUrl: string | null;
  kategorie: UnterlagenKategorie;
};

/** Reihenfolge, in der die KI Unterlagen auswertet (wichtigste zuerst). */
const KI_REIHENFOLGE: UnterlagenKategorie[] = [
  "expose",
  "mieterliste",
  "kalkulation",
  "energieausweis",
  "grundbuch",
  "teilung",
  "betriebskosten",
  "technik",
  "plaene",
  "auftrag",
  "sonstiges",
];

const KI_LESBAR = /\.(pdf|xlsx|xlsm|xls|csv|txt)$/i;

/**
 * Bis zu `max` Dateien für den Steckbrief: lesbare Formate, je Kategorie höchstens zwei
 * (neueste zuerst), nicht größer als 20 MB.
 */
export function dateienFuerSteckbrief(
  dateien: OrdnerDatei[],
  max = 8,
): OrdnerDatei[] {
  const auswahl: OrdnerDatei[] = [];
  for (const kat of KI_REIHENFOLGE) {
    const passend = dateien
      .filter(
        (d) =>
          d.kategorie === kat &&
          KI_LESBAR.test(d.name) &&
          d.groesse > 0 &&
          d.groesse <= 20 * 1024 * 1024,
      )
      .sort((a, b) => (b.geaendertAm ?? "").localeCompare(a.geaendertAm ?? ""))
      .slice(0, 2);
    auswahl.push(...passend);
    if (auswahl.length >= max) break;
  }
  return auswahl.slice(0, max);
}
