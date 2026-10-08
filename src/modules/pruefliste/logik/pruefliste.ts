import type {
  BoardDaten,
  DatenLuecke,
  ReviewItem,
  ReviewQuelle,
} from "@/lib/db/typen";
import { plusTage, type IsoDatum } from "@/lib/kalender";
import { euro } from "@/lib/format/de";
import type { AblageVorschlag } from "@/modules/ablage-v2/logik/ablage";
import { restschuld, zinsplan } from "@/modules/darlehen/logik/zinsplan";
import {
  haupttreiber,
  HORIZONT_TAGE,
  type Bewegung,
  type LiquiditaetsAuswertung,
} from "@/modules/liquiditaet/logik/liquiditaet";

export const QUELLE_LABEL: Record<ReviewQuelle, string> = {
  darlehen: "Darlehen",
  immobilien: "Immobilien",
  liquiditaet: "Liquidität",
  ablage: "Ablage",
  salesforce: "Salesforce",
  transaktionen: "Transaktionen",
  baumaschinen: "Baumaschinen",
  daten: "Datenqualität",
};

/**
 * Abstimmung Darlehensstand: Ist-Saldo aus der Datenbank (Banksaldo bzw.
 * gebuchte Bewegungen) gegen die rechnerische Restschuld laut Zinsplan.
 * Abweichung über 2 % und mindestens 1.000 € wird ein Prüffall.
 */
export function darlehenAbstimmung(
  daten: Pick<BoardDaten, "loans" | "stichtag">,
): ReviewItem[] {
  const stichtag = daten.stichtag;
  const faelle: ReviewItem[] = [];
  for (const l of daten.loans) {
    if (l.status !== "aktiv" || l.istSaldo == null) continue;
    const plan = zinsplan(l, { bis: stichtag });
    const soll = restschuld(l, plan, stichtag);
    const diff = l.istSaldo - soll;
    if (Math.abs(diff) < Math.max(1000, 0.02 * Math.abs(soll))) continue;
    faelle.push({
      id: `darlehen:abstimmung:${l.id}`,
      source: "darlehen",
      severity: "gelb",
      title: `Darlehensstand ${l.id} weicht vom Zinsplan ab`,
      detail: `Ist-Saldo ${euro(l.istSaldo)}${l.istSaldoAm ? ` (Stand ${l.istSaldoAm.split("-").reverse().join(".")})` : ""}, rechnerisch ${euro(soll)}: Differenz ${euro(diff)}. Sondertilgung, fehlende Buchung oder falsche Konditionen?`,
      companyId: l.borrowerCompanyId ?? l.lenderCompanyId,
      refType: "loan",
      refId: l.id,
      dueDate: null,
      createdAt: stichtag,
      status: "offen",
      confidence: null,
    });
  }
  return faelle;
}

/** Datenlücken als Prüffälle: Was fehlt, damit die Zahlen stimmen. */
export function datenPruefFaelle(
  luecken: DatenLuecke[],
  stichtag: IsoDatum,
): ReviewItem[] {
  return luecken.map((l) => ({
    id: `daten:${l.id}`,
    source: "daten",
    severity: l.schwere,
    title: l.titel,
    detail: `${l.detail} Nächster Schritt: ${l.naechsterSchritt}`,
    companyId: l.companyId,
    refType: l.refType,
    refId: l.refId,
    dueDate: null,
    createdAt: stichtag,
    status: "offen",
    confidence: null,
  }));
}

/** Liquiditätswarnungen als Prüffälle (rot: ≤ 13 Wochen, gelb: ≤ 24 Monate). */
export function liquiditaetPruefFaelle(
  l: LiquiditaetsAuswertung,
): ReviewItem[] {
  return l.gesellschaften
    .filter((g) => g.ersteUnterschreitung)
    .map((g) => {
      const rot = g.ampel === "rot";
      const treiber = haupttreiber(
        l.bewegungen,
        new Set([g.company.id]),
        g.ersteUnterschreitung!,
      );
      return {
        id: `liquiditaet:min:${g.company.id}:${g.ersteUnterschreitung}`,
        source: "liquiditaet" as const,
        severity: rot ? ("rot" as const) : ("gelb" as const),
        title: `${g.company.name} unterschreitet Mindestliquidität`,
        detail: `ab ${g.ersteUnterschreitung!.split("-").reverse().join(".")}, Lücke bis Tiefpunkt ${euro(g.luecke)}${
          treiber ? `; Treiber: ${treiber.label}` : ""
        }`,
        companyId: g.company.id,
        refType: "company",
        refId: g.company.id,
        dueDate: g.ersteUnterschreitung,
        createdAt: l.stichtag,
        status: "offen" as const,
        confidence: null,
      };
    });
}

