import type { Ampel } from "@/components/board/ampel";
import type { BoardDaten, ReviewItem, Unit } from "@/lib/db/typen";
import {
  ANKAUF_PHASEN,
  type Ankauf,
  type AnkaufPhase,
  type CrmDaten,
  type Kaeufer,
  type Reservierung,
} from "@/lib/integrations/salesforce";
import { tageZwischen, type IsoDatum } from "@/lib/kalender";

/** Aktive Phasen (Kanban-Spalten) */
export const AKTIVE_PHASEN: readonly AnkaufPhase[] = ANKAUF_PHASEN.filter(
  (p) => p !== "gekauft" && p !== "abgesagt",
);

/** Abschlusswahrscheinlichkeit je Phase für das gewichtete Volumen (Annahme). */
export const WAHRSCHEINLICHKEIT: Record<AnkaufPhase, number> = {
  eingang: 0.05,
  pruefung: 0.1,
  besichtigung: 0.2,
  angebot: 0.35,
  due_diligence: 0.6,
  notar: 0.9,
  gekauft: 1,
  abgesagt: 0,
};

/** Erwerbsnebenkosten (GrESt NRW 6,5 %, Notar/Grundbuch ~2 %, ohne Makler) */
export const NEBENKOSTEN_QUOTE = 0.085;
export const MAKLER_QUOTE = 0.0357;
/** Tage in einer Phase, ab denen ein Deal als „stockend“ gilt */
export const STOCKT_GELB = 30;
export const STOCKT_ROT = 60;

export interface AnkaufKennzahlen {
  ankauf: Ankauf;
  /** Kaufpreisfaktor = Preis / Jahresnettokaltmiete */
  faktor: number | null;
  bruttoRendite: number | null;
  preisJeQm: number;
  gesamtInvest: number;
  ekBedarf: number;
  tageInPhase: number;
  ampel: Ampel;
  gewichtet: number;
}

export function ankaufKennzahlen(
  a: Ankauf,
  stichtag: IsoDatum,
): AnkaufKennzahlen {
  const nk = NEBENKOSTEN_QUOTE + (a.makler ? MAKLER_QUOTE : 0);
  const gesamtInvest = a.angebotspreis * (1 + nk);
  const tageInPhase = tageZwischen(a.phaseSeit, stichtag);
  const aktiv = AKTIVE_PHASEN.includes(a.phase);
  return {
    ankauf: a,
    faktor:
      a.jahresnettokaltmiete > 0
        ? a.angebotspreis / a.jahresnettokaltmiete
        : null,
    bruttoRendite:
      a.angebotspreis > 0 ? a.jahresnettokaltmiete / a.angebotspreis : null,
    preisJeQm: a.angebotspreis / a.flaeche,
    gesamtInvest,
    ekBedarf: gesamtInvest * a.ekQuote,
    tageInPhase,
    ampel: !aktiv
      ? "grau"
      : tageInPhase >= STOCKT_ROT
        ? "rot"
        : tageInPhase >= STOCKT_GELB
          ? "gelb"
          : "gruen",
    gewichtet: a.angebotspreis * WAHRSCHEINLICHKEIT[a.phase],
  };
}

export interface PipelineSumme {
  phase: AnkaufPhase;
  anzahl: number;
  volumen: number;
  gewichtet: number;
}

export function pipelineSummen(k: AnkaufKennzahlen[]): PipelineSumme[] {
  return ANKAUF_PHASEN.map((phase) => {
    const liste = k.filter((x) => x.ankauf.phase === phase);
    return {
      phase,
      anzahl: liste.length,
      volumen: liste.reduce((s, x) => s + x.ankauf.angebotspreis, 0),
      gewichtet: liste.reduce((s, x) => s + x.gewichtet, 0),
    };
  });
}

/** EK-Bedarf der Deals ab Angebot (konkret werdende Mittelbindung). */
export function ekBedarfAbAngebot(k: AnkaufKennzahlen[]): number {
  const ab = ANKAUF_PHASEN.indexOf("angebot");
  return k
    .filter((x) => {
      const i = ANKAUF_PHASEN.indexOf(x.ankauf.phase);
      return (
        i >= ab && x.ankauf.phase !== "gekauft" && x.ankauf.phase !== "abgesagt"
      );
    })
    .reduce((s, x) => s + x.ekBedarf, 0);
}

export function naechstePhase(p: AnkaufPhase): AnkaufPhase | null {
  const i = AKTIVE_PHASEN.indexOf(p);
  if (i < 0) return null;
  return i === AKTIVE_PHASEN.length - 1 ? "gekauft" : AKTIVE_PHASEN[i + 1];
}

// ---------------------------------------------------------------------------
// Abverkauf: Käufer und Reservierungen je Aufteiler-Einheit
// ---------------------------------------------------------------------------

