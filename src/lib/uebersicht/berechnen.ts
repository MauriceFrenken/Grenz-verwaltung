/**
 * Business-Übersicht (Startseite): Ergebnisse, Pipeline und Abschlüsse aus den sf_*-Caches.
 * Operative To-dos stehen bewusst nicht hier (das Tagesgeschäft läuft über Trello).
 * Reine Funktionen, getestet in berechnen.test.ts.
 */

import { hatSchriftlichenMaklervertrag } from "@/lib/mandate/maklervertrag";
import { stattgefunden } from "@/lib/sf-sync/zaehlen";

export type MandatRoh = {
  sfId: string;
  /** Eigentümer ist ein Test-Account („Test GmbH“). */
  test?: boolean;
  name: string;
  status: string | null;
  /** Beauftragungsart (Type_of_commissioning__c). */
  art?: string | null;
  angebotspreis: number | null;
  provisionProzent: number | null;
  /** Prognostizierte_Provision__c aus Salesforce, falls Preis × Satz nicht rechenbar. */
  provisionPrognose: number | null;
  erstelltAm: string | null;
  objekt: string | null;
};

export type DealRoh = {
  sfId: string;
  name: string;
  phase: string | null;
  betrag: number | null;
  abschlussAm: string | null;
  mandatSfId: string | null;
  geschlossen: boolean;
  gewonnen: boolean;
  /** Provision_in__c (netto) der gewonnenen Deals. */
  provision: number | null;
  kaufpreis: number | null;
  erstelltAm: string | null;
};

export type AktivitaetRoh = {
  datum: string;
  /** Task, Event oder EmailMessage; ohne Angabe zählt die Zeile immer. */
  sfTyp?: string | null;
  status?: string | null;
  art: string | null;
  betreff: string | null;
  mandatSfId: string | null;
};

export type ExposeRoh = { status: string | null; eingegangenAm: string | null };

export type UebersichtEingabe = {
  heute: string;
  letzterAbruf: string | null;
  mandate: MandatRoh[];
  deals: DealRoh[];
  aktivitaeten: AktivitaetRoh[];
  exposes: ExposeRoh[];
};

export type UebersichtDto = {
  heute: string;
  letzterAbruf: string | null;
  salesforceLeer: boolean;
  kacheln: {
    /** Provision beauftragter Mandate mit schriftlichem Maklervertrag (Hauptwert). */
    provisionVertrag: number;
    mandateMitVertrag: number;
    /** Alle beauftragten Mandate mit Preis, inkl. loser Beauftragung und Off-Market (Nebenwert). */
    provisionPipeline: number;
    mandateMitProvision: number;
    beauftragtGesamt: number;
    aktivJePhase: Array<{ phase: string; anzahl: number }>;
    aktiveMandate: number;
    neueMandate4W: number;
    neueMandateVor4W: number;
    provisionJahr: number;
    kaufpreisJahr: number;
    abschluesseJahr: number;
    /** Bezahlte Provision netto im ganzen Vorjahr. */
    provisionVorjahr: number;
    /** Bezahlte Provision netto im Vorjahr bis zum gleichen Kalendertag. */
    provisionVorjahrBisHeute: number;
    abschluesseVorjahr: number;
    /** Im laufenden Jahr in Salesforce angelegte Mandate. */
    neueMandateJahr: number;
    offeneInteressenten: number;
    imDatenraum: number;
  };
  mandatsPhasen: Array<{ phase: string; anzahl: number; volumen: number }>;
  gewonnen: number;
  verloren: number;
  interessentenPhasen: Array<{ phase: string; anzahl: number }>;
  aktivitaetWochen: Array<
    { woche: string } & Record<AktivitaetsGruppe, number>
  >;
  aktivitaetGesamt4W: number;
  aktivitaetVor4W: number;
  topMandate: Array<{
    sfId: string;
    name: string;
    objekt: string | null;
    preis: number | null;
    provision: number | null;
    interessenten: number;
    letzteAktivitaet: string | null;
  }>;
  abschluesse: Array<{
    name: string;
    datum: string | null;
    kaufpreis: number | null;
    provision: number | null;
  }>;
  exposes: { neu7Tage: number; offen: number; gesamt: number };
};

/** Offene Mandatsphasen in Salesforce-Reihenfolge. */
export const OFFENE_PHASEN = [
  "Akquisition",
  "Einwertung",
  "Beauftragung",
] as const;

const DEAL_PHASE_TEXT: Record<string, string> = {
  "Initial interest": "Erstinteresse",
  "Data Room": "Datenraum",
};

