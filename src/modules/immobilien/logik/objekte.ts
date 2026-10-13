/**
 * Objekt-Kennzahlen: Leerstand, Soll/Ist-Miete, Objekt-Cashflow mit Kapitaldienst, Aufteiler-Projekte.
 */
import type { Ampel } from "@/components/board/ampel";
import {
  monatsanfang,
  monatsende,
  plusMonate,
  plusTage,
  tageZwischen,
  type IsoDatum,
} from "@/lib/kalender";
import type {
  BoardDaten,
  Project,
  Property,
  ReviewItem,
  Unit,
} from "@/lib/db/typen";
import { datum as datumDe, euro } from "@/lib/format/de";
import type { DarlehenStand } from "@/modules/darlehen/logik/auswertung";
import { runden } from "@/modules/darlehen/logik/zinsplan";
import {
  erhoehungsPotenzial,
  istAktiv,
  kuendigungInfo,
  mieterhoehungInfo,
  mietKonto,
  mietKontoAusDb,
  sollMiete,
  type KuendigungInfo,
  type MieterhoehungInfo,
  type MietKonto,
} from "./mieten";

export interface CashflowMonat {
  monat: string;
  miete: number;
  kosten: number;
  kapitaldienst: number;
  cashflow: number;
}

export interface ObjektKennzahlen {
  property: Property;
  units: Unit[];
  flaeche: number;
  vermietbar: number;
  leer: Unit[];
  leerstandsquote: number;
  sollMieteMonat: number;
  kaltmieteMonat: number;
  mieteJeQm: number;
  potenzialMonat: number;
  rueckstand: number;
  restschuldBank: number;
  ltv: number | null;
  dscr: number | null;
  cashflow: CashflowMonat[];
  cashflow12: number;
  ampel: Ampel;
}

export function leerstandAmpel(quote: number): Ampel {
  if (quote < 0.03) return "gruen";
  if (quote < 0.08) return "gelb";
  return "rot";
}

export function dscrAmpel(dscr: number | null): Ampel {
  if (dscr === null) return "grau";
  if (dscr >= 1.3) return "gruen";
  if (dscr >= 1.1) return "gelb";
  return "rot";
}

export function objektCashflow(
  property: Property,
  daten: Pick<BoardDaten, "transactions" | "loans">,
  staende: DarlehenStand[],
  stichtag: IsoDatum,
  monate = 12,
): CashflowMonat[] {
  const objektDarlehen = staende.filter(
    (s) => s.loan.propertyId === property.id,
  );
  const ergebnis: CashflowMonat[] = [];
  // nur abgeschlossene Monate: der laufende Monat wäre unvollständig
  // (Miete schon da, Kapitaldienst erst zum Monatsende)
  for (let i = monate; i >= 1; i--) {
    const anfang = monatsanfang(plusMonate(stichtag, -i));
    const ende = monatsende(anfang);
    const tx = daten.transactions.filter(
      (t) =>
        t.propertyId === property.id &&
        t.bookingDate >= anfang &&
        t.bookingDate <= ende,
    );
    const miete = tx
      .filter((t) => t.category === "miete")
      .reduce((s, t) => s + t.amount, 0);
    const kosten = -tx
      .filter((t) => t.category === "rechnung")
      .reduce((s, t) => s + t.amount, 0);
    const kapitaldienst = objektDarlehen.reduce(
      (s, d) =>
        s +
        d.plan
          .filter((z) => z.dueDate >= anfang && z.dueDate <= ende)
          .reduce(
            (a, z) =>
              a +
              z.interest +
              (d.loan.repayment.kind === "endfaellig" ? 0 : z.principal),
            0,
          ),
      0,
    );
    ergebnis.push({
      monat: anfang.slice(0, 7),
      miete: runden(miete),
      kosten: runden(kosten),
      kapitaldienst: runden(kapitaldienst),
      cashflow: runden(miete - kosten - kapitaldienst),
    });
  }
  return ergebnis;
}