export interface EinheitVertrieb {
  unit: Unit;
  /** führende (weitest fortgeschrittene, nicht stornierte) Reservierung */
  fuehrend: Reservierung | null;
  kaeufer: Kaeufer | null;
  interessenten: number;
  /** Status laut CRM, abgebildet auf den Board-Status */
  crmStatus: Unit["status"] | null;
  abweichung: string | null;
}

const RANG: Record<Reservierung["status"], number> = {
  storniert: -1,
  interessent: 0,
  reserviert: 1,
  notartermin: 2,
  beurkundet: 3,
};

const BOARD_STATUS_LABEL: Record<Unit["status"], string> = {
  vermietet: "vermietet",
  leer: "leer",
  sanierung: "Sanierung",
  im_vertrieb: "im Vertrieb",
  reserviert: "reserviert",
  verkauft: "verkauft",
};
const CRM_STATUS_LABEL: Record<Reservierung["status"], string> = {
  interessent: "Interessent",
  reserviert: "reserviert",
  notartermin: "Notartermin",
  beurkundet: "beurkundet",
  storniert: "storniert",
};

function crmZuBoard(
  s: Reservierung["status"] | undefined,
): Unit["status"] | null {
  if (s === "beurkundet") return "verkauft";
  if (s === "reserviert" || s === "notartermin") return "reserviert";
  return null;
}

export function einheitenVertrieb(
  daten: Pick<BoardDaten, "units" | "properties">,
  crm: CrmDaten,
): EinheitVertrieb[] {
  const aufteiler = new Set(
    daten.properties.filter((p) => p.strategy === "aufteiler").map((p) => p.id),
  );
  return daten.units
    .filter((u) => aufteiler.has(u.propertyId))
    .map((unit) => {
      const res = crm.reservierungen.filter(
        (r) => r.unitId === unit.id && r.status !== "storniert",
      );
      const fuehrend =
        [...res].sort((a, b) => RANG[b.status] - RANG[a.status])[0] ?? null;
      const crmStatus = crmZuBoard(fuehrend?.status);
      let abweichung: string | null = null;
      if (crmStatus && crmStatus !== unit.status)
        abweichung = `CRM meldet „${CRM_STATUS_LABEL[fuehrend!.status]}“, Board führt „${BOARD_STATUS_LABEL[unit.status]}“`;
      else if (
        !crmStatus &&
        (unit.status === "reserviert" || unit.status === "verkauft")
      )
        abweichung = `Board führt „${BOARD_STATUS_LABEL[unit.status]}“, im CRM fehlt die Reservierung`;
      return {
        unit,
        fuehrend:
          fuehrend && fuehrend.status !== "interessent" ? fuehrend : null,
        kaeufer:
          fuehrend && fuehrend.status !== "interessent"
            ? (crm.kaeufer.find((k) => k.id === fuehrend.kaeuferId) ?? null)
            : null,
        interessenten: res.filter((r) => r.status === "interessent").length,
        crmStatus,
        abweichung,
      };
    });
}

/** Prüffälle: Status-Abweichungen Board↔CRM und stockende Deals ab Angebot. */
export function pipelinePruefFaelle(
  vertrieb: EinheitVertrieb[],
  ankaeufe: AnkaufKennzahlen[],
  daten: Pick<BoardDaten, "properties">,
  stichtag: IsoDatum,
): ReviewItem[] {
  const faelle: ReviewItem[] = [];
  for (const v of vertrieb) {
    if (!v.abweichung) continue;
    const prop = daten.properties.find((p) => p.id === v.unit.propertyId);
    faelle.push({
      id: `salesforce:status:${v.unit.id}`,
      source: "salesforce",
      severity: "gelb",
      title: `Vertriebsstatus abweichend: ${prop?.name ?? ""} ${v.unit.label}`,
      detail: v.abweichung,
      companyId: prop?.companyId ?? null,
      refType: "unit",
      refId: v.unit.id,
      dueDate: stichtag,
      createdAt: stichtag,
      status: "offen",
      confidence: null,
    });
  }
  const ab = ANKAUF_PHASEN.indexOf("angebot");
  for (const k of ankaeufe) {
    if (
      k.ampel !== "rot" &&
      !(k.ampel === "gelb" && ANKAUF_PHASEN.indexOf(k.ankauf.phase) >= ab)
    )
      continue;
    faelle.push({
      id: `salesforce:stockt:${k.ankauf.id}`,
      source: "salesforce",
      severity: k.ampel === "rot" ? "rot" : "gelb",
      title: `Ankauf stockt: ${k.ankauf.name}`,
      detail: `${k.tageInPhase} Tage in Phase; nächster Schritt: ${k.ankauf.naechsterSchritt}`,
      companyId: k.ankauf.zielGesellschaftId,
      refType: "ankauf",
      refId: k.ankauf.id,
      dueDate: stichtag,
      createdAt: k.ankauf.phaseSeit,
      status: "offen",
      confidence: null,
    });
  }
  return faelle;
}