export const AKTIVITAETS_GRUPPEN = [
  "Anruf",
  "E-Mail",
  "Termin",
  "Aufgabe",
] as const;
export type AktivitaetsGruppe = (typeof AKTIVITAETS_GRUPPEN)[number];

const TAG = 86_400_000;

/** Testdatensätze („Test SG …“) zählen nicht. */
export function istTest(name: string): boolean {
  return /^test\b/i.test(name.trim());
}

function minusTage(iso: string, n: number): string {
  return new Date(Date.parse(iso.slice(0, 10)) - n * TAG)
    .toISOString()
    .slice(0, 10);
}

/** Montag der Woche (ISO-Datum). */
export function wochenStart(iso: string): string {
  const d = new Date(Date.parse(iso.slice(0, 10)));
  const wt = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - wt * TAG).toISOString().slice(0, 10);
}

export function aktivitaetsGruppe(art: string | null): AktivitaetsGruppe {
  if (art === "Anruf" || art === "Termin") return art;
  if (art === "E-Mail" || art === "Serien-E-Mail") return "E-Mail";
  return "Aufgabe";
}

/** Erwartete Provision: Preis × Satz, sonst die Prognose aus Salesforce. */
export function erwarteteProvision(m: MandatRoh): number | null {
  if (m.angebotspreis && m.provisionProzent)
    return (m.angebotspreis * m.provisionProzent) / 100;
  return m.provisionPrognose && m.provisionPrognose > 0
    ? m.provisionPrognose
    : null;
}

