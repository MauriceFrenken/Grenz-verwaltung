import type { ExposeFeldId } from "@/lib/expose-ai";

/** Zerlegt „Straße Hausnummer“ (Ort nach Komma/Pipe wird ignoriert). */
export function splitStrasseHausnummer(adresse: string): {
  street: string;
  number: string;
} {
  const ohneOrt = adresse.split(/[|,]/)[0]?.trim() ?? adresse.trim();
  if (!ohneOrt) return { street: "", number: "" };

  const m = ohneOrt.match(
    /^(.+?)\s+(\d{1,4}(?:\s*[-–/]\s*\d{1,4})?[a-zA-Z]?)\s*$/,
  );
  if (m) {
    return {
      street: m[1].trim(),
      number: m[2].replace(/\s+/g, ""),
    };
  }
  return { street: ohneOrt, number: "" };
}

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Energieausweis A–H; A+ → A. */
function normalizeEnergieausweis(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!v) return null;
  if (/^[A-H]\+?$/.test(v)) return v[0];
  return null;
}

const OBJEKTZUSTAND_VALUES = new Set([
  "Neubau",
  "Kernsaniert",
  "Gut",
  "OK gepflegt",
  "Nur OK",
  "Sanierungsbedürftig",
  "Schrott",
]);

/** A–D (Exposé) → Salesforce-Picklist; exakte Labels durchreichen. */
function normalizeObjektzustand(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (OBJEKTZUSTAND_VALUES.has(v)) return v;

  const map: Record<string, string> = {
    A: "Neubau",
    B: "Gut",
    C: "Nur OK",
    D: "Sanierungsbedürftig",
  };
  return map[v.toUpperCase()] ?? null;
}

export type RealEstatePayload = Record<string, string | number>;
export type TransaktionPayload = Record<string, string | number>;

/**
 * Baut Real-Estate-Felder aus Exposé-Werten.
 * Leere Werte werden ausgelassen (kein Überschreiben mit Leer).
 */
export function buildRealEstatePayload(
  felder: Partial<Record<ExposeFeldId, string>>,
  opts?: { includeName?: boolean },
): RealEstatePayload {
  const out: RealEstatePayload = {};

  const adresse = trimOrEmpty(felder.objektadresse);
  if (adresse) {
    const { street, number } = splitStrasseHausnummer(adresse);
    if (opts?.includeName !== false) {
      out.Name = adresse;
    }
    if (street) out.Street_Name__c = street;
    if (number) out.Street_Number__c = number;
  }

  const baujahr = trimOrEmpty(felder.baujahr);
  if (baujahr) {
    const n = parseNumber(baujahr);
    if (n != null) out.Construction_Year__c = n;
  }

  const heizung = trimOrEmpty(felder.heizungsart);
  if (heizung) out.Type_of_heating__c = heizung;

  const energie = normalizeEnergieausweis(trimOrEmpty(felder.energieausweis));
  if (energie) out.Energy_certificate__c = energie;

  const wohnungen = trimOrEmpty(felder.anzahlWohnungen);
  if (wohnungen) {
    const n = parseNumber(wohnungen);
    if (n != null) out.Anzahl_Wohnungen__c = n;
  }

  const mietflaeche = trimOrEmpty(felder.mietflaecheGesamt);
  if (mietflaeche) {
    const n = parseNumber(mietflaeche);
    if (n != null) out.Renable_Area__c = n;
  }

  const wohnflaeche = trimOrEmpty(felder.wohnflaeche);
  if (wohnflaeche) {
    const n = parseNumber(wohnflaeche);
    if (n != null) out.Wohnfl_che__c = n;
  }

  const gewerbe = trimOrEmpty(felder.gewerbeflaeche);
  if (gewerbe) {
    const n = parseNumber(gewerbe);
    if (n != null) out.Gewerbefl_che__c = n;
  }

  const stellplaetze = trimOrEmpty(felder.anzahlStellplaetze);
  if (stellplaetze) {
    const n = parseNumber(stellplaetze);
    if (n != null) out.Anzahl_Stellpl_tze__c = n;
  }

  return out;
}

/** Transaktionsfelder + Systemdefaults. Leere Exposé-Werte auslassen. */
export function buildTransaktionPayload(
  felder: Partial<Record<ExposeFeldId, string>>,
  realEstateId: string,
): TransaktionPayload {
  const out: TransaktionPayload = {
    Real_Estate__c: realEstateId,
    Status__c: "Auf dem Markt",
    Min_auf_dem_Markt_seit__c: new Date().toISOString().slice(0, 10),
  };

  const makler = trimOrEmpty(felder.makler);
  if (makler) out.Makler__c = makler;

  const miete = trimOrEmpty(felder.jahresnettokaltmiete);
  if (miete) {
    const n = parseNumber(miete);
    if (n != null) out.Jahresnettokaltmiete__c = n;
  }

  const zustand = normalizeObjektzustand(trimOrEmpty(felder.objektzustand));
  if (zustand) out.Objektzustand__c = zustand;

  return out;
}
