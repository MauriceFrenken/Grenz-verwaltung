/**
 * Baumaschinen: Handel (Lager, Rohertrag, Kapitalbindung) und Plattform
 * (Burn-Rate, Runway). Reine Funktionen, Stichtag wird übergeben.
 */
import type { Ampel } from "@/components/board/ampel";
import type {
  BoardDaten,
  Machine,
  MachineCost,
  ReviewItem,
} from "@/lib/db/typen";
import {
  plusMonate,
  plusTage,
  tageZwischen,
  type IsoDatum,
} from "@/lib/kalender";
import { runden } from "@/modules/darlehen/logik/zinsplan";

/** Annahme: Bestand ist über IC-Darlehen der Holding zu 3 % p.a. finanziert. */
export const IC_ZINS = 0.03;
/** Lagerdauer, ab der eine Maschine gelb bzw. rot wird (Tage). */
export const LAGER_GELB = 90;
export const LAGER_ROT = 180;

export interface MaschinenKennzahlen {
  machine: Machine;
  kosten: number;
  /** Einkaufspreis + Nebenkosten */
  einstand: number;
  /** Tage im Bestand bis heute bzw. bis zum Verkauf */
  lagerTage: number | null;
  /** realisiert (verkauft) bzw. erwartet zum Angebotspreis */
  rohertrag: number | null;
  marge: number | null;
  /** kalkulatorische Finanzierungskosten der Lagerzeit */
  zinskosten: number;
  ampel: Ampel;
}

export function maschinenKennzahlen(
  m: Machine,
  kosten: MachineCost[],
  stichtag: IsoDatum,
): MaschinenKennzahlen {
  const k = kosten
    .filter((x) => x.machineId === m.id)
    .reduce((s, x) => s + x.betrag, 0);
  const einstand = (m.einkaufspreis ?? 0) + k;
  const bis = m.status === "verkauft" ? (m.verkaufAm ?? stichtag) : stichtag;
  const lagerTage = m.ankaufAm
    ? Math.max(0, tageZwischen(m.ankaufAm, bis))
    : null;
  const preis = m.status === "verkauft" ? m.verkaufspreis : m.angebotspreis;
  const rohertrag =
    preis != null && m.einkaufspreis != null ? runden(preis - einstand) : null;
  const aktiv = m.status !== "verkauft";
  return {
    machine: m,
    kosten: runden(k),
    einstand: runden(einstand),
    lagerTage,
    rohertrag,
    marge: rohertrag != null && preis ? rohertrag / preis : null,
    zinskosten:
      lagerTage != null ? runden((einstand * IC_ZINS * lagerTage) / 365) : 0,
    ampel: !aktiv
      ? "grau"
      : lagerTage == null
        ? "gelb"
        : lagerTage >= LAGER_ROT
          ? "rot"
          : lagerTage >= LAGER_GELB
            ? "gelb"
            : "gruen",
  };
}

export interface HandelAuswertung {
  maschinen: MaschinenKennzahlen[];
  bestand: MaschinenKennzahlen[];
  /** gebundenes Kapital zu Einstandspreisen */
  lagerwert: number;
  lagerDauerSchnitt: number | null;
  verkauft12: MaschinenKennzahlen[];
  umsatz12: number;
  rohertrag12: number;
  marge12: number | null;
  /** Wareneinsatz der letzten 12 Monate / aktueller Lagerwert */
  umschlag: number | null;
  /** erwarteter Rohertrag des Bestands zu Angebotspreisen */
  rohertragBestand: number;
  /** Restschuld IC- und Gesellschafterdarlehen an die Handelsgesellschaften */
  icFinanzierung: number;
  /** Zinsen p.a. auf diese Darlehen */
  icZinsenPa: number;
}

