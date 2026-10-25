/**
 * Wertet die Salesforce-Rohdaten für die Akquise aus: Anschreiben-Erfolg, Aktivitäten,
 * Wiedervorlagen, Nachfassliste und das Verkäufer-Potenzial. Reine Funktionen, testbar.
 */

import {
  aktivitaetsDatum,
  bereichVon,
  ergebnisVon,
  istOffen,
  istReaktion,
  klassifiziere,
  leadStatusLabel,
} from "./klassifizieren";
import type {
  AkquiseDto,
  AktivitaetZeile,
  Bereich,
  Ergebnis,
  KohortenZeile,
  Massnahme,
  NachfassEintrag,
  PotenzialEintrag,
  PotenzialSignal,
  RohAufgabe,
  RohPerson,
  Rohdaten,
  Wiedervorlage,
} from "./typen";

const TAG = 86_400_000;

/** Ab so vielen Tagen ohne Reaktion ist ein Anschreiben nachzufassen. */
export const NACHFASSEN_AB_TAGEN = 21;
/** Älter als ein Jahr: kein telefonisches Nachfassen mehr, sondern neues Anschreiben. */
const NACHFASSEN_BIS_TAGEN = 365;

/** Absagegründe, die eine spätere Wiederansprache rechtfertigen (mit Punkten). */
const WIEDERVORLAGE_GRUENDE: Record<string, number> = {
  "Spekulationsfrist läuft aus": 35,
  Spekulationsfrist: 20,
  "Verkauf kommt heute nicht in Frage": 20,
};

type Angereichert = RohAufgabe & {
  massnahme: Massnahme;
  datum: string;
  bereich: Bereich;
};

function tageZwischen(von: string, bis: string): number {
  return Math.floor((Date.parse(bis) - Date.parse(von)) / TAG);
}

function monatVon(iso: string): string {
  return iso.slice(0, 7);
}

/** Die letzten `anzahl` Monate bis einschließlich des Monats von `heute`, aufsteigend. */
function monateBis(heute: string, anzahl: number): string[] {
  const j = Number(heute.slice(0, 4));
  const m = Number(heute.slice(5, 7)) - 1;
  const liste: string[] = [];
  for (let i = anzahl - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(j, m - i, 1));
    liste.push(d.toISOString().slice(0, 7));
  }
  return liste;
}

function quote(teil: number, gesamt: number): number | null {
  return gesamt > 0 ? (teil / gesamt) * 100 : null;
}

function zaehle<T extends string>(werte: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const w of werte) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

function istTest(name: string | null | undefined): boolean {
  return /^test\b/i.test((name ?? "").trim());
}

type LeadVerlauf = {
  person: RohPerson;
  briefe: string[];
  aktivitaeten: Angereichert[];
};

/** Je angeschriebenem oder bearbeitetem Eigentümer-Lead die Briefe und Aktivitäten. */
function leadVerlaeufe(aufgaben: Angereichert[]): Map<string, LeadVerlauf> {
  const m = new Map<string, LeadVerlauf>();
  for (const a of aufgaben) {
    if (a.wer?.typ !== "Lead") continue;
    const v = m.get(a.wer.id) ?? {
      person: a.wer,
      briefe: [],
      aktivitaeten: [],
    };
    v.aktivitaeten.push(a);
    if (a.massnahme === "anschreiben") v.briefe.push(a.datum);
    m.set(a.wer.id, v);
  }
  for (const v of m.values()) v.briefe.sort();
  return m;
}

function massnahmenNach(v: LeadVerlauf, ab: string): Set<Massnahme> {
  return new Set(
    v.aktivitaeten
      .filter((a) => a.datum > ab && a.massnahme !== "anschreiben")
      .map((a) => a.massnahme),
  );
}

