/**
 * Deutsche Adress-Normalisierung für Fuzzy-Matching (Exposé ↔ Salesforce).
 * Deckt u. a. Straße / Strasse / Str. / Str und ß/ss.
 */

import { parsePlzStadt } from "./address-format";

export type ParsedAdresse = {
  /** Original-Eingabe (getrimmt) */
  raw: string;
  /** Normalisierter Vergleichsschlüssel ohne Hausnummer */
  streetKey: string;
  /** Normalisierte Hausnummern (z. B. "12", "12a") */
  houseNumbers: string[];
  /** Vollständiger Schlüssel streetKey + houseNumbers */
  fullKey: string;
  /** Normalisierter Stadt-Schlüssel (leer wenn unbekannt) */
  cityKey: string;
  /** PLZ falls erkannt */
  zip: string;
};

export type AddressOrtHint = {
  city?: string | null;
  zip?: string | null;
};

/** Straße / Strasse / Str. / Str → einheitliches Token „str“. */
function normalizeStreetSuffixes(value: string): string {
  let s = value;
  // Zusammengesetzt: Sudermanstrasse, Sudermanstraße, Sudermanstr., Sudermanstr
  s = s.replace(/stra(?:ss|ß)e\b/gi, "str");
  s = s.replace(/str\./gi, "str");
  s = s.replace(/\bstr\b/gi, "str");
  return s;
}

