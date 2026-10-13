/**
 * Soll-Miete, Ist-Miete und Rückstände je Mietvertrag (reine Funktionen).
 * Soll = Kaltmiete (inkl. wirksamer Mieterhöhungen) + Nebenkostenvorauszahlung,
 * fällig am 3. Werktag des Monats (§ 556b BGB).
 */
import type { Ampel } from "@/components/board/ampel";
import {
  monatsanfang,
  monatsende,
  nterWerktag,
  plusMonate,
  plusTage,
  tageZwischen,
  teile,
  type IsoDatum,
} from "@/lib/kalender";
import type { Mietkonto as DbMietkonto } from "@/lib/db/mieten";
import type { Lease, LeaseEvent, Tenant, Transaction } from "@/lib/db/typen";
import { runden } from "@/modules/darlehen/logik/zinsplan";
import { kuendigungFristende, mieterhoehungFristen } from "./fristen";

/** Kaltmiete in einem Monat unter Berücksichtigung zugestimmter Mieterhöhungen. */
export function kaltmieteImMonat(
  lease: Lease,
  events: LeaseEvent[],
  monat: IsoDatum,
): number {
  let miete = lease.baseRent;
  const erhoehungen = events
    .filter(
      (e) =>
        e.leaseId === lease.id &&
        e.kind === "mieterhoehung" &&
        e.status === "zugestimmt",
    )
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
  for (const e of erhoehungen) {
    if (
      e.kind === "mieterhoehung" &&
      monatsanfang(monat) >= mieterhoehungFristen(e.receivedOn).wirksamAb
    ) {
      miete = e.newBaseRent;
    }
  }
  return miete;
}

/** Ende des Mietverhältnisses: vereinbartes Ende oder Fristende einer Kündigung. */
export function mietende(lease: Lease, events: LeaseEvent[]): IsoDatum | null {
  const k = events.find(
    (e) => e.leaseId === lease.id && e.kind === "kuendigung",
  );
  if (k && k.kind === "kuendigung") {
    return (
      k.moveOutPlanned ?? kuendigungFristende(k.by, lease.start, k.receivedOn)
    );
  }
  return lease.end;
}

export function istAktiv(
  lease: Lease,
  events: LeaseEvent[],
  tag: IsoDatum,
): boolean {
  const ende = mietende(lease, events);
  return lease.start <= tag && (!ende || ende >= tag);
}

/** Warmmiete (Soll) für den Monat, 0 wenn kein laufender Vertrag. */
export function sollMiete(
  lease: Lease,
  events: LeaseEvent[],
  monat: IsoDatum,
): number {
  const anfang = monatsanfang(monat);
  const ende = mietende(lease, events);
  if (monatsende(anfang) < lease.start || (ende && anfang > ende)) return 0;
  return runden(kaltmieteImMonat(lease, events, anfang) + lease.serviceCharge);
}

export interface MietMonat {
  monat: string;
  faellig: IsoDatum;
  soll: number;
  ist: number;
}

export interface MietKonto {
  lease: Lease;
  monate: MietMonat[];
  sollSumme: number;
  istSumme: number;
  /** offener Betrag (positiv = Rückstand) */
  rueckstand: number;
  /** Rückstand in Monatsmieten */
  rueckstandMonate: number;
  ampel: Ampel;
}

/** Zahlung gehört zum Mieter: IBAN gleich oder Name gleich (Mietzahlungen). */
function zahlungVonMieter(tx: Transaction, tenant: Tenant): boolean {
  if (tx.category !== "miete" || tx.amount <= 0) return false;
  if (tx.counterpartyIban && tx.counterpartyIban === tenant.iban) return true;
  return (
    tx.counterpartyName.trim().toLowerCase() ===
    tenant.name.trim().toLowerCase()
  );
}

/**
 * Mietkonto über die letzten `monate` Monate bis zum Stichtag.
 * Ein Monat zählt erst als fällig, wenn sein 3. Werktag erreicht ist.
 * Zahlungen werden dem Monat ihres Buchungsdatums zugerechnet (Vorauszahlung zum Monatsanfang).
 */
