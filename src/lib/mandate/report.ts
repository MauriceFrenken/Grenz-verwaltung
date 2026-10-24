/**
 * Eigentümer-Report (Masterplan 4.3): reine Berechnungen aus den sf_*-Caches.
 * Keine Datenbank- und keine Netzwerkzugriffe, damit alles testbar bleibt.
 */

import type { Block, DokumentInhalt, InhaltAbschnitt, Quelle } from "@/lib/vorlagen/typen";

export type MitgliedZeile = {
  sf_id: string;
  kampagne_sf_id: string;
  kontakt_sf_id: string | null;
  status: string | null;
  geantwortet: boolean | null;
  erstmals_geantwortet_am: string | null;
  sf_daten?: Record<string, unknown> | null;
};

export type AktivitaetZeile = {
  sf_id: string;
  sf_typ: string;
  art: string | null;
  betreff: string | null;
  datum: string | null;
  status?: string | null;
  who_sf_id?: string | null;
  kampagne_sf_id?: string | null;
  sf_daten?: Record<string, unknown> | null;
};

export type DealZeile = {
  sf_id: string;
  name: string;
  phase: string | null;
  betrag: number | null;
  abschluss_am: string | null;
  kontakt_sf_id: string | null;
  account_sf_id: string | null;
  sf_daten?: Record<string, unknown> | null;
};

export type KampagneZeile = {
  sf_id: string;
  name: string;
  typ: string | null;
  status: string | null;
  start_am: string | null;
  anzahl_mitglieder: number | null;
};

export type FunnelStufe = "geplant" | "angeschrieben" | "geantwortet" | "interesse" | "besichtigung" | "kaufangebot";

export type Funnel = {
  angesprochen: number;
  angeschrieben: number;
  geantwortet: number;
  interesse: number;
  besichtigung: number;
  kaufangebot: number;
  absagen: number;
};

const GEPLANT = new Set(["geplante ansprache", "geplanter versand"]);
const ABSAGE = new Set(["absage", "kein interesse", "abgesagt"]);
const INTERESSE = new Set(["interesse", "exposé angefordert", "expose angefordert", "unterlagen angefordert", "nda"]);
const BESICHTIGUNG = new Set(["besichtigung", "besichtigung erfolgt", "besichtigung geplant"]);
const KAUFANGEBOT = new Set(["kaufangebot", "verhandlung", "geschlossen", "notartermin", "beurkundet"]);

function zahl(wert: unknown): number | null {
  if (typeof wert === "number" && Number.isFinite(wert)) return wert;
  if (typeof wert === "string" && wert.trim() && Number.isFinite(Number(wert))) return Number(wert);
  return null;
}

/** Höchste erreichte Stufe eines Kampagnenmitglieds (Abbildung zur Bestätigung durch Maurice). */
export function funnelStufe(m: MitgliedZeile): FunnelStufe {
  const s = (m.status ?? "").trim().toLowerCase();
  const d = m.sf_daten ?? {};
  if (KAUFANGEBOT.has(s) || (zahl(d.Kaufangebot__c) ?? 0) > 0) return "kaufangebot";
  if (BESICHTIGUNG.has(s) || d.Besichtigung__c === true) return "besichtigung";
  if (INTERESSE.has(s)) return "interesse";
  if (m.geantwortet || s === "geantwortet" || ABSAGE.has(s)) return "geantwortet";
  if (GEPLANT.has(s) || !s) return "geplant";
  return "angeschrieben";
}

export function istAbsage(m: MitgliedZeile): boolean {
  return ABSAGE.has((m.status ?? "").trim().toLowerCase());
}

const REIHENFOLGE: FunnelStufe[] = ["geplant", "angeschrieben", "geantwortet", "interesse", "besichtigung", "kaufangebot"];