/** Für Vergleich: Kleinbuchstaben, Umlaute, Satzzeichen weg. */
export function normalizeAddressText(value: string): string {
  let s = value.normalize("NFKC").toLowerCase().trim();
  s = s.replace(/ß/g, "ss");
  s = s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
  s = normalizeStreetSuffixes(s);
  // Trennzeichen zwischen Straße und Stadt (Komma, Pipe, Semikolon)
  s = s.replace(/[|,;]/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  s = s.replace(/\s+/g, " ");
  return s;
}

/** Kompakter Schlüssel ohne Leerzeichen. */
export function compactAddressKey(value: string): string {
  return normalizeAddressText(value).replace(/\s+/g, "");
}

const HOUSE_NUMBER_RE =
  /\b(\d{1,4}(?:\s*[-–/]\s*\d{1,4})?[a-z]?)\b/gi;

/**
 * Zerlegt eine Adresse in Straßenkern + Hausnummer(n) + optional Stadt/PLZ.
 */
export function parseAdresse(rawInput: string): ParsedAdresse {
  const raw = rawInput.trim();
  if (!raw) {
    return {
      raw,
      streetKey: "",
      houseNumbers: [],
      fullKey: "",
      cityKey: "",
      zip: "",
    };
  }

  // „Venloer Str. 533, Köln“ / „Sudermanstr. 5 | 50668 Köln“
  const ohneOrt = raw.split(/[|,]/)[0]?.trim() ?? raw;
  const ortTeil = raw.split(/[|,]/).slice(1).join(" ").trim();
  const { zip, city } = parsePlzStadt(ortTeil);
  const cityKey = city ? compactAddressKey(city) : "";

  const normalized = normalizeAddressText(ohneOrt);

  const houseNumbers: string[] = [];
  const seen = new Set<string>();
  for (const m of normalized.matchAll(HOUSE_NUMBER_RE)) {
    const n = m[1].replace(/\s+/g, "").toLowerCase();
    if (!seen.has(n)) {
      seen.add(n);
      houseNumbers.push(n);
    }
  }

  let streetPart = normalized;
  if (houseNumbers.length > 0) {
    // Letzte Hausnummer(n) vom Straßenkern trennen
    const last = houseNumbers[houseNumbers.length - 1];
    const idx = streetPart.lastIndexOf(last);
    if (idx >= 0) {
      streetPart = (streetPart.slice(0, idx) + streetPart.slice(idx + last.length)).trim();
    }
  }

  const streetKey = streetPart.replace(/\s+/g, "");
  const fullKey = streetKey + houseNumbers.join("");

  return { raw, streetKey, houseNumbers, fullKey, cityKey, zip };
}

export type AddressMatchScore = {
  score: number;
  reason: string;
};

function resolveOrt(
  parsed: ParsedAdresse,
  hint?: AddressOrtHint,
): { cityKey: string; zip: string } {
  const cityKey = hint?.city?.trim()
    ? compactAddressKey(hint.city)
    : parsed.cityKey;
  const zip = hint?.zip?.trim() || parsed.zip;
  return { cityKey, zip };
}

/** „Frankfurt“ ↔ „Frankfurt am Main“, „Koeln“ ↔ „Köln“. */
function citiesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * Bewertet Ähnlichkeit zweier Adressen (0–1).
 * Berücksichtigt unterschiedliche Schreibweisen von „Straße“ und Stadt.
 */
export function scoreAddressMatch(
  a: string,
  b: string,
  ortA?: AddressOrtHint,
  ortB?: AddressOrtHint,
): AddressMatchScore {
  const pa = parseAdresse(a);
  const pb = parseAdresse(b);
  const oa = resolveOrt(pa, ortA);
  const ob = resolveOrt(pb, ortB);

  const bothCities = Boolean(oa.cityKey && ob.cityKey);
  const cityOk = !bothCities || citiesMatch(oa.cityKey, ob.cityKey);
  const bothZips = Boolean(oa.zip && ob.zip);
  const zipOk = !bothZips || oa.zip === ob.zip;

  // Bekannte, abweichende Städte → kein Treffer (z. B. gleiche Straße in anderer Stadt)
  if (bothCities && !cityOk) {
    return { score: 0, reason: "Straße ähnlich, aber andere Stadt" };
  }

  const withOrtReason = (reason: string): string => {
    const extras: string[] = [];
    if (bothCities && cityOk) extras.push("Stadt stimmt");
    if (bothZips && zipOk) extras.push("PLZ stimmt");
    return extras.length > 0 ? `${reason}, ${extras.join(", ")}` : reason;
  };

  const boostForOrt = (base: number): number => {
    let score = base;
    if (bothCities && cityOk) score = Math.min(1, score + 0.05);
    if (bothZips && zipOk) score = Math.min(1, score + 0.02);
    return score;
  };

  if (!pa.streetKey || !pb.streetKey) {
    const ca = compactAddressKey(a);
    const cb = compactAddressKey(b);
    if (ca && cb && (ca === cb || ca.includes(cb) || cb.includes(ca))) {
      return {
        score: boostForOrt(0.7),
        reason: withOrtReason("Teilübereinstimmung (normalisiert)"),
      };
    }
    return { score: 0, reason: "Keine vergleichbare Straße" };
  }

  if (pa.fullKey && pa.fullKey === pb.fullKey) {
    return {
      score: boostForOrt(1),
      reason: withOrtReason("Exakte Übereinstimmung (Schreibweise normalisiert)"),
    };
  }

  const streetEqual = pa.streetKey === pb.streetKey;
  const streetSoft =
    streetEqual ||
    pa.streetKey.includes(pb.streetKey) ||
    pb.streetKey.includes(pa.streetKey);

  const numsA = new Set(pa.houseNumbers);
  const numsB = new Set(pb.houseNumbers);
  const overlap = [...numsA].filter((n) => numsB.has(n));
  const hasNums = numsA.size > 0 && numsB.size > 0;

  if (streetEqual && hasNums && overlap.length > 0) {
    const allMatch =
      numsA.size === numsB.size && overlap.length === numsA.size;
    return {
      score: boostForOrt(allMatch ? 0.98 : 0.9),
      reason: withOrtReason(
        allMatch
          ? "Straße und Hausnummer stimmen überein"
          : "Straße stimmt, Hausnummern überlappen",
      ),
    };
  }

  if (streetSoft && hasNums && overlap.length > 0) {
    return {
      score: boostForOrt(0.82),
      reason: withOrtReason("Ähnliche Straße, passende Hausnummer"),
    };
  }

  if (streetEqual && !hasNums) {
    return {
      score: boostForOrt(0.55),
      reason: withOrtReason("Straßenname stimmt (ohne Hausnummer-Vergleich)"),
    };
  }

  if (streetSoft) {
    return {
      score: boostForOrt(0.4),
      reason: withOrtReason("Ähnlicher Straßenname"),
    };
  }

  // Fallback: kompakter Gesamtstring
  const ca = compactAddressKey(a);
  const cb = compactAddressKey(b);
  if (ca.length >= 6 && cb.length >= 6 && (ca.includes(cb) || cb.includes(ca))) {
    return {
      score: boostForOrt(0.35),
      reason: withOrtReason("Teilstring-Treffer"),
    };
  }

  return { score: 0, reason: "Keine Übereinstimmung" };
}

/** Mindest-Score für „Empfehlung“. */
export const EMPFEHLUNG_MIN_SCORE = 0.55;

export function textMatchesSearch(haystack: string, query: string): boolean {
  const q = normalizeAddressText(query);
  if (!q) return true;
  const h = normalizeAddressText(haystack);
  const qCompact = q.replace(/\s+/g, "");
  const hCompact = h.replace(/\s+/g, "");
  return h.includes(q) || hCompact.includes(qCompact);
}