export function objektKennzahlen(
  property: Property,
  daten: BoardDaten,
  staende: DarlehenStand[],
  mietKonten: MietKonto[],
): ObjektKennzahlen {
  const stichtag = daten.stichtag;
  const units = daten.units.filter((u) => u.propertyId === property.id);
  const flaeche = units.reduce((s, u) => s + u.area, 0);
  const leases = daten.leases.filter(
    (l) =>
      units.some((u) => u.id === l.unitId) &&
      istAktiv(l, daten.leaseEvents, stichtag),
  );
  const vermietbareUnits =
    property.strategy === "bestand"
      ? units
      : units.filter((u) => u.status === "vermietet" || u.status === "leer");
  const leer = vermietbareUnits.filter(
    (u) => u.status === "leer" || u.status === "sanierung",
  );
  const vermietbar = vermietbareUnits.reduce((s, u) => s + u.area, 0);
  const leerFlaeche = leer.reduce((s, u) => s + u.area, 0);
  const sollMieteMonat = leases.reduce(
    (s, l) => s + sollMiete(l, daten.leaseEvents, stichtag),
    0,
  );
  const kaltmieteMonat = leases.reduce(
    (s, l) => s + sollMiete(l, daten.leaseEvents, stichtag) - l.serviceCharge,
    0,
  );
  const vermieteteFlaeche = leases.reduce(
    (s, l) => s + (units.find((u) => u.id === l.unitId)?.area ?? 0),
    0,
  );
  const potenzialMonat = leases.reduce((s, l) => {
    const u = units.find((x) => x.id === l.unitId)!;
    if (property.targetRentPerSqm == null) return s;
    return (
      s +
      erhoehungsPotenzial(
        l,
        daten.leaseEvents,
        u.area,
        property.targetRentPerSqm,
        stichtag,
      ).potenzialMonat
    );
  }, 0);
  const rueckstand = mietKonten
    .filter((k) => units.some((u) => u.id === k.lease.unitId))
    .reduce((s, k) => s + k.rueckstand, 0);
  const bank = staende.filter(
    (s) => s.loan.propertyId === property.id && s.loan.kind === "bank",
  );
  const restschuldBank = bank.reduce((s, d) => s + d.restschuld, 0);
  const cashflow = objektCashflow(property, daten, staende, stichtag);
  const miete12 = cashflow.reduce((s, m) => s + m.miete, 0);
  const kosten12 = cashflow.reduce((s, m) => s + m.kosten, 0);
  const kd12 = cashflow.reduce((s, m) => s + m.kapitaldienst, 0);
  const dscr =
    property.strategy === "bestand" && kd12 > 0
      ? (miete12 - kosten12) / kd12
      : null;
  const leerstandsquote = vermietbar > 0 ? leerFlaeche / vermietbar : 0;
  const ampeln: Ampel[] =
    property.strategy === "bestand"
      ? [leerstandAmpel(leerstandsquote), dscrAmpel(dscr)]
      : [];
  return {
    property,
    units,
    flaeche: runden(flaeche),
    vermietbar: runden(vermietbar),
    leer,
    leerstandsquote,
    sollMieteMonat: runden(sollMieteMonat),
    kaltmieteMonat: runden(kaltmieteMonat),
    mieteJeQm: vermieteteFlaeche > 0 ? kaltmieteMonat / vermieteteFlaeche : 0,
    potenzialMonat: runden(potenzialMonat),
    rueckstand: runden(rueckstand),
    restschuldBank: runden(restschuldBank),
    ltv:
      property.marketValue && restschuldBank > 0
        ? restschuldBank / property.marketValue
        : null,
    dscr,
    cashflow,
    cashflow12: runden(cashflow.reduce((s, m) => s + m.cashflow, 0)),
    ampel: ampeln.includes("rot")
      ? "rot"
      : ampeln.includes("gelb")
        ? "gelb"
        : property.strategy === "bestand"
          ? "gruen"
          : "grau",
  };
}

export interface ProjektKennzahlen {
  project: Project;
  property: Property;
  units: Unit[];
  verkauft: number;
  reserviert: number;
  imVertrieb: number;
  inSanierung: number;
  vermietet: number;
  istKosten: number;
  offeneRechnungen: number;
  budgetVerbrauch: number;
  zeitFortschritt: number;
  erloeseIst: number;
  erloesErwartet: number;
  finanzierungskosten: number;
  margeErwartet: number;
  margeQuote: number;
  ekGebunden: number;
  ampel: Ampel;
}