export function mietKonto(
  lease: Lease,
  events: LeaseEvent[],
  tenant: Tenant,
  transactions: Transaction[],
  stichtag: IsoDatum,
  monate = 12,
): MietKonto {
  const zahlungen = transactions.filter((t) => zahlungVonMieter(t, tenant));
  const liste: MietMonat[] = [];
  for (let i = monate - 1; i >= 0; i--) {
    const anfang = monatsanfang(plusMonate(stichtag, -i));
    const { jahr, monat } = teile(anfang);
    const faellig = nterWerktag(jahr, monat, 3);
    if (faellig > stichtag) continue;
    const soll = sollMiete(lease, events, anfang);
    const ist = runden(
      zahlungen
        .filter(
          (t) => t.bookingDate >= anfang && t.bookingDate <= monatsende(anfang),
        )
        .reduce((s, t) => s + t.amount, 0),
    );
    if (soll === 0 && ist === 0) continue;
    liste.push({ monat: anfang.slice(0, 7), faellig, soll, ist });
  }
  const sollSumme = runden(liste.reduce((s, m) => s + m.soll, 0));
  const istSumme = runden(liste.reduce((s, m) => s + m.ist, 0));
  const rueckstand = runden(Math.max(0, sollSumme - istSumme));
  const monatsMiete =
    sollMiete(lease, events, stichtag) || lease.baseRent + lease.serviceCharge;
  const rueckstandMonate = monatsMiete > 0 ? rueckstand / monatsMiete : 0;
  const ampel: Ampel =
    rueckstand < 1 ? "gruen" : rueckstandMonate >= 2 ? "rot" : "gelb";
  return {
    lease,
    monate: liste,
    sollSumme,
    istSumme,
    rueckstand,
    rueckstandMonate,
    ampel,
  };
}

/**
 * Mietkonto aus der Datenbank (Mieten-Tracking) übernehmen: Soll aus dem Vertrag,
 * Zahlungen automatisch zugeordnet, älteste Miete zuerst getilgt.
 */
export function mietKontoAusDb(lease: Lease, db: DbMietkonto): MietKonto {
  const liste: MietMonat[] = db.monate
    .filter((m) => m.status !== "noch_nicht_faellig")
    .map((m) => ({
      monat: m.monat.slice(0, 7),
      faellig: m.faellig,
      soll: m.soll,
      ist: m.bezahlt,
    }));
  const monatsMiete = db.monatssoll || lease.baseRent + lease.serviceCharge;
  return {
    lease,
    monate: liste,
    sollSumme: runden(liste.reduce((s, m) => s + m.soll, 0)),
    istSumme: runden(liste.reduce((s, m) => s + m.ist, 0)),
    rueckstand: db.rueckstand,
    rueckstandMonate: monatsMiete > 0 ? db.rueckstand / monatsMiete : 0,
    ampel:
      db.stufe === "ok"
        ? "gruen"
        : db.stufe === "kuendigung_pruefen"
          ? "rot"
          : "gelb",
  };
}

export interface KuendigungInfo {
  event: Extract<LeaseEvent, { kind: "kuendigung" }>;
  fristende: IsoDatum;
  auszug: IsoDatum;
  leerAb: IsoDatum;
  /** Annahme: Wiedervermietung nach `WIEDERVERMIETUNG_TAGE` Tagen */
  leerstandTageProg: number;
  mietausfallProg: number;
  tageBisFristende: number;
  ampel: Ampel;
}

/** Annahme für die Leerstandsprognose: Dauer bis zur Neuvermietung. */
export const WIEDERVERMIETUNG_TAGE = 60;

