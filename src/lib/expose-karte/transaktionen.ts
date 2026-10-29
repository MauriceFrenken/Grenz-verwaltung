/**
 * Salesforce-Transaktionen (Transaktion__c) und eigene Grenz-Abschlüsse als Punkte der Marktkarte.
 * Reine Funktionen ohne Datenbank, damit sie testbar bleiben.
 */

import type { KartenObjekt } from "./server-fn";

type Roh = Record<string, unknown>;

/** Felder von Transaktion__c inkl. Objektdaten aus Real_Estate__c. */
export const TRANSAKTION_FELDER = [
  "Id",
  "Name",
  "Status__c",
  "Datum_Transaktion__c",
  "Kaufpreis__c",
  "Kaufpreis_gesch_tzt__c",
  "Jahresnettokaltmiete__c",
  "Bestandsmiete_IST__c",
  "Makler__c",
  "Angebotspreis__c",
  "Min_auf_dem_Markt_seit__c",
  "Objektzustand__c",
  "Anmerkungen__c",
  "Real_Estate__c",
  "Real_Estate__r.Name",
  "Real_Estate__r.Address__Street__s",
  "Real_Estate__r.Address__PostalCode__s",
  "Real_Estate__r.Address__City__s",
  "Real_Estate__r.Address__Latitude__s",
  "Real_Estate__r.Address__Longitude__s",
  "Real_Estate__r.Street_Name__c",
  "Real_Estate__r.Street_Number__c",
  "Real_Estate__r.ZIP_Code__c",
  "Real_Estate__r.City__c",
  "Real_Estate__r.Real_Estate_Type__c",
  "Real_Estate__r.Anzahl_Wohnungen__c",
  "Real_Estate__r.Construction_Year__c",
  "Real_Estate__r.Wohnfl_che__c",
  "Real_Estate__r.Gewerbefl_che__c",
  "Real_Estate__r.Renable_Area__c",
  "Real_Estate__r.Rental_income__c",
  "Real_Estate__r.Energy_certificate__c",
].join(", ");

export type MandatKurz = { sfId: string; name: string; phase: string | null };