export function projektKennzahlen(
  project: Project,
  daten: BoardDaten,
  staende: DarlehenStand[],
): ProjektKennzahlen {
  const stichtag = daten.stichtag;
  const property = daten.properties.find((p) => p.id === project.propertyId)!;
  const units = daten.units.filter((u) => u.propertyId === project.propertyId);
  const tx = daten.transactions.filter(
    (t) => t.propertyId === project.propertyId,
  );
  const istKosten = -tx
    .filter(
      (t) => t.category === "rechnung" && /Sanierung|Abschlag/i.test(t.purpose),
    )
    .reduce((s, t) => s + t.amount, 0);
  const offeneRechnungen = daten.invoices
    .filter(
      (i) =>
        i.projectId === project.id &&
        i.status === "offen" &&
        i.direction === "eingang",
    )
    .reduce((s, i) => s + i.amount, 0);
  const erloeseIst = tx
    .filter((t) => t.category === "verkauf")
    .reduce((s, t) => s + t.amount, 0);
  const erloesErwartet = units.reduce(
    (s, u) => s + (u.salePrice ?? u.listPrice ?? 0),
    0,
  );
  const bank = staende.filter(
    (s) => s.loan.propertyId === project.propertyId && s.loan.kind === "bank",
  );
  const finanzierungskosten = bank.reduce(
    (s, d) =>
      s +
      d.plan
        .filter((z) => z.dueDate <= project.plannedEnd)
        .reduce((a, z) => a + z.interest, 0),
    0,
  );
  const kostenGesamt =
    project.purchasePrice +
    Math.max(project.renovationBudget, istKosten + offeneRechnungen) +
    finanzierungskosten;
  const margeErwartet = erloesErwartet - kostenGesamt;
  const bankSumme = bank.reduce((s, d) => s + d.loan.principal, 0);
  const ekGebunden = Math.max(
    0,
    project.purchasePrice + istKosten - bankSumme - erloeseIst,
  );
  const budgetVerbrauch =
    project.renovationBudget > 0
      ? (istKosten + offeneRechnungen) / project.renovationBudget
      : 0;
  const dauer = Math.max(1, tageZwischen(project.start, project.plannedEnd));
  const zeitFortschritt = Math.min(
    1,
    Math.max(0, tageZwischen(project.start, stichtag) / dauer),
  );
  const margeQuote = erloesErwartet > 0 ? margeErwartet / erloesErwartet : 0;
  const ampel: Ampel =
    budgetVerbrauch > 1.1 || margeQuote < 0.12
      ? "rot"
      : budgetVerbrauch > 1 || margeQuote < 0.2
        ? "gelb"
        : "gruen";
  const zaehle = (s: Unit["status"]) =>
    units.filter((u) => u.status === s).length;
  return {
    project,
    property,
    units,
    verkauft: zaehle("verkauft"),
    reserviert: zaehle("reserviert"),
    imVertrieb: zaehle("im_vertrieb"),
    inSanierung: zaehle("sanierung"),
    vermietet: zaehle("vermietet"),
    istKosten: runden(istKosten),
    offeneRechnungen: runden(offeneRechnungen),
    budgetVerbrauch,
    zeitFortschritt,
    erloeseIst: runden(erloeseIst),
    erloesErwartet: runden(erloesErwartet),
    finanzierungskosten: runden(finanzierungskosten),
    margeErwartet: runden(margeErwartet),
    margeQuote,
    ekGebunden: runden(ekGebunden),
    ampel,
  };
}

export interface ImmobilienAuswertung {
  objekte: ObjektKennzahlen[];
  projekte: ProjektKennzahlen[];
  mietKonten: MietKonto[];
  kuendigungen: Array<KuendigungInfo & { leaseId: string }>;
  erhoehungen: MieterhoehungInfo[];
  pruefFaelle: ReviewItem[];
}