export function kuendigungInfo(
  event: Extract<LeaseEvent, { kind: "kuendigung" }>,
  lease: Lease,
  stichtag: IsoDatum,
): KuendigungInfo {
  const fristende = kuendigungFristende(
    event.by,
    lease.start,
    event.receivedOn,
  );
  const auszug = event.moveOutPlanned ?? fristende;
  const tagesmiete = (lease.baseRent * 12) / 365;
  const tage = tageZwischen(stichtag, fristende);
  return {
    event,
    fristende,
    auszug,
    leerAb: plusTage(auszug, 1),
    leerstandTageProg: WIEDERVERMIETUNG_TAGE,
    mietausfallProg: runden(tagesmiete * WIEDERVERMIETUNG_TAGE),
    tageBisFristende: tage,
    ampel: tage < 0 ? "grau" : tage <= 30 ? "gelb" : "gruen",
  };
}

export interface MieterhoehungInfo {
  event: Extract<LeaseEvent, { kind: "mieterhoehung" }>;
  zustimmungBis: IsoDatum;
  wirksamAb: IsoDatum;
  bisherigeMiete: number;
  neueMiete: number;
  mehrProMonat: number;
  tageBisFrist: number;
  ampel: Ampel;
  hinweis: string;
}

export function mieterhoehungInfo(
  event: Extract<LeaseEvent, { kind: "mieterhoehung" }>,
  lease: Lease,
  events: LeaseEvent[],
  stichtag: IsoDatum,
): MieterhoehungInfo {
  const { zustimmungBis, wirksamAb } = mieterhoehungFristen(event.receivedOn);
  const bisher = kaltmieteImMonat(
    lease,
    events.filter((e) => e.id !== event.id),
    wirksamAb,
  );
  const tage = tageZwischen(stichtag, zustimmungBis);
  let ampel: Ampel = "gruen";
  let hinweis = "Zugestimmt";
  if (event.status === "abgelehnt") {
    ampel = "rot";
    hinweis = "Abgelehnt: Klage auf Zustimmung prüfen";
  } else if (event.status === "offen" && tage < 0) {
    ampel = "rot";
    hinweis = `Frist abgelaufen: Klage bis ${monatsende(plusMonate(zustimmungBis, 3)).split("-").reverse().join(".")} möglich`;
  } else if (event.status === "offen" && tage <= 14) {
    ampel = "gelb";
    hinweis = "Zustimmung läuft bald ab";
  } else if (event.status === "offen") {
    ampel = "grau";
    hinweis = "Zustimmung ausstehend";
  }
  return {
    event,
    zustimmungBis,
    wirksamAb,
    bisherigeMiete: bisher,
    neueMiete: event.newBaseRent,
    mehrProMonat: runden(event.newBaseRent - bisher),
    tageBisFrist: tage,
    ampel,
    hinweis,
  };
}

/** § 558 BGB: Kappungsgrenze (Annahme 15 % in 3 Jahren, Gebietsverordnung NRW) und Wartefrist 12 Monate für das Verlangen. */
export const KAPPUNGSGRENZE = 0.15;

export function erhoehungsPotenzial(
  lease: Lease,
  events: LeaseEvent[],
  flaeche: number,
  zielMieteQm: number,
  stichtag: IsoDatum,
): { moeglichAb: IsoDatum; potenzialMonat: number } {
  const aktuell = kaltmieteImMonat(lease, events, stichtag);
  const letzte = [
    lease.start,
    lease.lastRentIncrease,
    ...events
      .filter(
        (e) =>
          e.leaseId === lease.id &&
          e.kind === "mieterhoehung" &&
          e.status !== "abgelehnt",
      )
      .map((e) =>
        e.kind === "mieterhoehung"
          ? mieterhoehungFristen(e.receivedOn).wirksamAb
          : null,
      ),
  ]
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1)!;
  const moeglichAb = plusMonate(letzte, 12);
  const offen = events.some(
    (e) =>
      e.leaseId === lease.id &&
      e.kind === "mieterhoehung" &&
      e.status === "offen",
  );
  if (offen) return { moeglichAb, potenzialMonat: 0 };
  const ziel = Math.min(flaeche * zielMieteQm, aktuell * (1 + KAPPUNGSGRENZE));
  return { moeglichAb, potenzialMonat: runden(Math.max(0, ziel - aktuell)) };
}