function text(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

/** Positive Zahl oder null (Salesforce liefert für leere Formeln oft 0). */
function positiv(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function runde(n: number | null, stellen = 2): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** stellen;
  return Math.round(n * f) / f;
}

/** „Teststraße 27“, „Test GmbH“: Testdatensätze gehören nicht auf die Karte. */
export function istTest(...texte: Array<string | null | undefined>): boolean {
  return texte.some((t) => !!t && /^\s*test/i.test(t));
}

/** Objektdaten aus Real_Estate__c (Unterobjekt der Abfrage oder Cache-Zeile). */
export function objektdaten(re: Roh | null | undefined) {
  const r = re ?? {};
  const strasseTeile = [text(r.Street_Name__c), text(r.Street_Number__c)]
    .filter(Boolean)
    .join(" ");
  const wohn = positiv(r.Wohnfl_che__c);
  const gewerbe = positiv(r.Gewerbefl_che__c);
  const baujahr = positiv(r.Construction_Year__c);
  return {
    name: text(r.Name),
    adresse: text(r.Address__Street__s) ?? (strasseTeile || text(r.Name)),
    plz: text(r.Address__PostalCode__s) ?? text(r.ZIP_Code__c),
    stadt: text(r.Address__City__s) ?? text(r.City__c),
    objektart: text(r.Real_Estate_Type__c),
    einheiten: positiv(r.Anzahl_Wohnungen__c),
    baujahr: baujahr && baujahr > 1000 ? Math.round(baujahr) : null,
    flaeche:
      positiv(r.Renable_Area__c) ??
      (wohn || gewerbe ? (wohn ?? 0) + (gewerbe ?? 0) : null),
    miete: positiv(r.Rental_income__c),
    energieklasse: text(r.Energy_certificate__c),
    lat: positiv(r.Address__Latitude__s),
    lng: positiv(r.Address__Longitude__s),
  };
}

/** Kennzahlen aus Preis, Jahresmiete und Fläche. */
function kennzahlen(
  preis: number | null,
  miete: number | null,
  flaeche: number | null,
  mieteQmAngabe: number | null,
) {
  return {
    faktor: preis && miete ? runde(preis / miete, 1) : null,
    rendite: preis && miete ? runde(miete / preis, 4) : null,
    mieteQm:
      mieteQmAngabe ?? (miete && flaeche ? runde(miete / 12 / flaeche) : null),
    preisQm: preis && flaeche ? Math.round(preis / flaeche) : null,
  };
}

export type TransaktionStatus = KartenObjekt["status"];

export function transaktionStatus(status: unknown): TransaktionStatus {
  const s = String(status ?? "").toLowerCase();
  if (s === "verkauft") return "verkauft";
  if (s === "nicht verkauft") return "nicht_verkauft";
  return "angebot";
}

/** Eine Transaktion__c → Kartenpunkt (ohne Koordinaten, die ergänzt der Geo-Cache). */
export function transaktionZuObjekt(
  r: Roh,
  mandatJeObjekt: Map<string, MandatKurz>,
): KartenObjekt | null {
  const re = (r.Real_Estate__r ?? null) as Roh | null;
  const o = objektdaten(re);
  if (istTest(o.adresse, o.name)) return null;
  const status = transaktionStatus(r.Status__c);
  const verkauft = status === "verkauft";
  const kaufpreis = positiv(r.Kaufpreis__c);
  const angebotspreis = positiv(r.Angebotspreis__c);
  const preis = verkauft ? kaufpreis : angebotspreis;
  const miete = positiv(r.Jahresnettokaltmiete__c) ?? o.miete;
  const reId = text(r.Real_Estate__c);
  return {
    id: String(r.Id),
    quelle: "transaktion",
    status,
    titel: text(r.Name),
    eingegangenAm: verkauft
      ? text(r.Datum_Transaktion__c)
      : (text(r.Min_auf_dem_Markt_seit__c) ?? text(r.Datum_Transaktion__c)),
    adresse: o.adresse,
    plz: o.plz,
    stadt: o.stadt,
    objektart: o.objektart,
    makler: text(r.Makler__c),
    einheiten: o.einheiten,
    baujahr: o.baujahr,
    flaeche: o.flaeche,
    preis,
    angebotspreis,
    preisGeschaetzt:
      verkauft && String(r.Kaufpreis_gesch_tzt__c ?? "").toLowerCase() === "ja",
    miete,
    ...kennzahlen(preis, miete, o.flaeche, positiv(r.Bestandsmiete_IST__c)),
    energieklasse: o.energieklasse,
    objektzustand: text(r.Objektzustand__c),
    anmerkung: text(r.Anmerkungen__c),
    exportiert: false,
    mandat: reId ? (mandatJeObjekt.get(reId) ?? null) : null,
    provisionNetto: null,
    realEstateSfId: reId,
    lat: o.lat,
    lng: o.lng,
    genau: true,
  };
}

export type GrenzDeal = {
  sfId: string;
  name: string;
  phase: string | null;
  betrag: number | null;
  abschlussAm: string | null;
  mandatSfId: string | null;
  daten: Roh;
};

const GEWONNEN = new Set(["invoice paid", "closed won"]);

export function istGewonnen(d: GrenzDeal): boolean {
  return (
    d.daten.IsWon === true || GEWONNEN.has(String(d.phase ?? "").toLowerCase())
  );
}

/**
 * Gewonnene Grenz-Deals (Opportunity Real_Estate_Broker). Liegt zum Objekt schon eine
 * verkaufte Transaktion vor, wird diese um Mandat und Provision ergänzt; sonst entsteht
 * ein eigener Punkt mit beurkundetem Kaufpreis.
 */
export function grenzAbschluesse(
  deals: GrenzDeal[],
  mandate: Map<string, MandatKurz & { realEstateSfId: string | null }>,
  objekte: Map<string, Roh>,
  transaktionen: KartenObjekt[],
): KartenObjekt[] {
  const verkaufteJeObjekt = new Map<string, KartenObjekt>();
  for (const t of transaktionen)
    if (t.status === "verkauft" && t.realEstateSfId)
      verkaufteJeObjekt.set(t.realEstateSfId, t);

  // Je Mandat nur der jüngste gewonnene Deal.
  const jeMandat = new Map<string, GrenzDeal>();
  for (const d of deals) {
    if (!d.mandatSfId || !istGewonnen(d)) continue;
    const bisher = jeMandat.get(d.mandatSfId);
    if (!bisher || (d.abschlussAm ?? "") > (bisher.abschlussAm ?? ""))
      jeMandat.set(d.mandatSfId, d);
  }

  const neu: KartenObjekt[] = [];
  for (const [mandatId, d] of jeMandat) {
    const m = mandate.get(mandatId);
    if (!m) continue; // Testmandat oder nicht im Cache
    const kaufpreis =
      positiv(d.daten.Beurkundeter_Kaufpreis_in__c) ?? positiv(d.betrag);
    const provision = positiv(d.daten.Provision_in__c);
    const mandat: MandatKurz = { sfId: m.sfId, name: m.name, phase: m.phase };

    const vorhanden = m.realEstateSfId
      ? verkaufteJeObjekt.get(m.realEstateSfId)
      : undefined;
    if (vorhanden) {
      vorhanden.mandat = mandat;
      vorhanden.provisionNetto = provision;
      vorhanden.grenz = true;
      if (!vorhanden.preis && kaufpreis) {
        vorhanden.preis = kaufpreis;
        Object.assign(
          vorhanden,
          kennzahlen(
            kaufpreis,
            vorhanden.miete,
            vorhanden.flaeche,
            vorhanden.mieteQm,
          ),
        );
      }
      continue;
    }

    const re = m.realEstateSfId ? objekte.get(m.realEstateSfId) : undefined;
    const o = objektdaten(re);
    if (istTest(o.adresse, o.name)) continue;
    neu.push({
      id: d.sfId,
      quelle: "transaktion",
      status: "verkauft",
      titel: d.name,
      eingegangenAm: d.abschlussAm,
      adresse: o.adresse,
      plz: o.plz,
      stadt: o.stadt,
      objektart: o.objektart,
      makler: "Grenz & Co.",
      einheiten: o.einheiten,
      baujahr: o.baujahr,
      flaeche: o.flaeche,
      preis: kaufpreis,
      angebotspreis: null,
      preisGeschaetzt: false,
      miete: o.miete,
      ...kennzahlen(kaufpreis, o.miete, o.flaeche, null),
      energieklasse: o.energieklasse,
      objektzustand: null,
      anmerkung: null,
      exportiert: false,
      mandat,
      provisionNetto: provision,
      grenz: true,
      realEstateSfId: m.realEstateSfId,
      lat: o.lat,
      lng: o.lng,
      genau: true,
    });
  }
  return neu;
}