export function immobilienAuswerten(
  daten: BoardDaten,
  staende: DarlehenStand[],
): ImmobilienAuswertung {
  const stichtag = daten.stichtag;
  const tenants = new Map(daten.tenants.map((t) => [t.id, t]));
  // Mietkonten aus der Datenbank haben Vorrang (automatische Sollstellung und Zuordnung)
  const dbKonten = new Map(daten.mietkonten?.map((k) => [k.leaseId, k]));
  const mietKonten = daten.leases.map((l) => {
    const db = dbKonten.get(l.id);
    if (db) return mietKontoAusDb(l, db);
    return mietKonto(
      l,
      daten.leaseEvents,
      tenants.get(l.tenantId)!,
      daten.transactions,
      stichtag,
    );
  });
  const objekte = daten.properties.map((p) =>
    objektKennzahlen(p, daten, staende, mietKonten),
  );
  const projekte = daten.projects.map((p) =>
    projektKennzahlen(p, daten, staende),
  );
  const leaseById = new Map(daten.leases.map((l) => [l.id, l]));
  const kuendigungen = daten.leaseEvents.flatMap((e) =>
    e.kind === "kuendigung"
      ? [
          {
            ...kuendigungInfo(e, leaseById.get(e.leaseId)!, stichtag),
            leaseId: e.leaseId,
          },
        ]
      : [],
  );
  const erhoehungen = daten.leaseEvents.flatMap((e) =>
    e.kind === "mieterhoehung"
      ? [
          mieterhoehungInfo(
            e,
            leaseById.get(e.leaseId)!,
            daten.leaseEvents,
            stichtag,
          ),
        ]
      : [],
  );

  const unitOf = (leaseId: string) =>
    daten.units.find((u) => u.id === leaseById.get(leaseId)?.unitId);
  const propOf = (leaseId: string) =>
    daten.properties.find((p) => p.id === unitOf(leaseId)?.propertyId);
  const beschreibung = (leaseId: string) => {
    const l = leaseById.get(leaseId)!;
    return `${tenants.get(l.tenantId)?.name}, ${propOf(leaseId)?.name} ${unitOf(leaseId)?.label}`;
  };

  const pruefFaelle: ReviewItem[] = [];
  for (const k of mietKonten) {
    if (k.ampel === "gruen") continue;
    const letzter = k.monate.filter((m) => m.ist < m.soll).at(-1);
    pruefFaelle.push({
      id: `immobilien:rueckstand:${k.lease.id}:${letzter?.monat ?? ""}`,
      source: "immobilien",
      severity: k.ampel === "rot" ? "rot" : "gelb",
      title: `Mietrückstand ${euro(k.rueckstand)}: ${beschreibung(k.lease.id)}`,
      detail: `${k.rueckstandMonate.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Monatsmieten offen. Mahnung bzw. Kontakt aufnehmen.`,
      companyId: propOf(k.lease.id)?.companyId ?? null,
      refType: "lease",
      refId: k.lease.id,
      dueDate: letzter?.faellig ?? null,
      createdAt: letzter ? plusTage(letzter.faellig, 1) : stichtag,
      status: "offen",
      confidence: null,
    });
  }
  for (const e of erhoehungen) {
    if (e.ampel !== "rot" && e.ampel !== "gelb") continue;
    pruefFaelle.push({
      id: `immobilien:mieterhoehung:${e.event.id}`,
      source: "immobilien",
      severity: e.ampel,
      title: `Mieterhöhung ${beschreibung(e.event.leaseId)}: Zustimmung bis ${datumDe(e.zustimmungBis)}`,
      detail: `${e.hinweis}. Neue Kaltmiete ${euro(e.neueMiete)} (+${euro(e.mehrProMonat)}/Monat) ab ${datumDe(e.wirksamAb)}.`,
      companyId: propOf(e.event.leaseId)?.companyId ?? null,
      refType: "lease",
      refId: e.event.leaseId,
      dueDate: e.zustimmungBis,
      createdAt: e.event.receivedOn,
      status: "offen",
      confidence: null,
    });
  }
  for (const k of kuendigungen) {
    if (k.ampel !== "gelb") continue;
    pruefFaelle.push({
      id: `immobilien:kuendigung:${k.event.id}`,
      source: "immobilien",
      severity: "gelb",
      title: `Auszug am ${datumDe(k.auszug)}: ${beschreibung(k.leaseId)}`,
      detail: `Kündigung zugegangen am ${datumDe(k.event.receivedOn)}. Wohnungsabnahme und Neuvermietung planen; prognostizierter Mietausfall ${euro(k.mietausfallProg)}.`,
      companyId: propOf(k.leaseId)?.companyId ?? null,
      refType: "lease",
      refId: k.leaseId,
      dueDate: k.fristende,
      createdAt: k.event.receivedOn,
      status: "offen",
      confidence: null,
    });
  }
  for (const p of projekte) {
    if (p.budgetVerbrauch <= 1.1) continue;
    pruefFaelle.push({
      id: `immobilien:budget:${p.project.id}`,
      source: "immobilien",
      severity: "rot",
      title: `Budget überschritten: ${p.project.name}`,
      detail: `Ist-Kosten und offene Rechnungen bei ${Math.round(p.budgetVerbrauch * 100)} % des Sanierungsbudgets.`,
      companyId: p.property.companyId,
      refType: "project",
      refId: p.project.id,
      dueDate: null,
      createdAt: stichtag,
      status: "offen",
      confidence: null,
    });
  }
  return {
    objekte,
    projekte,
    mietKonten,
    kuendigungen,
    erhoehungen,
    pruefFaelle,
  };
}