function anschreibenAuswerten(
  verlaeufe: Map<string, LeadVerlauf>,
  alle: Angereichert[],
  heute: string,
) {
  const briefe = alle.filter((a) => a.massnahme === "anschreiben");
  const vor12 = new Date(Date.parse(heute) - 365 * TAG).toISOString();
  const angeschrieben = [...verlaeufe.values()].filter(
    (v) => v.briefe.length > 0,
  );

  const ergebnisJe = new Map<string, Ergebnis>();
  for (const v of angeschrieben)
    ergebnisJe.set(
      v.person.id,
      ergebnisVon(v.person, massnahmenNach(v, v.briefe[0])),
    );

  const ergebnisse = zaehle([...ergebnisJe.values()]);
  const reaktionen = [...ergebnisJe.values()].filter(istReaktion).length;
  const interesse = [...ergebnisJe.values()].filter(
    (e) => e === "interesse" || e === "mandat",
  ).length;

  // Nachfassquote: Anteil der seit mindestens drei Wochen angeschriebenen Leads mit Anruf,
  // E-Mail oder Wiedervorlage nach dem ersten Brief (erledigt oder geplant).
  const reif = angeschrieben.filter(
    (v) => tageZwischen(v.briefe[0], heute) >= NACHFASSEN_AB_TAGEN,
  );
  const nachgefasst = reif.filter((v) => {
    const danach = massnahmenNach(v, v.briefe[0]);
    return (
      danach.has("anruf") ||
      danach.has("nachfassen") ||
      danach.has("email") ||
      danach.has("rueckmeldung")
    );
  }).length;

  const kohortenMap = new Map<string, KohortenZeile>();
  for (const v of angeschrieben) {
    const monat = monatVon(v.briefe[0]);
    const z = kohortenMap.get(monat) ?? {
      monat,
      angeschrieben: 0,
      reaktion: 0,
      interesse: 0,
      absage: 0,
    };
    const e = ergebnisJe.get(v.person.id) ?? "keine";
    z.angeschrieben += 1;
    if (istReaktion(e)) z.reaktion += 1;
    if (e === "interesse" || e === "mandat") z.interesse += 1;
    if (e === "absage") z.absage += 1;
    kohortenMap.set(monat, z);
  }

  const gruppiert = (schluessel: (p: RohPerson) => string | null) => {
    const m = new Map<string, { angeschrieben: number; reaktion: number }>();
    for (const v of angeschrieben) {
      const k = schluessel(v.person) ?? "ohne Angabe";
      const z = m.get(k) ?? { angeschrieben: 0, reaktion: 0 };
      z.angeschrieben += 1;
      if (istReaktion(ergebnisJe.get(v.person.id) ?? "keine")) z.reaktion += 1;
      m.set(k, z);
    }
    return [...m.entries()].sort(
      (a, b) => b[1].angeschrieben - a[1].angeschrieben,
    );
  };

  const absagegruende = zaehle(
    angeschrieben
      .filter((v) => ergebnisJe.get(v.person.id) === "absage")
      .map((v) => v.person.absagegrund ?? "ohne Grund"),
  );

  const briefeJeMonat = zaehle(briefe.map((b) => monatVon(b.datum)));

  return {
    briefe12m: briefe.filter((b) => b.datum >= vor12).length,
    briefeGesamt: briefe.length,
    briefeErledigt: briefe.filter((b) => b.status === "Completed").length,
    leadsAngeschrieben: angeschrieben.length,
    reaktionsquote: quote(reaktionen, angeschrieben.length),
    interessequote: quote(interesse, angeschrieben.length),
    nachfassquote: quote(nachgefasst, reif.length),
    mehrfachAngeschrieben: angeschrieben.filter((v) => v.briefe.length > 1)
      .length,
    bewusstNichtAngeschrieben: alle.filter(
      (a) => a.massnahme === "kein_anschreiben",
    ).length,
    retouren: alle.filter((a) => a.massnahme === "retoure").length,
    ergebnisse: (
      [
        "mandat",
        "interesse",
        "kontakt",
        "absage",
        "miteigentuemer",
        "retoure",
        "keine",
      ] as Ergebnis[]
    ).map((ergebnis) => ({ ergebnis, anzahl: ergebnisse.get(ergebnis) ?? 0 })),
    absagegruende: [...absagegruende.entries()]
      .map(([grund, anzahl]) => ({ grund, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
    kohorten: [...kohortenMap.values()].sort((a, b) =>
      a.monat.localeCompare(b.monat),
    ),
    nachQuelle: gruppiert((p) => p.leadQuelle).map(([quelle, z]) => ({
      quelle,
      ...z,
    })),
    nachOrt: gruppiert((p) => p.ort?.trim() || null)
      .slice(0, 12)
      .map(([ort, z]) => ({ ort, ...z })),
    briefeJeMonat: monateBis(heute, 18).map((monat) => ({
      monat,
      anzahl: briefeJeMonat.get(monat) ?? 0,
    })),
    ergebnisJe,
  };
}

function nachfassListe(
  verlaeufe: Map<string, LeadVerlauf>,
  ergebnisJe: Map<string, Ergebnis>,
  heute: string,
) {
  const liste: NachfassEintrag[] = [];
  for (const v of verlaeufe.values()) {
    if (!v.briefe.length || v.person.nichtKontaktieren) continue;
    const letzter = v.briefe[v.briefe.length - 1];
    const alter = tageZwischen(letzter, heute);
    if (alter < NACHFASSEN_AB_TAGEN || alter > NACHFASSEN_BIS_TAGEN) continue;
    if ((ergebnisJe.get(v.person.id) ?? "keine") !== "keine") continue;
    const danach = massnahmenNach(v, letzter);
    if (
      ["anruf", "nachfassen", "email", "rueckmeldung", "kein_anschreiben"].some(
        (m) => danach.has(m as Massnahme),
      )
    )
      continue;
    liste.push({
      lead: { id: v.person.id, typ: "Lead" },
      name: v.person.name ?? "",
      firma: v.person.firma,
      ort: v.person.ort,
      strasse: v.person.strasse,
      letzterBriefAm: letzter,
      anzahlBriefe: v.briefe.length,
      quelle: v.person.leadQuelle,
    });
  }
  liste.sort((a, b) => b.letzterBriefAm.localeCompare(a.letzterBriefAm));
  return liste;
}

function wiedervorlagen(
  alle: Angereichert[],
  heute: string,
): AkquiseDto["wiedervorlagen"] {
  const offen = alle.filter(
    (a) => istOffen(a) && a.massnahme !== "anschreiben",
  );
  const liste: Wiedervorlage[] = offen.map((a) => {
    const ueberfaellig = a.faelligAm ? tageZwischen(a.faelligAm, heute) : null;
    return {
      id: a.id,
      betreff: a.betreff,
      massnahme: a.massnahme,
      faelligAm: a.faelligAm,
      ueberfaelligTage:
        ueberfaellig !== null && ueberfaellig > 0 ? ueberfaellig : null,
      bearbeiter: a.bearbeiter,
      wer: a.wer?.name ?? a.worauf?.name ?? null,
      firma: a.wer?.firma ?? null,
      sf: a.wer
        ? { id: a.wer.id, typ: a.wer.typ }
        : a.worauf
          ? { id: a.worauf.id, typ: a.worauf.typ }
          : { id: a.id, typ: "Task" },
    };
  });
  // Fällige zuerst (älteste Fälligkeit oben), dann ohne Datum nach Erstellung.
  liste.sort((a, b) => {
    if (a.faelligAm && b.faelligAm)
      return a.faelligAm.localeCompare(b.faelligAm);
    if (a.faelligAm) return -1;
    if (b.faelligAm) return 1;
    return 0;
  });
  return {
    gesamt: liste.length,
    ueberfaellig: liste.filter((w) => w.ueberfaelligTage !== null).length,
    liste: liste.slice(0, 300),
  };
}

function aktivitaetenAuswerten(
  alle: Angereichert[],
  heute: string,
): AkquiseDto["aktivitaeten"] {
  // Nur stattgefundene Aktivitäten; offene Aufgaben sind Planung (Ausnahme: Anschreiben,
  // die Grenz nicht immer abhakt).
  const erfolgt = alle.filter(
    (a) => !istOffen(a) || a.massnahme === "anschreiben",
  );
  const monate = monateBis(heute, 18);
  const jeMonat = monate.map((monat) => {
    const zeile: { monat: string } & Partial<Record<Massnahme, number>> = {
      monat,
    };
    for (const a of erfolgt)
      if (monatVon(a.datum) === monat)
        zeile[a.massnahme] = (zeile[a.massnahme] ?? 0) + 1;
    return zeile;
  });
  const vor12 = new Date(Date.parse(heute) - 365 * TAG).toISOString();
  const vor24 = new Date(Date.parse(heute) - 730 * TAG).toISOString();
  const jahr = erfolgt.filter((a) => a.datum >= vor12);
  const vorjahr = erfolgt.filter((a) => a.datum >= vor24 && a.datum < vor12);
  const jahrZ = zaehle(jahr.map((a) => a.massnahme));
  const vorjahrZ = zaehle(vorjahr.map((a) => a.massnahme));
  const summen = [...new Set([...jahrZ.keys(), ...vorjahrZ.keys()])].map(
    (massnahme) => ({
      massnahme,
      jahr: jahrZ.get(massnahme) ?? 0,
      vorjahr: vorjahrZ.get(massnahme) ?? 0,
    }),
  );

  const personen = new Map<
    string,
    { person: string; gesamt: number } & Partial<Record<Massnahme, number>>
  >();
  for (const a of jahr) {
    const name = a.bearbeiter ?? "unbekannt";
    const z = personen.get(name) ?? { person: name, gesamt: 0 };
    z.gesamt += 1;
    z[a.massnahme] = (z[a.massnahme] ?? 0) + 1;
    personen.set(name, z);
  }
  const bereiche = zaehle(jahr.map((a) => a.bereich));

  const letzte: AktivitaetZeile[] = erfolgt
    .filter(
      (a) => a.massnahme !== "anschreiben" && a.datum <= `${heute}T23:59:59Z`,
    )
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, 80)
    .map((a) => ({
      id: a.id,
      datum: a.datum,
      massnahme: a.massnahme,
      bereich: a.bereich,
      betreff: a.betreff,
      wer: a.wer?.name ?? a.worauf?.name ?? null,
      bearbeiter: a.bearbeiter,
    }));

  return {
    jeMonat,
    summen,
    jePerson: [...personen.values()].sort((a, b) => b.gesamt - a.gesamt),
    jeBereich: (["akquise", "vermarktung", "allgemein"] as Bereich[]).map(
      (bereich) => ({
        bereich,
        anzahl: bereiche.get(bereich) ?? 0,
      }),
    ),
    letzte,
  };
}

type PotenzialRoh = Omit<PotenzialEintrag, "score" | "naechsterSchritt"> & {
  schritte: string[];
};

function potenzialErmitteln(
  daten: Rohdaten,
  alle: Angereichert[],
  verlaeufe: Map<string, LeadVerlauf>,
  ergebnisJe: Map<string, Ergebnis>,
  heute: string,
): PotenzialEintrag[] {
  const eintraege = new Map<string, PotenzialRoh>();
  const holen = (
    schluessel: string,
    basis: () => Omit<PotenzialRoh, "signale" | "schritte">,
  ): PotenzialRoh => {
    const vorhanden = eintraege.get(schluessel);
    if (vorhanden) return vorhanden;
    const neu: PotenzialRoh = { ...basis(), signale: [], schritte: [] };
    eintraege.set(schluessel, neu);
    return neu;
  };
  const signal = (
    e: PotenzialRoh,
    text: string,
    punkte: number,
    schritt?: string,
  ) => {
    if (e.signale.some((s) => s.text === text)) return;
    e.signale.push({ text, punkte });
    if (schritt) e.schritte.push(schritt);
  };
  const juenger = (a: string | null, b: string | null) =>
    !a ? b : !b ? a : a > b ? a : b;

  // 1. Eigentümer-Leads aus der Anschreiben-Akquise.
  for (const v of verlaeufe.values()) {
    const p = v.person;
    if (p.nichtKontaktieren || p.konvertiert) continue;
    const ergebnis = ergebnisJe.get(p.id) ?? (v.briefe.length ? "keine" : null);
    const status = p.leadStatus ?? "";
    const grundPunkte = p.absagegrund
      ? WIEDERVORLAGE_GRUENDE[p.absagegrund]
      : undefined;
    const letzte = v.aktivitaeten.reduce<string | null>(
      (m, a) => juenger(m, a.datum),
      null,
    );
    const warm =
      [
        "Qualified",
        "Nurturing",
        "First contact",
        "Erstkontakt",
        "Wiedervorlage",
      ].includes(status) ||
      grundPunkte !== undefined ||
      v.aktivitaeten.some(
        (a) =>
          a.massnahme === "rueckmeldung" ||
          a.massnahme === "proaktiv" ||
          a.massnahme === "akquise_termin",
      ) ||
      p.bewertung === "Hot" ||
      p.bewertung === "Warm";
    if (!warm) continue;
    if (
      ["Unqualified", "Abgelehnt"].includes(status) &&
      grundPunkte === undefined
    )
      continue;

    const e = holen(`lead:${p.id}`, () => ({
      schluessel: `lead:${p.id}`,
      name:
        p.name && p.name !== "[BUSINESS]" ? p.name : (p.firma ?? "Unbekannt"),
      firma: p.name && p.name !== "[BUSINESS]" ? p.firma : null,
      ort: [p.strasse, p.ort].filter(Boolean).join(", ") || null,
      quelle: "Eigentümer-Lead",
      letzteAktivitaetAm: letzte,
      sf: { id: p.id, typ: "Lead" },
    }));
    if (status === "Qualified")
      signal(e, "Lead qualifiziert", 40, "Termin zur Einwertung vereinbaren");
    if (status === "Nurturing" || status === "Wiedervorlage")
      signal(
        e,
        "In Pflege (Nurturing)",
        30,
        "Regelmäßig Kontakt halten, Marktbericht schicken",
      );
    if (status === "First contact" || status === "Erstkontakt")
      signal(
        e,
        "Erstkontakt nach Anschreiben",
        25,
        "Gespräch vertiefen, Verkaufsabsicht klären",
      );
    if (grundPunkte !== undefined)
      signal(
        e,
        `Absage mit Perspektive: ${p.absagegrund}`,
        grundPunkte,
        "Zum Fristende erneut ansprechen",
      );
    if (p.bewertung === "Hot") signal(e, "Bewertung Hot", 20);
    if (p.bewertung === "Warm") signal(e, "Bewertung Warm", 10);
    if (v.aktivitaeten.some((a) => a.massnahme === "rueckmeldung"))
      signal(e, "Hat auf Anschreiben reagiert", 15);
    if (v.aktivitaeten.some((a) => a.massnahme === "akquise_termin"))
      signal(e, "Objektaufnahme / Termin vor Ort", 25);
    if (v.aktivitaeten.some((a) => a.massnahme === "proaktiv" && istOffen(a)))
      signal(
        e,
        "Proaktive Akquise geplant",
        10,
        "Geplanten Akquise-Kontakt durchführen",
      );
    if (ergebnis === "keine" && v.briefe.length > 1)
      signal(e, `${v.briefe.length} Anschreiben`, 5);
  }

  // 2. Kontakte/Accounts mit Akquise-Terminen (Objektaufnahme, Einwertung) ohne laufendes Mandat.
  const mandatAccounts = new Set(
    daten.mandate.filter((m) => m.accountId).map((m) => m.accountId as string),
  );
  for (const a of alle) {
    if (a.wer?.typ !== "Contact") continue;
    if (!["akquise_termin", "proaktiv"].includes(a.massnahme)) continue;
    const accountId = a.wer.accountId ?? a.wer.id;
    if (mandatAccounts.has(accountId)) continue;
    const e = holen(`acc:${accountId}`, () => ({
      schluessel: `acc:${accountId}`,
      name: a.wer?.name ?? "Unbekannt",
      firma: a.wer?.firma && a.wer.firma !== a.wer.name ? a.wer.firma : null,
      ort: a.wer?.ort ?? null,
      quelle: "Kontakt",
      letzteAktivitaetAm: a.datum,
      sf: a.wer?.accountId
        ? { id: a.wer.accountId, typ: "Account" }
        : { id: a.wer!.id, typ: "Contact" },
    }));
    e.letzteAktivitaetAm = juenger(e.letzteAktivitaetAm, a.datum);
    if (a.massnahme === "akquise_termin")
      signal(
        e,
        "Objektaufnahme / Einwertung ohne Mandat",
        30,
        "Ergebnis der Einwertung nachhalten, Auftrag anbieten",
      );
    else
      signal(
        e,
        "Proaktive Akquise vermerkt",
        15,
        "Akquise-Kontakt durchführen",
      );
  }

  // 3. Mandate in Akquisition oder Einwertung, verlorene Mandate.
  for (const m of daten.mandate) {
    if (istTest(m.eigentuemer)) continue;
    const phase = m.phase ?? "";
    if (!["Akquisition", "Einwertung", "Verloren"].includes(phase)) continue;
    const schluessel = m.accountId ? `acc:${m.accountId}` : `mandat:${m.id}`;
    const e = holen(schluessel, () => ({
      schluessel,
      name: m.ansprechpartner ?? m.eigentuemer ?? m.name,
      firma:
        m.eigentuemer && m.eigentuemer !== m.ansprechpartner
          ? m.eigentuemer
          : null,
      ort: m.objekt,
      quelle: "Mandat",
      letzteAktivitaetAm: m.geaendertAm,
      sf: { id: m.id, typ: "Mandate__c" },
    }));
    e.letzteAktivitaetAm = juenger(e.letzteAktivitaetAm, m.geaendertAm);
    const objekt = m.objekt ? ` (${m.objekt})` : "";
    if (phase === "Akquisition")
      signal(
        e,
        `Mandat in Akquisition${objekt}`,
        35,
        "Einwertung erstellen und vorstellen",
      );
    if (phase === "Einwertung")
      signal(
        e,
        `Einwertung läuft${objekt}`,
        40,
        "Einwertung besprechen, Maklerauftrag einholen",
      );
    if (phase === "Verloren") {
      const spaeter = /jahr|sp(ä|ae)ter|ggf|zukunft|noch nicht/i.test(
        m.verlustgrund ?? "",
      );
      signal(
        e,
        `Verlorenes Mandat${objekt}${m.verlustgrund ? `: ${m.verlustgrund}` : ""}`,
        spaeter ? 30 : 15,
        "Erneut ansprechen, ob der Verkauf wieder Thema ist",
      );
    }
    const ruhtTage = tageZwischen(m.geaendertAm, heute);
    if (phase !== "Verloren" && ruhtTage > 90)
      signal(
        e,
        `Mandat seit ${ruhtTage} Tagen unverändert`,
        10,
        "Status beim Eigentümer abfragen",
      );
  }

  // 4. Käufer aus Grenz-Deals: Bestandshalter, die später wieder verkaufen.
  for (const k of daten.kaeufe) {
    if (!k.accountId) continue;
    const e = holen(`acc:${k.accountId}`, () => ({
      schluessel: `acc:${k.accountId}`,
      name: k.kaeufer ?? k.name,
      firma: null,
      ort: k.objekt,
      quelle: "Käufer",
      letzteAktivitaetAm: k.abschlussAm,
      sf: { id: k.accountId as string, typ: "Account" },
    }));
    const jahr = k.abschlussAm?.slice(0, 4);
    signal(
      e,
      `Hat ${k.objekt ?? "ein Objekt"} über Grenz gekauft${jahr ? ` (${jahr})` : ""}`,
      12,
      "Als Bestandshalter pflegen: weitere Objekte im Bestand erfragen",
    );
  }

  // 5. Überfällige Wiedervorlagen erhöhen die Dringlichkeit.
  for (const a of alle) {
    if (
      !istOffen(a) ||
      a.massnahme === "anschreiben" ||
      !a.faelligAm ||
      a.faelligAm > heute
    )
      continue;
    const schluessel =
      a.wer?.typ === "Lead"
        ? `lead:${a.wer.id}`
        : a.wer?.accountId
          ? `acc:${a.wer.accountId}`
          : null;
    const e = schluessel ? eintraege.get(schluessel) : undefined;
    if (e)
      signal(
        e,
        `Wiedervorlage fällig seit ${formatTage(tageZwischen(a.faelligAm, heute))}`,
        10,
        a.betreff,
      );
  }

  // Frische Aktivität (90 Tage) zählt zusätzlich.
  for (const e of eintraege.values()) {
    if (e.letzteAktivitaetAm && tageZwischen(e.letzteAktivitaetAm, heute) <= 90)
      signal(e, "Aktivität in den letzten 90 Tagen", 10);
  }

  return [...eintraege.values()]
    .filter((e) => e.signale.length > 0)
    .map(({ schritte, ...e }): PotenzialEintrag => ({
      ...e,
      score: Math.min(
        100,
        e.signale.reduce((s, x: PotenzialSignal) => s + x.punkte, 0),
      ),
      naechsterSchritt: schritte[0] ?? "Kontakt aufnehmen",
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.letzteAktivitaetAm ?? "").localeCompare(a.letzteAktivitaetAm ?? ""),
    )
    .slice(0, 300);
}

function formatTage(t: number): string {
  return t === 1 ? "1 Tag" : `${t} Tagen`;
}

export function akquiseBerechnen(
  daten: Rohdaten,
  heute: string,
  stand = new Date().toISOString(),
): AkquiseDto {
  const alle: Angereichert[] = daten.aufgaben.map((a) => {
    const massnahme = klassifiziere(a);
    return {
      ...a,
      massnahme,
      datum: aktivitaetsDatum(a),
      bereich: bereichVon(a, massnahme),
    };
  });
  const verlaeufe = leadVerlaeufe(alle);
  const { ergebnisJe, ...anschreiben } = anschreibenAuswerten(
    verlaeufe,
    alle,
    heute,
  );
  const nachfassen = nachfassListe(verlaeufe, ergebnisJe, heute);
  const vor12 = new Date(Date.parse(heute) - 365 * TAG).toISOString();
  const mandate = daten.mandate.filter((m) => !istTest(m.eigentuemer));

  return {
    stand,
    anschreiben,
    aktivitaeten: aktivitaetenAuswerten(alle, heute),
    wiedervorlagen: wiedervorlagen(alle, heute),
    nachfassen: { gesamt: nachfassen.length, liste: nachfassen.slice(0, 250) },
    potenzial: potenzialErmitteln(daten, alle, verlaeufe, ergebnisJe, heute),
    pool: daten.leadPool
      .map((p) => ({ ...p, label: leadStatusLabel(p.status) }))
      .sort((a, b) => b.anzahl - a.anzahl),
    mandate: {
      akquisition: mandate.filter((m) => m.phase === "Akquisition").length,
      einwertung: mandate.filter((m) => m.phase === "Einwertung").length,
      beauftragt12m: mandate.filter(
        (m) =>
          (m.phase === "Beauftragung" || m.phase === "Gewonnen") &&
          m.erstelltAm >= vor12,
      ).length,
      verloren: mandate.filter((m) => m.phase === "Verloren").length,
    },
    kaeuferBestand: new Set(
      daten.kaeufe.map((k) => k.accountId).filter(Boolean),
    ).size,
  };
}