export function berechneUebersicht(e: UebersichtEingabe): UebersichtDto {
  const heute = e.heute;
  const jahr = heute.slice(0, 4);
  const mandate = e.mandate.filter((m) => !m.test && !istTest(m.name));
  const deals = e.deals.filter((d) => !istTest(d.name));
  const aktivitaeten = stattgefunden(e.aktivitaeten);

  const beauftragt = mandate.filter((m) => m.status === "Beauftragung");
  const aktiv = mandate.filter((m) =>
    (OFFENE_PHASEN as readonly string[]).includes(m.status ?? ""),
  );

  const vor4W = minusTage(heute, 28);
  const vor8W = minusTage(heute, 56);
  const neuIn = (von: string, bis: string) =>
    mandate.filter(
      (m) =>
        m.erstelltAm &&
        m.erstelltAm.slice(0, 10) > von &&
        m.erstelltAm.slice(0, 10) <= bis,
    ).length;

  const offeneDeals = deals.filter((d) => !d.geschlossen);
  const gewonneneDeals = deals
    .filter((d) => d.gewonnen)
    .sort((a, b) => (b.abschlussAm ?? "").localeCompare(a.abschlussAm ?? ""));
  const gewonnenJahr = gewonneneDeals.filter((d) =>
    (d.abschlussAm ?? "").startsWith(jahr),
  );
  const vorjahr = String(Number(jahr) - 1);
  const gewonnenVorjahr = gewonneneDeals.filter((d) =>
    (d.abschlussAm ?? "").startsWith(vorjahr),
  );
  const gleicherTagVorjahr = `${vorjahr}${heute.slice(4, 10)}`;

  let provisionPipeline = 0;
  let mandateMitProvision = 0;
  let provisionVertrag = 0;
  let mandateMitVertrag = 0;
  for (const m of beauftragt) {
    const p = erwarteteProvision(m);
    if (p) {
      provisionPipeline += p;
      mandateMitProvision += 1;
    }
    if (hatSchriftlichenMaklervertrag(m.art)) {
      provisionVertrag += p ?? 0;
      mandateMitVertrag += 1;
    }
  }

  const mandatsPhasen = OFFENE_PHASEN.map((phase) => {
    const ms = mandate.filter((m) => m.status === phase);
    return {
      phase,
      anzahl: ms.length,
      volumen: ms.reduce((s, m) => s + (m.angebotspreis ?? 0), 0),
    };
  });

  const interessentenJePhase = new Map<string, number>();
  for (const d of offeneDeals) {
    const phase = DEAL_PHASE_TEXT[d.phase ?? ""] ?? d.phase ?? "ohne Phase";
    interessentenJePhase.set(phase, (interessentenJePhase.get(phase) ?? 0) + 1);
  }

  // Aktivität je Mandat (für Ruhen und Top-Mandate).
  const letzteAktivitaet = new Map<string, string>();
  for (const a of aktivitaeten) {
    if (!a.mandatSfId) continue;
    if (a.datum > (letzteAktivitaet.get(a.mandatSfId) ?? ""))
      letzteAktivitaet.set(a.mandatSfId, a.datum);
  }
  const interessentenJeMandat = new Map<string, number>();
  for (const d of offeneDeals)
    if (d.mandatSfId)
      interessentenJeMandat.set(
        d.mandatSfId,
        (interessentenJeMandat.get(d.mandatSfId) ?? 0) + 1,
      );

  const offeneExposes = e.exposes.filter(
    (x) => x.status === "neu" || x.status === "analysiert",
  ).length;
  // Aktivität der letzten 12 Wochen.
  const startWoche = wochenStart(minusTage(heute, 7 * 11));
  const wochen = new Map<string, Record<AktivitaetsGruppe, number>>();
  for (let w = startWoche; w <= heute; w = minusTage(w, -7))
    wochen.set(w, { Anruf: 0, "E-Mail": 0, Termin: 0, Aufgabe: 0 });
  let gesamt4W = 0;
  let vorher4W = 0;
  for (const a of aktivitaeten) {
    const tag = a.datum.slice(0, 10);
    if (tag > heute) continue;
    const zeile = wochen.get(wochenStart(tag));
    if (zeile) zeile[aktivitaetsGruppe(a.art)] += 1;
    if (tag > vor4W) gesamt4W += 1;
    else if (tag > vor8W) vorher4W += 1;
  }

  const topMandate = beauftragt
    .map((m) => ({
      sfId: m.sfId,
      name: m.name,
      objekt: m.objekt,
      preis: m.angebotspreis,
      provision: erwarteteProvision(m),
      interessenten: interessentenJeMandat.get(m.sfId) ?? 0,
      letzteAktivitaet: letzteAktivitaet.get(m.sfId) ?? null,
    }))
    .sort(
      (a, b) =>
        (b.provision ?? 0) - (a.provision ?? 0) ||
        (b.preis ?? 0) - (a.preis ?? 0),
    )
    .slice(0, 6);

  const vor7 = minusTage(heute, 7);

  return {
    heute,
    letzterAbruf: e.letzterAbruf,
    salesforceLeer: e.mandate.length === 0,
    kacheln: {
      provisionVertrag,
      mandateMitVertrag,
      provisionPipeline,
      mandateMitProvision,
      beauftragtGesamt: beauftragt.length,
      aktivJePhase: OFFENE_PHASEN.map((phase) => ({
        phase,
        anzahl: aktiv.filter((m) => m.status === phase).length,
      })),
      aktiveMandate: aktiv.length,
      neueMandate4W: neuIn(vor4W, heute),
      neueMandateVor4W: neuIn(vor8W, vor4W),
      provisionJahr: gewonnenJahr.reduce((s, d) => s + (d.provision ?? 0), 0),
      kaufpreisJahr: gewonnenJahr.reduce(
        (s, d) => s + (d.kaufpreis ?? d.betrag ?? 0),
        0,
      ),
      abschluesseJahr: gewonnenJahr.length,
      provisionVorjahr: gewonnenVorjahr.reduce(
        (s, d) => s + (d.provision ?? 0),
        0,
      ),
      provisionVorjahrBisHeute: gewonnenVorjahr
        .filter((d) => (d.abschlussAm ?? "") <= gleicherTagVorjahr)
        .reduce((s, d) => s + (d.provision ?? 0), 0),
      abschluesseVorjahr: gewonnenVorjahr.length,
      neueMandateJahr: mandate.filter((m) =>
        (m.erstelltAm ?? "").startsWith(jahr),
      ).length,
      offeneInteressenten: offeneDeals.length,
      imDatenraum: offeneDeals.filter((d) => d.phase === "Data Room").length,
    },
    mandatsPhasen,
    gewonnen: mandate.filter((m) => m.status === "Gewonnen").length,
    verloren: mandate.filter((m) => m.status === "Verloren").length,
    interessentenPhasen: [...interessentenJePhase].map(([phase, anzahl]) => ({
      phase,
      anzahl,
    })),
    aktivitaetWochen: [...wochen].map(([woche, z]) => ({ woche, ...z })),
    aktivitaetGesamt4W: gesamt4W,
    aktivitaetVor4W: vorher4W,
    topMandate,
    abschluesse: gewonneneDeals.slice(0, 5).map((d) => ({
      name: d.name,
      datum: d.abschlussAm,
      kaufpreis: d.kaufpreis ?? d.betrag,
      provision: d.provision,
    })),
    exposes: {
      neu7Tage: e.exposes.filter(
        (x) => (x.eingegangenAm ?? "").slice(0, 10) > vor7,
      ).length,
      offen: offeneExposes,
      gesamt: e.exposes.length,
    },
  };
}