/** Kumulierter Funnel: wer eine Stufe erreicht hat, zählt auch in allen davor. Je Kontakt nur einmal. */
export function berechneFunnel(mitglieder: MitgliedZeile[]): Funnel {
  const besteJeKontakt = new Map<string, { stufe: number; absage: boolean }>();
  for (const m of mitglieder) {
    const schluessel = m.kontakt_sf_id ?? m.sf_id;
    const stufe = REIHENFOLGE.indexOf(funnelStufe(m));
    const bisher = besteJeKontakt.get(schluessel);
    besteJeKontakt.set(schluessel, {
      stufe: Math.max(stufe, bisher?.stufe ?? -1),
      absage: (bisher?.absage ?? false) || istAbsage(m),
    });
  }
  const f: Funnel = {
    angesprochen: 0,
    angeschrieben: 0,
    geantwortet: 0,
    interesse: 0,
    besichtigung: 0,
    kaufangebot: 0,
    absagen: 0,
  };
  for (const { stufe, absage } of besteJeKontakt.values()) {
    f.angesprochen += 1;
    if (stufe >= 1) f.angeschrieben += 1;
    if (stufe >= 2) f.geantwortet += 1;
    if (stufe >= 3) f.interesse += 1;
    if (stufe >= 4) f.besichtigung += 1;
    if (stufe >= 5) f.kaufangebot += 1;
    if (absage) f.absagen += 1;
  }
  return f;
}

function wochenStart(iso: string): string {
  const d = new Date(iso);
  const tag = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() - tag);
  return d.toISOString().slice(0, 10);
}

export type WochenWert = { woche: string; anzahl: number };