/** Ablage-Vorschläge unter der Schwelle als Prüffälle. */
export function ablagePruefFaelle(
  vorschlaege: AblageVorschlag[],
  stichtag: IsoDatum,
): ReviewItem[] {
  return vorschlaege
    .filter((v) => v.pruefen)
    .map((v) => ({
      id: `ablage:${v.mail.id}`,
      source: "ablage" as const,
      severity: "gelb" as const,
      title: `Dokument prüfen: ${v.mail.betreff}`,
      detail: `Vorschlag ${v.ordner} · unsicher: ${v.unsicher.join(", ") || "–"}`,
      companyId: v.gesellschaftId.wert,
      refType: "mail",
      refId: v.mail.id,
      dueDate: stichtag,
      createdAt: v.mail.empfangen.slice(0, 10),
      status: "offen" as const,
      confidence: v.konfidenz,
    }));
}

/** Zusammenführen, Status aus dem Repository anwenden, sortieren (rot zuerst, dann fällig). */
export function prueflisteZusammenfuehren(
  quellen: ReviewItem[][],
  erledigt: Set<string>,
): ReviewItem[] {
  const gesehen = new Set<string>();
  const alle: ReviewItem[] = [];
  for (const liste of quellen)
    for (const f of liste) {
      if (gesehen.has(f.id)) continue;
      gesehen.add(f.id);
      alle.push(erledigt.has(f.id) ? { ...f, status: "erledigt" } : f);
    }
  return alle.sort(
    (a, b) =>
      (a.status === b.status ? 0 : a.status === "offen" ? -1 : 1) ||
      (a.severity === b.severity ? 0 : a.severity === "rot" ? -1 : 1) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.id.localeCompare(b.id),
  );
}

/** Link in das Fachmodul zum Prüffall. */
export function pruefFallZiel(
  f: ReviewItem,
  daten: Pick<BoardDaten, "units" | "leases" | "projects">,
): {
  to: string;
  search?: Record<string, string>;
} {
  switch (f.source) {
    case "darlehen":
      return f.refId
        ? { to: "/board/darlehen", search: { darlehen: f.refId } }
        : { to: "/board/darlehen" };
    case "immobilien": {
      if (f.refType === "project" && f.refId) {
        const pj = daten.projects.find((p) => p.id === f.refId);
        return {
          to: "/board/immobilien",
          search: pj ? { objekt: pj.propertyId } : undefined,
        };
      }
      if (f.refType === "lease" && f.refId) {
        const lease = daten.leases.find((l) => l.id === f.refId);
        const unit = lease && daten.units.find((u) => u.id === lease.unitId);
        return {
          to: "/board/immobilien",
          search: { objekt: unit?.propertyId ?? "", mietvertrag: f.refId },
        };
      }
      if (f.refType === "property" && f.refId)
        return { to: "/board/immobilien", search: { objekt: f.refId } };
      return { to: "/board/immobilien" };
    }
    case "liquiditaet":
      return {
        to: "/board/liquiditaet",
        search: f.refId ? { firma: f.refId } : undefined,
      };
    case "salesforce":
    case "transaktionen":
      return f.refType === "ankauf" && f.refId
        ? { to: "/board/transaktionen", search: { ankauf: f.refId } }
        : { to: "/board/transaktionen" };
    case "baumaschinen":
      return f.refId
        ? { to: "/board/baumaschinen", search: { maschine: f.refId } }
        : { to: "/board/baumaschinen" };
    case "daten":
      return { to: "/board/daten" };
    case "ablage":
      return { to: "/board/ablage" };
  }
}

// ---------------------------------------------------------------------------
// Cockpit: „Heute zu tun“
// ---------------------------------------------------------------------------

export interface FaelligePosition {
  datum: IsoDatum;
  companyId: string;
  betrag: number;
  label: string;
  ueberfaellig: boolean;
}

/**
 * Zahlungen der nächsten 7 Tage (Ausgänge ab 1.000 €, ohne interne Umlagen)
 * plus überfällige offene Eingangsrechnungen.
 */
export function faelligDieseWoche(
  daten: Pick<BoardDaten, "invoices" | "stichtag">,
  bewegungen: Bewegung[],
  tage = 7,
): FaelligePosition[] {
  const bis = plusTage(daten.stichtag, tage);
  const ueberfaellig = daten.invoices
    .filter(
      (r) =>
        r.status === "offen" &&
        r.direction === "eingang" &&
        r.dueDate <= daten.stichtag,
    )
    .map((r) => ({
      datum: r.dueDate,
      companyId: r.companyId,
      betrag: -r.amount,
      label: `${r.counterparty}: ${r.description}`,
      ueberfaellig: true,
    }));
  const ueberfaelligIds = new Set(
    daten.invoices
      .filter((r) => r.status === "offen" && r.dueDate <= daten.stichtag)
      .map((r) => `invoice:${r.id}`),
  );
  const kommend = bewegungen
    .filter(
      (b) =>
        b.datum <= bis &&
        b.betrag <= -1_000 &&
        b.kategorie !== "intercompany" &&
        !ueberfaelligIds.has(b.quelle),
    )
    .map((b) => ({
      datum: b.datum,
      companyId: b.companyId,
      betrag: b.betrag,
      label: b.label,
      ueberfaellig: false,
    }));
  return [...ueberfaellig, ...kommend].sort(
    (a, b) => a.datum.localeCompare(b.datum) || a.betrag - b.betrag,
  );
}

export const KURZ_HORIZONT = HORIZONT_TAGE;