export function handelAuswerten(
  daten: Pick<
    BoardDaten,
    "stichtag" | "machines" | "machineCosts" | "companies" | "loans"
  >,
  filter: (companyId: string) => boolean = () => true,
): HandelAuswertung {
  const stichtag = daten.stichtag;
  const handel = new Set(
    daten.companies
      .filter((c) => c.segment === "baumaschinen_handel" && filter(c.id))
      .map((c) => c.id),
  );
  const maschinen = daten.machines
    .filter((m) => handel.has(m.companyId))
    .map((m) => maschinenKennzahlen(m, daten.machineCosts, stichtag));
  const bestand = maschinen.filter(
    (k) => k.machine.status !== "verkauft" && k.machine.status !== "einkauf",
  );
  const lagerwert = bestand.reduce((s, k) => s + k.einstand, 0);
  const mitDauer = bestand.filter((k) => k.lagerTage != null);
  const seit = plusMonate(stichtag, -12);
  const verkauft12 = maschinen.filter(
    (k) =>
      k.machine.status === "verkauft" && (k.machine.verkaufAm ?? "") > seit,
  );
  const umsatz12 = verkauft12.reduce(
    (s, k) => s + (k.machine.verkaufspreis ?? 0),
    0,
  );
  const rohertrag12 = verkauft12.reduce((s, k) => s + (k.rohertrag ?? 0), 0);
  const einsatz12 = verkauft12.reduce((s, k) => s + k.einstand, 0);
  const ic = daten.loans.filter(
    (l) =>
      l.status === "aktiv" &&
      l.borrowerCompanyId != null &&
      handel.has(l.borrowerCompanyId) &&
      l.kind !== "bank",
  );
  const icFinanzierung = ic.reduce(
    (s, l) => s + (l.istSaldo ?? l.principal),
    0,
  );
  return {
    maschinen,
    bestand,
    lagerwert: runden(lagerwert),
    lagerDauerSchnitt: mitDauer.length
      ? Math.round(
          mitDauer.reduce((s, k) => s + (k.lagerTage ?? 0), 0) /
            mitDauer.length,
        )
      : null,
    verkauft12,
    umsatz12: runden(umsatz12),
    rohertrag12: runden(rohertrag12),
    marge12: umsatz12 > 0 ? rohertrag12 / umsatz12 : null,
    umschlag: lagerwert > 0 && einsatz12 > 0 ? einsatz12 / lagerwert : null,
    rohertragBestand: runden(
      bestand.reduce((s, k) => s + (k.rohertrag ?? 0), 0),
    ),
    icFinanzierung: runden(icFinanzierung),
    icZinsenPa: runden(
      ic.reduce((s, l) => s + (l.istSaldo ?? l.principal) * l.rate, 0),
    ),
  };
}

export interface PlattformAuswertung {
  companyId: string;
  name: string;
  /** Bankbestand heute (nur Konten mit bekanntem Saldo) */
  bestand: number | null;
  /** Ø monatlicher Nettoabfluss der letzten 3 Monate (positiv = Verbrauch) */
  burnRate: number | null;
  /** Monate bis Liquidität aufgebraucht ist */
  runwayMonate: number | null;
  /** Finanzierung durch Gruppe (IC-/Gesellschafterdarlehen) */
  finanzierung: number;
  datenVorhanden: boolean;
}

export function plattformAuswerten(
  daten: Pick<
    BoardDaten,
    "stichtag" | "companies" | "bankAccounts" | "transactions" | "loans"
  >,
  filter: (companyId: string) => boolean = () => true,
): PlattformAuswertung[] {
  const stichtag = daten.stichtag;
  const seit = plusTage(stichtag, -91);
  return daten.companies
    .filter((c) => c.segment === "baumaschinen_plattform" && filter(c.id))
    .map((c) => {
      const konten = daten.bankAccounts.filter((k) => k.companyId === c.id);
      const ids = new Set(konten.map((k) => k.id));
      const tx = daten.transactions.filter(
        (t) => ids.has(t.accountId) && t.bookingDate <= stichtag,
      );
      const bestand =
        konten.length && konten.every((k) => k.saldoBekannt)
          ? runden(
              konten.reduce((s, k) => s + k.openingBalance, 0) +
                tx.reduce((s, t) => s + t.amount, 0),
            )
          : null;
      const netto3 = tx
        .filter((t) => t.bookingDate > seit)
        .reduce((s, t) => s + t.amount, 0);
      const burnRate = tx.length ? runden(Math.max(0, -netto3 / 3)) : null;
      const finanzierung = daten.loans
        .filter((l) => l.status === "aktiv" && l.borrowerCompanyId === c.id)
        .reduce((s, l) => s + (l.istSaldo ?? l.principal), 0);
      return {
        companyId: c.id,
        name: c.name,
        bestand,
        burnRate,
        runwayMonate:
          bestand != null && burnRate
            ? Math.floor((bestand / burnRate) * 10) / 10
            : null,
        finanzierung: runden(finanzierung),
        datenVorhanden: konten.length > 0,
      };
    });
}

/** Prüffälle: Maschinen, die zu lange im Lager stehen. */
export function baumaschinenPruefFaelle(
  daten: Pick<BoardDaten, "stichtag" | "machines" | "machineCosts">,
): ReviewItem[] {
  return daten.machines
    .map((m) => maschinenKennzahlen(m, daten.machineCosts, daten.stichtag))
    .filter((k) => k.ampel === "rot")
    .map((k) => ({
      id: `baumaschinen:lager:${k.machine.id}`,
      source: "baumaschinen" as const,
      severity: "gelb" as const,
      title: `Lange im Lager: ${k.machine.hersteller} ${k.machine.modell}`,
      detail: `${k.lagerTage} Tage im Bestand, ${Math.round(k.einstand).toLocaleString("de-DE")} € gebunden, rund ${Math.round(k.zinskosten).toLocaleString("de-DE")} € Finanzierungskosten. Preis senken oder Vermarktung ändern?`,
      companyId: k.machine.companyId,
      refType: "maschine",
      refId: k.machine.id,
      dueDate: daten.stichtag,
      createdAt: daten.stichtag,
      status: "offen" as const,
      confidence: null,
    }));
}