/** Aktivitäten je Kalenderwoche (Montag) im Zeitraum, leere Wochen mit 0. */
export function aktivitaetenJeWoche(aktivitaeten: AktivitaetZeile[], von: string, bis: string): WochenWert[] {
  const zaehler = new Map<string, number>();
  for (let w = wochenStart(`${von}T00:00:00Z`); w <= bis; ) {
    zaehler.set(w, 0);
    const d = new Date(`${w}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    w = d.toISOString().slice(0, 10);
  }
  for (const a of imZeitraum(aktivitaeten, von, bis)) {
    const w = wochenStart(a.datum!);
    zaehler.set(w, (zaehler.get(w) ?? 0) + 1);
  }
  return [...zaehler.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([woche, anzahl]) => ({ woche, anzahl }));
}

export function imZeitraum<T extends { datum: string | null }>(liste: T[], von: string, bis: string): T[] {
  return liste.filter((a) => {
    if (!a.datum) return false;
    const tag = a.datum.slice(0, 10);
    return tag >= von && tag <= bis;
  });
}

export function aktivitaetenNachArt(aktivitaeten: AktivitaetZeile[]): { art: string; anzahl: number }[] {
  const m = new Map<string, number>();
  for (const a of aktivitaeten) m.set(a.art ?? "Sonstiges", (m.get(a.art ?? "Sonstiges") ?? 0) + 1);
  return [...m.entries()].map(([art, anzahl]) => ({ art, anzahl })).sort((a, b) => b.anzahl - a.anzahl);
}

export type Angebot = {
  quelleId: string;
  bieter: string;
  betrag: number | null;
  datum: string | null;
  phase: string | null;
  notiz: string | null;
};

/**
 * Angebote: Deals mit Betrag (Interessenten-Opportunities am Objekt) und Kampagnenmitglieder
 * mit Kaufangebot. Bieter werden über die Kontaktnamen aufgelöst; ein Bieter erscheint einmal
 * je Quelle, Deals haben Vorrang.
 */
export function sammleAngebote(
  deals: DealZeile[],
  mitglieder: MitgliedZeile[],
  namen: Map<string, string>,
): Angebot[] {
  const angebote: Angebot[] = [];
  const bieterMitDeal = new Set<string>();
  for (const d of deals) {
    if (d.betrag == null || d.betrag <= 0) continue;
    const bieterId = d.kontakt_sf_id ?? d.account_sf_id;
    if (bieterId) bieterMitDeal.add(bieterId);
    angebote.push({
      quelleId: d.sf_id,
      bieter: (bieterId && namen.get(bieterId)) || d.name,
      betrag: d.betrag,
      datum: d.abschluss_am,
      phase: d.phase,
      notiz: null,
    });
  }
  for (const m of mitglieder) {
    const betrag = zahl(m.sf_daten?.Kaufangebot__c);
    if (!(betrag && betrag > 0) && funnelStufe(m) !== "kaufangebot") continue;
    if (m.kontakt_sf_id && bieterMitDeal.has(m.kontakt_sf_id)) continue;
    const notiz = m.sf_daten?.Notizen_Kaufangebot__c;
    angebote.push({
      quelleId: m.sf_id,
      bieter: (m.kontakt_sf_id && namen.get(m.kontakt_sf_id)) || "Unbekannter Interessent",
      betrag: betrag && betrag > 0 ? betrag : null,
      datum: m.erstmals_geantwortet_am,
      phase: m.status,
      notiz: typeof notiz === "string" && notiz.trim() ? notiz.trim() : null,
    });
  }
  return angebote.sort((a, b) => (b.betrag ?? 0) - (a.betrag ?? 0));
}

/** Eingefrorener Zahlenstand eines Reports (eigentuemer_reports.kennzahlen). */
export type ReportKennzahlen = {
  stand: string;
  zeitraum: { von: string; bis: string };
  mandat: {
    sfId: string;
    name: string;
    status: string | null;
    angebotspreis: number | null;
    objekt: string | null;
    adresse: string | null;
  };
  kampagnen: { sfId: string; name: string; typ: string | null; mitglieder: number }[];
  funnel: Funnel;
  aktivitaeten: { gesamt: number; zeitraum: number; jeWoche: WochenWert[]; nachArt: { art: string; anzahl: number }[] };
  angebote: Angebot[];
  /** Für Belege im Dokument: Aktivitäten im Zeitraum (Id, Datum, Art, Betreff). */
  aktivitaetsListe: { sfId: string; datum: string; art: string; betreff: string }[];
};

export type ReportEingabe = {
  von: string;
  bis: string;
  mandat: ReportKennzahlen["mandat"];
  kampagnen: KampagneZeile[];
  mitglieder: MitgliedZeile[];
  aktivitaeten: AktivitaetZeile[];
  deals: DealZeile[];
  namen: Map<string, string>;
  jetzt?: Date;
};

export function berechneReportKennzahlen(e: ReportEingabe): ReportKennzahlen {
  const imZr = imZeitraum(e.aktivitaeten, e.von, e.bis).sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? ""));
  const mitgliederJeKampagne = new Map<string, number>();
  for (const m of e.mitglieder) mitgliederJeKampagne.set(m.kampagne_sf_id, (mitgliederJeKampagne.get(m.kampagne_sf_id) ?? 0) + 1);
  return {
    stand: (e.jetzt ?? new Date()).toISOString(),
    zeitraum: { von: e.von, bis: e.bis },
    mandat: e.mandat,
    kampagnen: e.kampagnen.map((k) => ({
      sfId: k.sf_id,
      name: k.name,
      typ: k.typ,
      mitglieder: mitgliederJeKampagne.get(k.sf_id) ?? k.anzahl_mitglieder ?? 0,
    })),
    funnel: berechneFunnel(e.mitglieder),
    aktivitaeten: {
      gesamt: e.aktivitaeten.length,
      zeitraum: imZr.length,
      jeWoche: aktivitaetenJeWoche(e.aktivitaeten, e.von, e.bis),
      nachArt: aktivitaetenNachArt(imZr),
    },
    angebote: sammleAngebote(e.deals, e.mitglieder, e.namen),
    aktivitaetsListe: imZr.slice(0, 200).map((a) => ({
      sfId: a.sf_id,
      datum: a.datum!.slice(0, 10),
      art: a.art ?? "Aktivität",
      betreff: a.betreff ?? "(ohne Betreff)",
    })),
  };
}

/** Bearbeitbare Texte des Reports (eigentuemer_reports.inhalt). */
export type ReportTexte = {
  einleitung?: string;
  marktfeedback?: { text: string; quellen: string[] }[];
  marktfeedbackLuecken?: string[];
  naechsteSchritte?: string[];
  kommentar?: string;
};

export function euro(wert: number | null | undefined): string {
  if (wert == null) return "nicht gepflegt";
  return `${wert.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €`;
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

/** Baut das Dokument (PDF/PPTX) aus eingefrorenen Zahlen und den bearbeiteten Texten. */
export function reportDokument(
  k: ReportKennzahlen,
  texte: ReportTexte,
  optionen: { titel?: string; freigegeben: boolean },
): DokumentInhalt {
  const quellen: Quelle[] = [];
  const q = (quelle: Quelle): string => {
    if (!quellen.some((x) => x.id === quelle.id)) quellen.push(quelle);
    return quelle.id;
  };
  const sfMandat = q({ id: k.mandat.sfId, art: "feld", bezeichnung: `Salesforce Mandat ${k.mandat.name}`, verweis: k.mandat.sfId });
  const kampagnenQuellen = k.kampagnen.map((c) =>
    q({ id: c.sfId, art: "feld", bezeichnung: `Salesforce Kampagne ${c.name}`, verweis: c.sfId }),
  );
  const berechnung = q({
    id: "berechnung-funnel",
    art: "berechnung",
    bezeichnung: `Auswertung der Kampagnenmitglieder, Stand ${datumKurz(k.stand)}`,
  });

  const abschnitte: InhaltAbschnitt[] = [];

  const ueberblick: Block[] = [];
  if (texte.einleitung?.trim()) ueberblick.push({ art: "absatz", text: texte.einleitung.trim() });
  ueberblick.push({
    art: "kennzahlen",
    eintraege: [
      { label: "Objekt", wert: k.mandat.objekt ?? k.mandat.name, quellen: [sfMandat] },
      { label: "Angebotspreis", wert: euro(k.mandat.angebotspreis), quellen: [sfMandat] },
      { label: "Zeitraum", wert: `${datumKurz(k.zeitraum.von)} bis ${datumKurz(k.zeitraum.bis)}` },
      { label: "Angesprochene Investoren", wert: String(k.funnel.angesprochen), quellen: [berechnung] },
      { label: "Aktivitäten im Zeitraum", wert: String(k.aktivitaeten.zeitraum), quellen: [berechnung] },
      { label: "Kaufangebote", wert: String(k.angebote.length), quellen: [berechnung] },
    ],
  });
  if (k.mandat.angebotspreis == null) ueberblick.push({ art: "luecke", text: "Angebotspreis im Mandat (Exposé-Preis) nicht gepflegt." });
  abschnitte.push({ id: "ueberblick", titel: "Überblick", bloecke: ueberblick });

  const f = k.funnel;
  abschnitte.push({
    id: "funnel",
    titel: "Vermarktungsverlauf",
    bloecke: k.kampagnen.length
      ? [
          {
            art: "balken",
            eintraege: [
              { label: "Angesprochen", wert: f.angesprochen },
              { label: "Angeschrieben", wert: f.angeschrieben },
              { label: "Rückmeldung", wert: f.geantwortet },
              { label: "Interesse", wert: f.interesse },
              { label: "Besichtigung", wert: f.besichtigung },
              { label: "Kaufangebot", wert: f.kaufangebot },
            ],
          },
          {
            art: "absatz",
            text: `Seit Beginn der Vermarktung wurden ${f.angesprochen} Investoren in ${k.kampagnen.length} Kampagne(n) angesprochen. ${f.absagen} haben abgesagt.`,
            quellen: [berechnung, ...kampagnenQuellen],
          },
        ]
      : [{ art: "luecke", text: "Zu diesem Mandat ist in Salesforce keine Kampagne verknüpft." }],
  });

  abschnitte.push({
    id: "aktivitaeten",
    titel: "Aktivitäten im Zeitraum",
    bloecke: k.aktivitaeten.zeitraum
      ? [
          {
            art: "tabelle",
            kopf: ["Art", "Anzahl"],
            ausrichtung: ["links", "rechts"],
            zeilen: k.aktivitaeten.nachArt.map((a) => [a.art, String(a.anzahl)]),
          },
          {
            art: "balken",
            eintraege: k.aktivitaeten.jeWoche.map((w) => ({ label: `Woche ab ${datumKurz(w.woche)}`, wert: w.anzahl })),
          },
        ]
      : [{ art: "hinweis", text: "Im Zeitraum sind in Salesforce keine Aktivitäten zum Mandat erfasst." }],
  });

  abschnitte.push({
    id: "angebote",
    titel: "Angebote",
    bloecke: k.angebote.length
      ? [
          {
            art: "tabelle",
            kopf: ["Bieter", "Betrag", "Stand"],
            ausrichtung: ["links", "rechts", "links"],
            zeilen: k.angebote.map((a) => [a.bieter, euro(a.betrag), a.phase ?? ""]),
          },
          {
            art: "absatz",
            text: "Angebote laut Salesforce (Interessenten-Deals und Kampagnenmitglieder mit Kaufangebot).",
            quellen: k.angebote.map((a) =>
              q({ id: a.quelleId, art: "feld", bezeichnung: `Salesforce Angebot ${a.bieter}`, verweis: a.quelleId }),
            ),
          },
        ]
      : [{ art: "hinweis", text: "Bisher liegen keine Kaufangebote vor." }],
  });

  const feedback: Block[] = [];
  const aktivitaetsIds = new Set(k.aktivitaetsListe.map((a) => a.sfId));
  for (const aussage of texte.marktfeedback ?? []) {
    const belege = aussage.quellen.filter((id) => aktivitaetsIds.has(id) || quellen.some((x) => x.id === id));
    if (!belege.length) {
      feedback.push({ art: "luecke", text: `Ohne Beleg nicht übernommen: ${aussage.text}` });
      continue;
    }
    for (const id of belege) {
      const a = k.aktivitaetsListe.find((x) => x.sfId === id);
      if (a) q({ id, art: "aktivitaet", bezeichnung: `${a.art} vom ${datumKurz(a.datum)}: ${a.betreff}`, verweis: id });
    }
    feedback.push({ art: "absatz", text: aussage.text, quellen: belege });
  }
  for (const l of texte.marktfeedbackLuecken ?? []) feedback.push({ art: "luecke", text: l });
  if (!feedback.length) feedback.push({ art: "luecke", text: "Marktfeedback noch nicht erfasst." });
  abschnitte.push({ id: "marktfeedback", titel: "Marktfeedback", bloecke: feedback });

  const schritte = (texte.naechsteSchritte ?? []).map((s) => s.trim()).filter(Boolean);
  const schlussBloecke: Block[] = schritte.length
    ? [{ art: "liste", punkte: schritte }]
    : [{ art: "luecke", text: "Nächste Schritte noch nicht erfasst." }];
  if (texte.kommentar?.trim()) schlussBloecke.push({ art: "absatz", text: texte.kommentar.trim() });
  abschnitte.push({ id: "naechste_schritte", titel: "Nächste Schritte", bloecke: schlussBloecke });

  return {
    typ: "eigentuemer_report",
    titel: optionen.titel ?? `Vermarktungsbericht ${k.mandat.objekt ?? k.mandat.name}`,
    untertitel: k.mandat.adresse ?? undefined,
    datum: k.stand,
    abschnitte,
    quellen,
    stempel: optionen.freigegeben ? undefined : "ENTWURF",
  };
}
