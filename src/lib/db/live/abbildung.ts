/**
 * Abbildung von Bens Tabellen (Schema `public`) auf das Datenmodell des Boards.
 *
 * Reine Funktionen ohne Datenbankzugriff, damit die Regeln testbar sind.
 * Grundsatz: Fehlt ein Wert, wird nichts erfunden. Wo die Fachlogik eine Zahl
 * braucht, gilt ein neutraler Wert (0 bzw. „Bestand“) und es entsteht eine
 * Datenlücke, die das Board sichtbar macht.
 */
import { plusTage, type IsoDatum } from "@/lib/kalender";
import type {
  Ankauf,
  CrmDaten,
  Expose,
  Kaeufer,
  ObjektVerkauf,
  Reservierung,
} from "../transaktionen";
import {
  SEGMENTE,
  type BankAccount,
  type BoardDaten,
  type Company,
  type DatenLuecke,
  type Frequenz,
  type Lease,
  type LeaseEvent,
  type Loan,
  type Machine,
  type MachineCost,
  type Party,
  type PlannedPayment,
  type Property,
  type QuellenStand,
  type Segment,
  type Tenant,
  type Transaction,
  type TxKategorie,
  type Unit,
} from "../typen";

export type Row = Record<string, unknown>;

/** Rohdaten, wie sie aus Supabase kommen. `null` = Tabelle/View fehlt (Migration nicht angewendet). */
export interface LiveRohdaten {
  stichtag: IsoDatum;
  gesellschaften: Row[];
  objekte: Row[];
  einheiten: Row[];
  mietverhaeltnisse: Row[];
  personen: Row[];
  mieterhoehungen: Row[];
  darlehen: Row[];
  darlehenStand: Row[];
  darlehenBuchungen: Row[];
  /** bankbuchungen_eindeutig oder (Fallback) bankbuchungen + Auszug */
  bankbuchungen: Row[];
  /** Anzahl Rohzeilen in bankbuchungen (für den Dublettenhinweis) */
  bankbuchungenRoh: number;
  ebicsKonten: Row[];
  ebicsKunden: Row[];
  bankkonten: Row[] | null;
  kontosalden: Row[] | null;
  sollZuordnungen: Row[];
  sollPositionen: Row[];
  planposten: Row[] | null;
  ankaufPipeline: Row[];
  objektVerkauf: Row[] | null;
  einheitenVerkauf: Row[];
  exposes: Row[];
  /** Exposé-Postfach nicht lesbar (Grund), sonst null */
  exposesFehler?: string | null;
  profiles: Row[];
  maschinen: Row[] | null;
  maschinenKosten: Row[] | null;
  /** fehlende Tabellen/Spalten der Board-Migration */
  fehlendeMigration: string[];
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

export function zahl(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

export function text(wert: unknown): string | null {
  if (typeof wert !== "string") return wert == null ? null : String(wert);
  const t = wert.trim();
  return t ? t : null;
}

export function isoTag(wert: unknown): IsoDatum | null {
  const t = text(wert);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

function maxIso(werte: unknown[]): string | null {
  let m: string | null = null;
  for (const w of werte) {
    const t = text(w);
    if (t && (!m || t > m)) m = t;
  }
  return m;
}

/** Segment-Annahme vom 08.10.2026, solange die Spalte `segment` fehlt oder leer ist. */
export const SEGMENT_ANNAHME: Record<string, Segment> = {
  "G-01": "immobilien_bestand",
  "G-02": "immobilien_bestand",
  "G-03": "immobilien_bestand",
  "G-04": "immobilien_bestand",
  "G-05": "holding",
  "G-06": "baumaschinen_plattform",
  "G-07": "immobilien_bestand",
  "G-08": "immobilien_bestand",
  "G-09": "baumaschinen_handel",
  "G-10": "makler",
};

export function ibanAusDateiname(dateiname: unknown): string | null {
  const teil = text(dateiname)?.split(" ")[2] ?? "";
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(teil) ? teil : null;
}

function personName(p: Row): string {
  const firma = text(p.firma);
  if (firma) return firma;
  return (
    [text(p.vorname), text(p.nachname)].filter(Boolean).join(" ") || "Unbekannt"
  );
}

// ---------------------------------------------------------------------------
// Abbildung
// ---------------------------------------------------------------------------

export function abbilden(r: LiveRohdaten): BoardDaten {
  const stichtag = r.stichtag;
  const luecken: DatenLuecke[] = [];
  const luecke = (
    l: Omit<DatenLuecke, "companyId" | "refType" | "refId"> &
      Partial<DatenLuecke>,
  ) => luecken.push({ companyId: null, refType: null, refId: null, ...l });

  for (const was of r.fehlendeMigration)
    luecke({
      id: `system:migration:${was}`,
      bereich: "system",
      schwere: "rot",
      titel: `Datenbank-Erweiterung fehlt: ${was}`,
      detail:
        "Die Migration 20261008120000_board_steuerung ist auf der Datenbank noch nicht angewendet.",
      naechsterSchritt:
        "Ben wendet die Migration an (siehe docs/UEBERGABE-PHASE-2.md).",
    });

  if (r.exposesFehler)
    luecke({
      id: "system:exposes",
      bereich: "system",
      schwere: "gelb",
      titel: "Exposé-Postfach nicht geladen",
      detail: `Die eingegangenen Exposés fehlen in der Pipeline (${r.exposesFehler}).`,
      naechsterSchritt:
        "In Bens Transaktionsliste prüfen, ob das Exposé-Postfach (Microsoft) verbunden ist.",
    });

  // --- Gesellschaften -------------------------------------------------------
  const companies: Company[] = r.gesellschaften.map((g) => {
    const id = String(g.id);
    const seg = text(g.segment);
    const segment: Segment =
      seg && (SEGMENTE as readonly string[]).includes(seg)
        ? (seg as Segment)
        : (SEGMENT_ANNAHME[id] ?? "holding");
    const min = zahl(g.mindestliquiditaet);
    const getrennt =
      g.getrennter_bereich === true ||
      (g.getrennter_bereich == null && segment === "makler");
    if (min == null && !getrennt)
      luecke({
        id: `gesellschaften:mindestliquiditaet:${id}`,
        bereich: "gesellschaften",
        schwere: "gelb",
        titel: `Mindestliquidität fehlt: ${text(g.kuerzel) ?? id}`,
        detail:
          "Ohne Puffer warnt die Liquiditätsplanung nicht vor Engpässen dieser Gesellschaft.",
        companyId: id,
        refType: "company",
        refId: id,
        naechsterSchritt: "Mindestliquidität unter Datenqualität festlegen.",
      });
    return {
      id,
      shortName: text(g.kuerzel) ?? id,
      name: text(g.name) ?? id,
      legalForm: text(g.rechtsform) ?? "GmbH",
      segment,
      minLiquidity: min ?? 0,
      minLiquidityGesetzt: min != null,
      separateArea: getrennt,
      oneDriveFolder: "",
    };
  });
  const companyIds = new Set(companies.map((c) => c.id));

  // --- Parteien (Personen, Banken) -----------------------------------------
  const parties: Party[] = r.personen.map((p) => ({
    id: String(p.id),
    kind: p.typ === "bank" ? "bank" : text(p.firma) ? "extern" : "person",
    name: personName(p),
    iban: text(p.iban) ?? undefined,
    email: text(p.e_mail) ?? undefined,
  }));

  // --- Einheiten und Verkauf -------------------------------------------------
  const verkaufJeEinheit = new Map<string, Row>();
  const RANG = [
    "abgebrochen",
    "in_vermarktung",
    "reserviert",
    "kaufvertrag_in_vorbereitung",
    "notartermin",
    "beurkundet",
    "uebergeben",
  ];
  for (const v of r.einheitenVerkauf) {
    const eid = String(v.einheit_id);
    const alt = verkaufJeEinheit.get(eid);
    if (!alt || RANG.indexOf(String(v.stufe)) > RANG.indexOf(String(alt.stufe)))
      verkaufJeEinheit.set(eid, v);
  }

  const objektStrategie = new Map<string, string | null>(
    r.objekte.map((o) => [String(o.id), text(o.strategie)]),
  );
  const units: Unit[] = r.einheiten.map((e) => {
    const id = String(e.id);
    const flaeche = zahl(e.flaeche_m2) ?? zahl(e.flaeche_aufmass_m2);
    if (!flaeche)
      luecke({
        id: `immobilien:flaeche:${id}`,
        bereich: "immobilien",
        schwere: "gelb",
        titel: `Fläche fehlt: Einheit ${text(e.lage) ?? id}`,
        detail:
          "Ohne Fläche fehlen Miete je m², Leerstandsquote nach Fläche und Bewirtschaftungskosten.",
        refType: "unit",
        refId: id,
        naechsterSchritt: "Fläche unter Verwaltung → Einheiten nachtragen.",
      });
    const verkauf = verkaufJeEinheit.get(id);
    const vs = verkauf ? String(verkauf.stufe) : null;
    let status: Unit["status"] =
      e.status === "leerstand"
        ? "leer"
        : e.status === "wartung"
          ? "sanierung"
          : e.status === "reserviert"
            ? "reserviert"
            : "vermietet";
    if (vs === "beurkundet" || vs === "uebergeben") status = "verkauft";
    else if (
      vs === "reserviert" ||
      vs === "kaufvertrag_in_vorbereitung" ||
      vs === "notartermin"
    )
      status = "reserviert";
    else if (vs === "in_vermarktung" && status !== "vermietet")
      status = "im_vertrieb";
    return {
      id,
      propertyId: String(e.objekt_id),
      label: [text(e.hausteil), text(e.lage)].filter(Boolean).join(" ") || id,
      kind: e.nutzungsart === "wohnen" ? "wohnung" : "gewerbe",
      area: flaeche ?? 0,
      rooms: 0,
      floor: text(e.lage) ?? "",
      status,
      listPrice: zahl(verkauf?.angebotspreis) ?? undefined,
      salePrice: zahl(verkauf?.kaufpreis) ?? undefined,
      saleDate: isoTag(verkauf?.beurkundet_am) ?? undefined,
    };
  });

  // --- Objekte -------------------------------------------------------------
  const properties: Property[] = r.objekte.map((o) => {
    const id = String(o.id);
    const name = text(o.bezeichnung) ?? id;
    const strategie = objektStrategie.get(id);
    const fehlt: string[] = [];
    if (!strategie) fehlt.push("Strategie");
    if (zahl(o.kaufpreis) == null) fehlt.push("Kaufpreis");
    if (!isoTag(o.kaufdatum)) fehlt.push("Kaufdatum");
    if (!text(o.plz)) fehlt.push("PLZ");
    if (fehlt.length)
      luecke({
        id: `immobilien:stammdaten:${id}`,
        bereich: "immobilien",
        schwere: fehlt.includes("Strategie") ? "gelb" : "gelb",
        titel: `Objekt-Stammdaten unvollständig: ${name}`,
        detail: `Es fehlen: ${fehlt.join(", ")}.${!strategie ? " Das Objekt wird bis dahin als Bestand gerechnet." : ""}`,
        companyId: text(o.gesellschaft_id),
        refType: "property",
        refId: id,
        naechsterSchritt: "Unter Verwaltung → Objekte ergänzen.",
      });
    return {
      id,
      ablageId: text(o.ablage_id),
      companyId: String(o.gesellschaft_id),
      name,
      street: text(o.strasse) ?? "",
      zip: text(o.plz) ?? "",
      city: text(o.ort) ?? "",
      strategy: strategie === "aufteiler" ? "aufteiler" : "bestand",
      strategyGesetzt: Boolean(strategie),
      yearBuilt: null,
      purchaseDate: isoTag(o.kaufdatum),
      purchasePrice: zahl(o.kaufpreis),
      marketValue: null,
      targetRentPerSqm: null,
      costPerSqmMonth: null,
      oneDriveUrl: "",
    };
  });

  // --- Mietverträge --------------------------------------------------------
  const tenants: Tenant[] = [];
  const leases: Lease[] = [];
  const ungeprueftJeObjekt = new Map<string, number>();
  const unitById = new Map(units.map((u) => [u.id, u]));
  for (const m of r.mietverhaeltnisse) {
    const id = String(m.id);
    if (m.status === "geplant") continue;
    tenants.push({
      id,
      name: text(m.mieter_name) ?? "Unbekannt",
      iban: text(m.iban) ?? "",
    });
    const beginn = isoTag(m.beginn);
    const ende =
      isoTag(m.ende) ?? (m.status === "beendet" ? isoTag(m.updated_at) : null);
    leases.push({
      id,
      unitId: String(m.einheit_id),
      tenantId: id,
      start: beginn ?? "2000-01-01",
      end: ende,
      baseRent: zahl(m.kaltmiete) ?? 0,
      serviceCharge: zahl(m.nk_vorauszahlung) ?? 0,
      deposit: 0,
      lastRentIncrease: isoTag(m.letzte_mieterhoehung),
    });
    if (m.beleg_geprueft !== true && m.status !== "beendet") {
      const pid = unitById.get(String(m.einheit_id))?.propertyId ?? "?";
      ungeprueftJeObjekt.set(pid, (ungeprueftJeObjekt.get(pid) ?? 0) + 1);
    }
  }
  for (const [pid, n] of ungeprueftJeObjekt) {
    const p = properties.find((x) => x.id === pid);
    luecke({
      id: `immobilien:mietvertraege-ungeprueft:${pid}`,
      bereich: "immobilien",
      schwere: "gelb",
      titel: `${n} Mietvertr${n === 1 ? "ag" : "äge"} nicht gegen Beleg geprüft: ${p?.name ?? pid}`,
      detail:
        "Soll-Miete und Mietrückstände sind erst belastbar, wenn die Werte gegen den Mietvertrag geprüft sind.",
      companyId: p?.companyId ?? null,
      refType: "property",
      refId: pid,
      naechsterSchritt:
        "Unter Verwaltung → Mietverhältnisse Beleg hinterlegen und „geprüft“ setzen.",
    });
  }
  const leaseEvents: LeaseEvent[] = r.mieterhoehungen
    .filter((e) => isoTag(e.verlangt_am) && zahl(e.neue_miete))
    .map((e) => ({
      id: String(e.id),
      leaseId: String(e.mietverhaeltnis_id),
      kind: "mieterhoehung" as const,
      receivedOn: isoTag(e.verlangt_am)!,
      newBaseRent: zahl(e.neue_miete)!,
      status:
        e.status === "zugestimmt" || e.status === "wirksam"
          ? "zugestimmt"
          : e.status === "abgelehnt"
            ? "abgelehnt"
            : "offen",
    }));

  // --- Darlehen ------------------------------------------------------------
  const standById = new Map(r.darlehenStand.map((s) => [String(s.id), s]));
  const loans: Loan[] = [];
  for (const d of r.darlehen) {
    const id = String(d.id);
    const s = standById.get(id);
    const auszahlung = isoTag(d.auszahlung_am) ?? isoTag(d.vertragsdatum);
    const zins = zahl(d.zins_pa);
    const fehlt: string[] = [];
    if (!auszahlung) fehlt.push("Auszahlungs-/Vertragsdatum");
    if (zins == null) fehlt.push("Zinssatz");
    const tilgung = text(d.tilgung);
    const rate = zahl(d.rate_monatlich);
    const tilgMonat = zahl(d.tilgung_monatlich);
    let repayment: Loan["repayment"] = { kind: "endfaellig" };
    if (tilgung === "annuitaet" && rate)
      repayment = { kind: "annuitaet", installment: rate };
    else if (tilgung === "raten" && tilgMonat)
      repayment = { kind: "ratentilgung", principalPerPeriod: tilgMonat };
    else if (tilgung === "annuitaet" || tilgung === "raten")
      fehlt.push("Rate bzw. Tilgung je Monat");
    const zz = text(d.zinszahlung);
    const frequency: Frequenz =
      repayment.kind !== "endfaellig"
        ? "monatlich"
        : zz === "monatlich" || zz === "quartalsweise"
          ? zz
          : "jaehrlich";
    const status =
      d.status === "aktiv"
        ? "aktiv"
        : d.status === "entwurf"
          ? "entwurf"
          : "beendet";
    if (status === "aktiv" && fehlt.length)
      luecke({
        id: `darlehen:stammdaten:${id}`,
        bereich: "darlehen",
        schwere: !auszahlung ? "rot" : "gelb",
        titel: `Darlehensdaten unvollständig: ${id}`,
        detail: `Es fehlen: ${fehlt.join(", ")}. Zinsplan und Abgleich sind für dieses Darlehen nur eingeschränkt richtig.`,
        companyId:
          text(d.nehmer_gesellschaft_id) ?? text(d.geber_gesellschaft_id),
        refType: "loan",
        refId: id,
        naechsterSchritt:
          "Werte aus dem Vertrag in der Darlehensseite nachtragen.",
      });
    if (!auszahlung) continue;
    let maturity = isoTag(d.ende);
    if (maturity && maturity <= auszahlung) maturity = null;
    const art = text(d.art);
    loans.push({
      id,
      bankRef: null,
      kind:
        art === "bank" || art === "intercompany" || art === "gesellschafter"
          ? art
          : "sonstige",
      lenderCompanyId: text(d.geber_gesellschaft_id),
      lenderPartyId: text(d.geber_person_id),
      borrowerCompanyId: text(d.nehmer_gesellschaft_id),
      borrowerPartyId: text(d.nehmer_person_id),
      propertyId: text(d.objekt_id),
      principal: zahl(d.betrag) ?? 0,
      disbursementDate: auszahlung,
      rate: Math.min((zins ?? 0) / 100, 0.25),
      rateType: d.zins_art === "variabel" ? "variabel" : "fest",
      fixedUntil: isoTag(d.zinsbindung_bis),
      maturityDate: maturity,
      repayment,
      frequency,
      dayCount: "30/360",
      status,
      guarantee: null,
      purpose: text(d.bemerkung) ?? "",
      oneDriveUrl: text(d.vertrag_pfad),
      istSaldo: s ? zahl(s.saldo_aktuell) : null,
      istSaldoAm: s ? (isoTag(s.saldo_am) ?? isoTag(s.letzte_buchung)) : null,
      hinweis: s ? text(s.hinweis) : null,
      unklareBuchungen: s ? (zahl(s.unklare_buchungen) ?? 0) : 0,
    });
    if (s && (zahl(s.unklare_buchungen) ?? 0) > 0)
      luecke({
        id: `darlehen:unklar:${id}`,
        bereich: "darlehen",
        schwere: "gelb",
        titel: `Unklare Bankbuchung beim Darlehen ${id}`,
        detail: `${zahl(s.unklare_buchungen)} Buchung(en) konnten nicht als Zins, Tilgung oder Auszahlung eingeordnet werden.`,
        companyId: text(d.nehmer_gesellschaft_id),
        refType: "loan",
        refId: id,
        naechsterSchritt:
          "In der Darlehensseite die Buchung prüfen und zuordnen.",
      });
  }

  // --- Konten, Salden, Umsätze --------------------------------------------
  const konten = new Map<
    string,
    {
      companyId: string;
      bank: string;
      zugang: BankAccount["zugang"];
      label: string;
      propertyId: string | null;
    }
  >();
  // deaktivierte Konten (z. B. Mietkautionskonten) bleiben auch aus EBICS heraus
  const inaktiv = new Set<string>();
  if (r.bankkonten) {
    for (const k of r.bankkonten) {
      if (k.aktiv === false) {
        inaktiv.add(String(k.iban));
        continue;
      }
      konten.set(String(k.iban), {
        companyId: String(k.gesellschaft_id),
        bank: text(k.bank) ?? "",
        zugang: (text(k.zugang) as BankAccount["zugang"]) ?? "manuell",
        label: text(k.bezeichnung) ?? "Konto",
        propertyId: text(k.objekt_id),
      });
    }
  }
  const kundeById = new Map(r.ebicsKunden.map((k) => [String(k.id), k]));
  for (const c of r.ebicsKonten) {
    const iban = text(c.iban)?.replace(/\s+/g, "").toUpperCase();
    const kunde = kundeById.get(String(c.ebics_kunde_id));
    if (!iban || !kunde || konten.has(iban) || inaktiv.has(iban)) continue;
    konten.set(iban, {
      companyId: String(kunde.gesellschaft_id),
      bank: text(kunde.bank_name) ?? "",
      zugang: "ebics",
      label: "Konto",
      propertyId: null,
    });
  }

  // Zuordnung der Umsätze: Darlehen und Mieten über Fingerprint (Dubletten haben andere IDs)
  const darlehenFp = new Map<string, Row>();
  for (const b of r.darlehenBuchungen)
    if (text(b.fingerprint)) darlehenFp.set(String(b.fingerprint), b);
  const loanById = new Map(loans.map((l) => [l.id, l]));
  const posById = new Map(r.sollPositionen.map((p) => [String(p.id), p]));
  const mieteBuchung = new Map<string, Row>();
  for (const z of r.sollZuordnungen) {
    const pos = posById.get(String(z.position_id));
    const fp =
      text((z.bankbuchungen as Row | null)?.fingerprint) ?? text(z.fingerprint);
    if (pos && fp) mieteBuchung.set(fp, pos);
  }
  const eigeneIbans = new Set(konten.keys());
  const transactions: Transaction[] = [];
  const transaktionsKonten = new Set<string>();
  for (const b of r.bankbuchungen) {
    const iban = text(b.konto_iban);
    if (!iban) continue;
    if (!konten.has(iban))
      konten.set(iban, {
        companyId: String(b.gesellschaft_id),
        bank: "",
        zugang: "ebics",
        label: "Konto",
        propertyId: null,
      });
    transaktionsKonten.add(iban);
    const betrag = zahl(b.betrag) ?? 0;
    const fp = text(b.fingerprint) ?? "";
    const dl = darlehenFp.get(fp);
    const miete = mieteBuchung.get(fp);
    const gegen = text(b.gegenkonto_iban);
    let category: TxKategorie = "sonstiges";
    let propertyId: string | null = null;
    let interestPart: number | null = null;
    let principalPart: number | null = null;
    if (dl) {
      category = "darlehen";
      const loan = loanById.get(String(dl.darlehen_id));
      propertyId = loan?.propertyId ?? null;
      interestPart = zahl(dl.zins_anteil);
      principalPart = zahl(dl.tilgung_anteil);
      // Regelmäßige kleine Zahlung auf ein endfälliges Darlehen ohne
      // Rückführungs-Stichwort ist Zins, auch wenn die Auto-Zuordnung
      // „Rückzahlung“ geschrieben hat (z. B. 2.625 € je Quartal auf 350k).
      const text = `${b.auftraggeber_name ?? ""} ${b.verwendungszweck ?? ""}`;
      if (
        loan?.repayment.kind === "endfaellig" &&
        interestPart == null &&
        Math.abs(betrag) < loan.principal * 0.1 &&
        !/r(ü|ue)ckf(ü|ue)hr|r(ü|ue)ckzahl|tilg|auszahl/i.test(text)
      ) {
        interestPart = Math.abs(betrag);
        principalPart = null;
      }
    } else if (miete) {
      category = "miete";
      propertyId = text(miete.objekt_id);
    } else if (gegen && eigeneIbans.has(gegen)) category = "intercompany";
    transactions.push({
      id: String(b.id),
      accountId: iban,
      bookingDate: isoTag(b.buchungsdatum) ?? stichtag,
      amount: betrag,
      counterpartyName: text(b.auftraggeber_name) ?? "",
      counterpartyIban: gegen,
      purpose: text(b.verwendungszweck) ?? "",
      category,
      propertyId,
      interestPart,
      principalPart,
    });
  }
  transactions.sort(
    (a, b) =>
      a.bookingDate.localeCompare(b.bookingDate) || a.id.localeCompare(b.id),
  );

  // letzter bekannter Saldo je Konto: manuell schlägt camt053 am selben Tag
  const saldoJeKonto = new Map<string, { stichtag: string; saldo: number }>();
  for (const s of r.kontosalden ?? []) {
    const iban = String(s.iban);
    const tag = isoTag(s.stichtag);
    const saldo = zahl(s.saldo);
    if (!tag || saldo == null) continue;
    const alt = saldoJeKonto.get(iban);
    if (
      !alt ||
      tag > alt.stichtag ||
      (tag === alt.stichtag && s.quelle === "manuell")
    )
      saldoJeKonto.set(iban, { stichtag: tag, saldo });
  }
  const fensterStart = transactions[0]?.bookingDate ?? plusTage(stichtag, -30);
  const bankAccounts: BankAccount[] = [...konten.entries()].map(([iban, k]) => {
    const saldo = saldoJeKonto.get(iban);
    const flussBis = (tag: string) =>
      transactions
        .filter((t) => t.accountId === iban && t.bookingDate <= tag)
        .reduce((s, t) => s + t.amount, 0);
    return {
      id: iban,
      companyId: k.companyId,
      iban,
      bankName: k.bank,
      label: k.label,
      openingBalance: saldo ? saldo.saldo - flussBis(saldo.stichtag) : 0,
      openingDate: fensterStart,
      saldoBekannt: Boolean(saldo),
      saldoStichtag: saldo?.stichtag ?? null,
      zugang: k.zugang,
      propertyId: k.propertyId,
    };
  });
  for (const k of bankAccounts)
    if (!k.saldoBekannt)
      luecke({
        id: `konten:saldo:${k.iban}`,
        bereich: "konten",
        schwere: "rot",
        titel: `Kontostand fehlt: ${companies.find((c) => c.id === k.companyId)?.shortName ?? k.companyId} ${k.iban.slice(-4)}`,
        detail:
          "Ohne Saldo zeigt die Liquidität nur die Summe der Umsätze, nicht den echten Kontostand.",
        companyId: k.companyId,
        refType: "konto",
        refId: k.iban,
        naechsterSchritt:
          "Kontostand unter Datenqualität erfassen. Ab dem nächsten EBICS-Abruf kommt er automatisch.",
      });
  for (const c of companies) {
    if (c.separateArea) continue;
    if (!bankAccounts.some((k) => k.companyId === c.id))
      luecke({
        id: `konten:keine:${c.id}`,
        bereich: "konten",
        schwere: "rot",
        titel: `Keine Bankdaten: ${c.name}`,
        detail:
          "Für diese Gesellschaft ist kein Konto hinterlegt und kein EBICS-Zugang eingerichtet. Ihre Liquidität fehlt in der Gruppensumme.",
        companyId: c.id,
        refType: "company",
        refId: c.id,
        naechsterSchritt:
          "Konto mit Kontostand erfassen, mittelfristig EBICS bei der Bank beantragen.",
      });
  }
  const dubletten = r.bankbuchungenRoh - r.bankbuchungen.length;
  if (dubletten > 0)
    luecke({
      id: "system:bankbuchungen-dubletten",
      bereich: "system",
      schwere: "gelb",
      titel: `${dubletten} doppelte Bankbuchungen ausgeblendet`,
      detail:
        "Der EBICS-Abruf prüft Doppelte nur je Sollstellungslauf. Holen zwei Läufe denselben Monat, landen Buchungen zweimal in der Datenbank. Das Board zählt jede Buchung nur einmal.",
      naechsterSchritt:
        "Ben: Fingerprint-Prüfung im Abruf über alle Läufe (Vorschlag in docs/DATENGRUNDLAGE.md).",
    });

  // --- Planposten ----------------------------------------------------------
  const plannedPayments: PlannedPayment[] = (r.planposten ?? []).map((p) => ({
    id: String(p.id),
    companyId: String(p.gesellschaft_id),
    date: isoTag(p.datum) ?? stichtag,
    amount: zahl(p.betrag) ?? 0,
    label: text(p.bezeichnung) ?? "",
    monthlyUntil: isoTag(p.monatlich_bis),
    category: ((): TxKategorie => {
      const k = text(p.kategorie);
      return k === "projekt" || !k ? "sonstiges" : (k as TxKategorie);
    })(),
  }));

  // --- Aufteiler-Projekte ----------------------------------------------------
  for (const p of properties.filter((x) => x.strategy === "aufteiler"))
    luecke({
      id: `immobilien:projekt:${p.id}`,
      bereich: "immobilien",
      schwere: "gelb",
      titel: `Projektplan fehlt: ${p.name}`,
      detail:
        "Für Aufteiler-Projekte fehlen Sanierungsbudget, Eigenkapitaleinsatz und Plan-Erlös. Marge und gebundenes Kapital sind deshalb nicht berechenbar.",
      companyId: p.companyId,
      refType: "property",
      refId: p.id,
      naechsterSchritt:
        "Projektdaten liefern (Vorschlag einer Tabelle in docs/DATENGRUNDLAGE.md).",
    });

  // --- Transaktionen ---------------------------------------------------------
  const crm = transaktionenAbbilden(r, luecke);

  // --- Baumaschinen ----------------------------------------------------------
  const machines: Machine[] = (r.maschinen ?? []).map((m) => ({
    id: String(m.id),
    companyId: String(m.gesellschaft_id),
    hersteller: text(m.hersteller) ?? "",
    modell: text(m.modell) ?? "",
    kategorie: text(m.kategorie),
    baujahr: zahl(m.baujahr),
    betriebsstunden: zahl(m.betriebsstunden),
    seriennummer: text(m.seriennummer),
    standort: text(m.standort),
    status: (text(m.status) as Machine["status"]) ?? "lager",
    ankaufAm: isoTag(m.ankauf_am),
    einkaufspreis: zahl(m.einkaufspreis),
    lieferant: text(m.lieferant),
    angebotspreis: zahl(m.angebotspreis),
    inseratUrl: text(m.inserat_url),
    verkaufAm: isoTag(m.verkauf_am),
    verkaufspreis: zahl(m.verkaufspreis),
    kaeufer: text(m.kaeufer),
    bemerkung: text(m.bemerkung),
  }));
  const machineCosts: MachineCost[] = (r.maschinenKosten ?? []).map((k) => ({
    id: String(k.id),
    machineId: String(k.maschine_id),
    datum: isoTag(k.datum) ?? stichtag,
    art: text(k.art) ?? "sonstiges",
    betrag: zahl(k.betrag) ?? 0,
  }));
  const handel = companies.filter((c) => c.segment === "baumaschinen_handel");
  if (machines.length === 0)
    for (const c of handel)
      luecke({
        id: `baumaschinen:bestand:${c.id}`,
        bereich: "baumaschinen",
        schwere: "rot",
        titel: `Kein Maschinenbestand erfasst: ${c.name}`,
        detail:
          "Lagerbestand, Lagerdauer und Rohertrag des Handels sind ohne Maschinenliste nicht berechenbar.",
        companyId: c.id,
        refType: "company",
        refId: c.id,
        naechsterSchritt: "Bestandsliste unter Baumaschinen → Import einlesen.",
      });
  for (const m of machines)
    if (m.status !== "einkauf" && (m.einkaufspreis == null || !m.ankaufAm))
      luecke({
        id: `baumaschinen:einkauf:${m.id}`,
        bereich: "baumaschinen",
        schwere: "gelb",
        titel: `Einkaufsdaten fehlen: ${m.id} ${m.hersteller} ${m.modell}`,
        detail:
          "Ohne Einkaufspreis und -datum fehlen Rohertrag und Lagerdauer.",
        companyId: m.companyId,
        refType: "maschine",
        refId: m.id,
        naechsterSchritt: "Einkaufspreis und Ankaufdatum nachtragen.",
      });

  // --- Datenstand je Quelle -------------------------------------------------
  const ebicsGesellschaften = new Set(
    r.ebicsKunden
      .filter((k) => k.status === "bereit")
      .map((k) => String(k.gesellschaft_id)),
  );
  const letzterAbruf = maxIso(r.bankbuchungen.map((b) => b.created_at));
  const ohneSaldo = bankAccounts.filter((k) => !k.saldoBekannt).length;
  const ageTage = (iso: string | null) =>
    iso
      ? Math.round(
          (Date.parse(stichtag) - Date.parse(iso.slice(0, 10))) / 86_400_000,
        )
      : null;
  const abrufAlter = ageTage(letzterAbruf);
  const datenstand: QuellenStand[] = [
    {
      id: "stammdaten",
      label: "Gesellschaften, Objekte, Einheiten, Mietverträge",
      system: "FRENKEN Verwaltung (Supabase)",
      stand: maxIso(
        [...r.objekte, ...r.einheiten, ...r.mietverhaeltnisse].map(
          (x) => x.updated_at,
        ),
      ),
      anzahl:
        r.objekte.length + r.einheiten.length + r.mietverhaeltnisse.length,
      status: luecken.some(
        (l) => l.bereich === "immobilien" && l.schwere === "rot",
      )
        ? "fehlt"
        : luecken.some((l) => l.bereich === "immobilien")
          ? "warn"
          : "ok",
      hinweis: `${companies.length} Gesellschaften, ${properties.length} Objekte, ${units.length} Einheiten, ${leases.length} Mietverträge`,
    },
    {
      id: "bankumsaetze",
      label: "Kontoumsätze",
      system: "EBICS camt.053 (Volksbank)",
      stand: letzterAbruf,
      anzahl: transactions.length,
      status: abrufAlter == null ? "fehlt" : abrufAlter > 3 ? "warn" : "ok",
      hinweis: `${ebicsGesellschaften.size} von ${companies.filter((c) => !c.separateArea).length} Gesellschaften per EBICS angebunden${dubletten > 0 ? `; ${dubletten} Dubletten ausgeblendet` : ""}`,
    },
    {
      id: "kontosalden",
      label: "Kontostände",
      system: r.kontosalden
        ? "camt.053 und manuelle Erfassung"
        : "keine Quelle",
      stand: maxIso([...saldoJeKonto.values()].map((s) => s.stichtag)),
      anzahl: bankAccounts.length - ohneSaldo,
      status:
        !r.kontosalden || bankAccounts.length === ohneSaldo
          ? "fehlt"
          : ohneSaldo > 0
            ? "warn"
            : "ok",
      hinweis: `${bankAccounts.length - ohneSaldo} von ${bankAccounts.length} Konten mit Saldo`,
    },
    {
      id: "darlehen",
      label: "Darlehen",
      system: "Darlehensregister in der App (Abgleich mit EBICS)",
      stand: maxIso(r.darlehen.map((d) => d.updated_at)),
      anzahl: loans.length,
      status: luecken.some(
        (l) => l.bereich === "darlehen" && l.schwere === "rot",
      )
        ? "fehlt"
        : luecken.some((l) => l.bereich === "darlehen")
          ? "warn"
          : "ok",
      hinweis: `${loans.filter((l) => l.status === "aktiv").length} aktiv, ${r.darlehenBuchungen.length} Bankbuchungen zugeordnet`,
    },
    {
      id: "planposten",
      label: "Planposten (Steuern, Personal, Ankäufe)",
      system: r.planposten ? "manuelle Erfassung im Board" : "keine Quelle",
      stand: maxIso((r.planposten ?? []).map((p) => p.updated_at)),
      anzahl: plannedPayments.length,
      status: plannedPayments.length > 0 ? "ok" : "fehlt",
      hinweis:
        plannedPayments.length > 0
          ? `${plannedPayments.length} Posten`
          : "Ohne Planposten rechnet die Liquidität nur mit Mieten und Kapitaldienst.",
    },
    {
      id: "rechnungen",
      label: "Offene Rechnungen",
      system: "keine Quelle (Rechnungsfreigabe kennt keine Fälligkeit/Zahlung)",
      stand: null,
      anzahl: 0,
      status: "fehlt",
      hinweis:
        "Offene Eingangs- und Ausgangsrechnungen fehlen in der Liquiditätsplanung.",
    },
    {
      id: "transaktionen",
      label: "Transaktionspipeline",
      system:
        "Ankaufspipeline in der App, Exposés aus dem Postfach, Salesforce verknüpft",
      stand: maxIso(
        [...r.ankaufPipeline, ...r.exposes].map((x) => x.updated_at),
      ),
      anzahl: crm.ankaeufe.length,
      status: crm.ankaeufe.length > 0 ? "ok" : "warn",
      hinweis: `${crm.ankaeufe.length} Ankäufe in der Pipeline, ${crm.exposes.length} Exposés eingegangen`,
    },
    {
      id: "maschinen",
      label: "Maschinenbestand",
      system: r.maschinen ? "Import / Erfassung im Board" : "keine Quelle",
      stand: maxIso((r.maschinen ?? []).map((m) => m.updated_at)),
      anzahl: machines.length,
      status: machines.length > 0 ? "ok" : "fehlt",
      hinweis:
        machines.length > 0
          ? `${machines.filter((m) => m.status !== "verkauft").length} Maschinen im Bestand`
          : "Noch keine Maschinen erfasst.",
    },
  ];

  return {
    stichtag,
    quelle: "live",
    companies,
    parties,
    properties,
    units,
    tenants,
    leases,
    leaseEvents,
    loans,
    bankAccounts,
    transactions,
    invoices: [],
    documents: [],
    reviewItems: [],
    crmLinks: [],
    projects: [],
    plannedPayments,
    machines,
    machineCosts,
    crm,
    datenstand,
    luecken: luecken.filter((l) => !l.companyId || companyIds.has(l.companyId)),
  };
}

function transaktionenAbbilden(
  r: LiveRohdaten,
  luecke: (
    l: Omit<DatenLuecke, "companyId" | "refType" | "refId"> &
      Partial<DatenLuecke>,
  ) => void,
): CrmDaten {
  const profilName = new Map(
    r.profiles.map((p) => [String(p.id), text(p.name) ?? ""]),
  );
  const ankaufJeExpose = new Map<string, string>();
  const ankaeufe: Ankauf[] = r.ankaufPipeline.map((a) => {
    const id = String(a.id);
    if (text(a.expose_id)) ankaufJeExpose.set(String(a.expose_id), id);
    const ek = zahl(a.ek_quote);
    const strategie = text(a.strategie);
    const phase = (text(a.stufe) ?? "expose") as Ankauf["phase"];
    if (ek == null && ["angebot", "due_diligence", "notar"].includes(phase))
      luecke({
        id: `transaktionen:ekquote:${id}`,
        bereich: "transaktionen",
        schwere: "gelb",
        titel: `EK-Quote fehlt: ${text(a.bezeichnung) ?? id}`,
        detail:
          "Der Eigenkapitalbedarf wird mit 30 % gerechnet, bis eine Finanzierung erfasst ist.",
        companyId: text(a.ziel_gesellschaft_id),
        refType: "ankauf",
        refId: id,
        naechsterSchritt: "EK-Quote im Deal erfassen.",
      });
    return {
      id,
      sfId: text(a.salesforce_transaktion_id),
      exposeId: text(a.expose_id),
      name: text(a.bezeichnung) ?? id,
      strasse: text(a.strasse) ?? "",
      ort: [text(a.plz), text(a.ort)].filter(Boolean).join(" "),
      assetKlasse: strategie === "gewerbe" ? "Gewerbe" : "Wohnen",
      einheiten: zahl(a.einheiten_anzahl),
      flaeche: zahl(a.flaeche_m2),
      angebotspreis: zahl(a.angebotspreis) ?? zahl(a.kaufpreis_forderung) ?? 0,
      jahresnettokaltmiete: zahl(a.jahresnettokaltmiete),
      makler: text(a.makler),
      phase,
      phaseSeit: isoTag(a.stufe_seit) ?? isoTag(a.updated_at) ?? r.stichtag,
      naechsterSchritt: text(a.naechster_schritt) ?? "",
      naechsterSchrittAm: isoTag(a.naechster_schritt_am),
      verantwortlich: profilName.get(String(a.verantwortlich_id)) ?? "",
      zielGesellschaftId: text(a.ziel_gesellschaft_id),
      ekQuote: ek ?? 0.3,
      ekQuoteGesetzt: ek != null,
      notartermin: isoTag(a.notartermin),
      strategie:
        strategie === "aufteiler"
          ? "aufteiler"
          : strategie === "gewerbe"
            ? "gewerbe"
            : "bestand",
    };
  });

  const feld = (f: unknown, key: string): unknown => {
    const v = (f as Record<string, { value?: unknown }> | null)?.[key];
    return v && typeof v === "object" ? v.value : null;
  };
  const exposes: Expose[] = r.exposes.map((e) => {
    const f = e.felder;
    return {
      id: String(e.id),
      eingegangenAm: isoTag(e.eingegangen_am),
      betreff: text(e.betreff) ?? "",
      absender: text(e.absender_name) ?? "",
      status: text(e.status) ?? "",
      adresse: text(feld(f, "objektadresse")) ?? "",
      ort: [text(feld(f, "plz")), text(feld(f, "stadt"))]
        .filter(Boolean)
        .join(" "),
      angebotspreis: zahl(feld(f, "angebotspreis")),
      jahresnettokaltmiete: zahl(feld(f, "jahresnettokaltmiete")),
      flaeche:
        zahl(feld(f, "mietflaecheGesamt")) ?? zahl(feld(f, "wohnflaeche")),
      einheiten: zahl(feld(f, "anzahlWohnungen")),
      makler: text(feld(f, "makler")),
      sfTransaktionId: text(e.salesforce_transaktion_id),
      ankaufId: ankaufJeExpose.get(String(e.id)) ?? null,
    };
  });

  const objektVerkaeufe: ObjektVerkauf[] = (r.objektVerkauf ?? []).map((v) => ({
    id: String(v.id),
    propertyId: String(v.objekt_id),
    stufe: (text(v.stufe) ?? "vorbereitung") as ObjektVerkauf["stufe"],
    stufeSeit: isoTag(v.stufe_seit) ?? r.stichtag,
    angebotspreis: zahl(v.angebotspreis),
    kaufpreis: zahl(v.kaufpreis),
    makler: text(v.makler),
    notartermin: isoTag(v.notartermin),
    naechsterSchritt: text(v.naechster_schritt) ?? "",
    sfId: text(v.salesforce_transaktion_id),
  }));

  const kaeufer: Kaeufer[] = r.personen
    .filter((p) => p.typ === "kaeufer")
    .map((p) => ({
      id: String(p.id),
      sfId: null,
      name: personName(p),
      email: text(p.e_mail) ?? "",
      finanzierung: "unbekannt",
    }));

  const reservierungen: Reservierung[] = r.einheitenVerkauf.map((v) => ({
    id: String(v.id),
    sfId: null,
    unitId: String(v.einheit_id),
    kaeuferId: text(v.kaeufer_person_id),
    status: (text(v.stufe) ?? "in_vermarktung") as Reservierung["status"],
    preis: zahl(v.kaufpreis) ?? zahl(v.angebotspreis) ?? 0,
    datum: isoTag(v.updated_at) ?? r.stichtag,
    notartermin: isoTag(v.notartermin),
  }));

  return {
    ankaeufe,
    objektVerkaeufe,
    kaeufer,
    reservierungen,
    exposes,
    instanzUrl: null,
  };
}
