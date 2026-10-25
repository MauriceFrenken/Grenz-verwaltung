/**
 * Vermarktungsbericht für Eigentümer nach der Grenz-Vorlage (Titelseite, Zielgruppe,
 * Vermarktungsstand). Reine Berechnungen ohne Datenbank- und Netzwerkzugriffe:
 * - aus Salesforce vorgeschlagene Werte (beim Anlegen eingefroren, in kennzahlen.vermarktung),
 * - händische Werte aus der App (inhalt.werte), die immer Vorrang haben,
 * - aufgelöster Stand, aus dem Vorschau, PDF und PowerPoint gerendert werden.
 * Läuft auch im Browser (Live-Vorschau im Editor).
 */

import type {
  AktivitaetZeile,
  DealZeile,
  MitgliedZeile,
  ReportKennzahlen,
  ReportTexte,
} from "./report";

export const STATUS_STUFEN = [
  { key: "exposeInPruefung", label: "Exposé in Prüfung" },
  { key: "erstesInteresse", label: "Erstes Interesse" },
  { key: "besichtigung", label: "Besichtigung" },
  { key: "pruefungNachBesichtigung", label: "Prüfung nach Besichtigung" },
  { key: "kaufangebot", label: "Kaufangebot" },
  { key: "absageNachInteresse", label: "Absage nach Interesse" },
  { key: "absagen", label: "Absagen" },
] as const;

export type StatusSchluessel = (typeof STATUS_STUFEN)[number]["key"];

export const KUNDENGRUPPEN = [
  { key: "privat", label: "Privatinvestoren" },
  { key: "vermoegen", label: "Vermögensverwaltungen / Family Offices" },
  { key: "entwickler", label: "Projektentwickler / Bauträger" },
  { key: "fonds", label: "Fonds / Versicherungen" },
] as const;

export type KundengruppeSchluessel = (typeof KUNDENGRUPPEN)[number]["key"];

/** Absagegründe der Vorlage; weitere Gründe kann man in der App ergänzen. */
export const ABSAGEGRUENDE = [
  "Nicht aktiv",
  "Volumen zu klein",
  "Mikrolage / Gebäudeumfeld",
  "Kein passendes Vehikel",
  "Genehmigungslage",
  "Finanzierungsumfeld",
  "Kaufpreisvorstellung",
] as const;

export const OHNE_ANGABE = "Ohne Angabe";

/** Farben der Grenz-Vorlage (Diagramme, Tabellenkopf). */
export const BERICHT_FARBEN = {
  navy: "#233567",
  hellblau: "#BCD4E5",
  grau: "#D9D9D9",
  zeile: "#F2F2F2",
  text: "#1A1A1A",
  textHell: "#595959",
  diagramm: [
    "#233567",
    "#BCD4E5",
    "#D9D9D9",
    "#6B6F8A",
    "#3E4362",
    "#A6A6A6",
    "#8EA9C1",
    "#4A5A8C",
  ],
  /** Für Diagramme auf der hellblauen Fläche (Hellblau wäre dort unsichtbar). */
  diagrammPanel: [
    "#233567",
    "#F2F2F2",
    "#D9D9D9",
    "#6B6F8A",
    "#3E4362",
    "#A6A6A6",
    "#FFFFFF",
    "#4A5A8C",
  ],
} as const;

export type InteressentInfo = {
  name: string;
  firma?: string | null;
  /** Account.Type */
  accountTyp?: string | null;
  /** Account.Private__c */
  privat?: boolean | null;
  /** Investorprofile__c.Investor_Type__c */
  investorTyp?: string | null;
};

export type InteressentEinordnung = {
  id: string;
  name: string;
  status: StatusSchluessel | "vorgemerkt";
  kundengruppe: KundengruppeSchluessel;
  absagegrund: string | null;
};

/** Aus Salesforce berechneter Vorschlag (eingefroren in kennzahlen.vermarktung). */
export type VermarktungAusSalesforce = {
  objekttyp: string | null;
  objektanschrift: string | null;
  ort: string | null;
  auftraggeber: string | null;
  vermarktungsbeginn: string | null;
  status: Record<StatusSchluessel, number>;
  /** Ausgewählt, aber noch nicht angeschrieben (zählt nicht als angesprochen). */
  vorgemerkt: number;
  kundengruppen: Record<KundengruppeSchluessel, number>;
  absagegruende: { grund: string; anzahl: number }[];
  interessenten: InteressentEinordnung[];
};

/** Händische Werte aus der App; jeder gesetzte Wert ersetzt den Salesforce-Vorschlag. */
export type BerichtWerte = {
  titel?: string;
  objektbezeichnung?: string;
  objektanschrift?: string;
  objekttyp?: string;
  auftraggeber?: string;
  vermarktungsbeginn?: string;
  berichtsdatum?: string;
  status?: Partial<Record<StatusSchluessel, number>>;
  kundengruppen?: Partial<Record<KundengruppeSchluessel, number>>;
  absagegruende?: { grund: string; anzahl: number }[];
};

export type BerichtFotos = { titel?: string | null; objekt?: string | null };

const KAUFANGEBOT_STATUS = new Set([
  "kaufangebot",
  "verhandlung",
  "notartermin",
  "beurkundet",
]);
const BESICHTIGT_STATUS = new Set(["besichtigung erfolgt"]);
const BESICHTIGUNG_STATUS = new Set(["besichtigung", "besichtigung geplant"]);
const INTERESSE_STATUS = new Set([
  "interesse",
  "geantwortet",
  "exposé angefordert",
  "expose angefordert",
  "unterlagen angefordert",
  "nda",
]);
const ABSAGE_STATUS = new Set(["absage", "kein interesse", "abgesagt"]);
const GEPLANT_STATUS = new Set([
  "geplante ansprache",
  "geplanter versand",
  "angebot versenden",
]);
const DEAL_ABGESCHLOSSEN = new Set(["invoice paid", "closed won"]);
const BESICHTIGUNG_BETREFF = /besichtig|begehung/i;

function zahl(wert: unknown): number | null {
  if (typeof wert === "number" && Number.isFinite(wert)) return wert;
  if (typeof wert === "string" && wert.trim() && Number.isFinite(Number(wert)))
    return Number(wert);
  return null;
}

function klein(wert: unknown): string {
  return typeof wert === "string" ? wert.trim().toLowerCase() : "";
}

/**
 * Kundengruppe eines Interessenten: zuerst Ankaufsprofil (Investor_Type__c), dann Account-Typ
 * und „Privater Investor?“, sonst Einordnung über den Firmennamen. Personen ohne Firma gelten
 * als Privatinvestoren. Die Felder sind in Salesforce kaum gepflegt, daher ist das ein Vorschlag.
 */
export function kundengruppe(info: InteressentInfo): KundengruppeSchluessel {
  const typ = `${klein(info.investorTyp)} ${klein(info.accountTyp)}`;
  if (/privat|semi/.test(typ)) return "privat";
  if (/family|vermögen/.test(typ)) return "vermoegen";
  if (/fonds|institutionell|institiutionell|versicher|bank/.test(typ))
    return "fonds";
  if (/projekt|entwick|bauträger/.test(typ)) return "entwickler";
  if (info.privat === true) return "privat";
  const firma = `${info.firma ?? ""} ${info.firma ? "" : info.name}`.trim();
  if (
    /fonds|kvg|kapitalverwaltung|asset|capital|versicher|reit|pensions|bank|sparkasse|invest(ment|ors)?\b|real estate|wohnungsgesellschaft|wohnungsbaugesellschaft|genossenschaft/i.test(
      firma,
    )
  )
    return "fonds";
  if (
    /projekt|entwickl|develop|bauträger|bautraeger|baubetreu|erschließ|erschliess|wohnbau|hausbau|\bbau\b|construct/i.test(
      firma,
    )
  )
    return "entwickler";
  if (
    /family|vermögen|vermoegen|holding|beteiligung|verwaltung|grundbesitz|stiftung|office|immobilien|\b(gmbh|ag|kg|ug|mbh|gbr|se|ohg|ltd|b\.?v\.?|s\.?a\.?|co\.? kg)\b/i.test(
      firma,
    )
  )
    return "vermoegen";
  return "privat";
}

const LOSS_REASON: Record<string, string> = {
  price: "Kaufpreisvorstellung",
  outbid: "Kaufpreisvorstellung",
  financing: "Finanzierungsumfeld",
  "no budget / lost funding": "Finanzierungsumfeld",
  "no decision / non-responsive": "Nicht aktiv",
  postponed: "Nicht aktiv",
};

const GRUND_MUSTER: [string, RegExp][] = [
  [
    "Nicht aktiv",
    /nicht (mehr )?aktiv|derzeit kein|aktuell kein|momentan kein|kein bedarf|keine ankäufe|ankaufsstopp|pausier/i,
  ],
  ["Volumen zu klein", /zu klein|volumen|größenordnung|zu gering/i],
  [
    "Kein passendes Vehikel",
    /vehikel|passt nicht|nicht ins (profil|portfolio)|ankaufsprofil|strategie|fokus|nicht in unser/i,
  ],
  ["Genehmigungslage", /genehmig|baurecht|bauordnung|dachgeschoss/i],
  ["Finanzierungsumfeld", /finanzier|zinsen|zinsniveau|zinssteiger/i],
  [
    "Mikrolage / Gebäudeumfeld",
    /mikrolage|\blage\b|umfeld|standort|nachbarschaft/i,
  ],
  [
    "Kaufpreisvorstellung",
    /kaufpreis|preisvorstellung|zu teuer|überteuert|faktor|rendite|preis/i,
  ],
];

/** Absagegrund aus Freitext (Betreff, Beschreibung von Aktivitäten), sonst null. */
export function absagegrundAusText(text: string): string | null {
  for (const [grund, muster] of GRUND_MUSTER)
    if (muster.test(text)) return grund;
  return null;
}

function leererStatus(): Record<StatusSchluessel, number> {
  return Object.fromEntries(STATUS_STUFEN.map((s) => [s.key, 0])) as Record<
    StatusSchluessel,
    number
  >;
}

function leereGruppen(): Record<KundengruppeSchluessel, number> {
  return Object.fromEntries(KUNDENGRUPPEN.map((g) => [g.key, 0])) as Record<
    KundengruppeSchluessel,
    number
  >;
}

export type VermarktungEingabe = {
  mitglieder: MitgliedZeile[];
  deals: DealZeile[];
  aktivitaeten: AktivitaetZeile[];
  /** Name und Einordnung je Account- oder Kontakt-Id. */
  infos: Map<string, InteressentInfo>;
  objekttyp: string | null;
  objektanschrift: string | null;
  ort: string | null;
  auftraggeber: string | null;
  vermarktungsbeginn: string | null;
  heute?: string;
};

type Sammlung = {
  id: string;
  kontakte: Set<string>;
  deals: DealZeile[];
  cmStatus: string[];
  cmKaufangebot: boolean;
  cmBesichtigt: boolean;
};

/**
 * Status je Interessent (Account, sonst Kontakt), jeder zählt genau einmal (wie in der Vorlage:
 * Summe der Status = angesprochene Investoren). Interessenten-Deals haben Vorrang vor dem
 * Kampagnenstatus, der nach dem Erstkontakt selten gepflegt wird.
 */
export function berechneVermarktung(
  e: VermarktungEingabe,
): VermarktungAusSalesforce {
  const heute = e.heute ?? new Date().toISOString().slice(0, 10);
  const interessentJeKontakt = new Map<string, string>();
  for (const m of e.mitglieder)
    if (m.kontakt_sf_id && m.account_sf_id)
      interessentJeKontakt.set(m.kontakt_sf_id, m.account_sf_id);

  const alle = new Map<string, Sammlung>();
  const hole = (id: string): Sammlung => {
    let s = alle.get(id);
    if (!s) {
      s = {
        id,
        kontakte: new Set(),
        deals: [],
        cmStatus: [],
        cmKaufangebot: false,
        cmBesichtigt: false,
      };
      alle.set(id, s);
    }
    return s;
  };

  for (const m of e.mitglieder) {
    const s = hole(m.account_sf_id ?? m.kontakt_sf_id ?? m.sf_id);
    if (m.kontakt_sf_id) s.kontakte.add(m.kontakt_sf_id);
    s.cmStatus.push(klein(m.status));
    if ((zahl(m.sf_daten?.Kaufangebot__c) ?? 0) > 0) s.cmKaufangebot = true;
    if (m.sf_daten?.Besichtigung__c === true) s.cmBesichtigt = true;
  }
  for (const d of e.deals) {
    const id =
      d.account_sf_id ??
      (d.kontakt_sf_id
        ? (interessentJeKontakt.get(d.kontakt_sf_id) ?? d.kontakt_sf_id)
        : d.sf_id);
    const s = hole(id);
    if (d.kontakt_sf_id) s.kontakte.add(d.kontakt_sf_id);
    s.deals.push(d);
  }

  const textJeKontakt = new Map<string, string[]>();
  const textJeDeal = new Map<string, string[]>();
  for (const a of e.aktivitaeten) {
    const beschreibung = a.sf_daten?.Description;
    const t = [
      a.betreff ?? "",
      typeof beschreibung === "string" ? beschreibung : "",
    ]
      .join(" ")
      .trim();
    if (!t) continue;
    if (a.who_sf_id)
      textJeKontakt.set(a.who_sf_id, [
        ...(textJeKontakt.get(a.who_sf_id) ?? []),
        t,
      ]);
    if (a.what_sf_id)
      textJeDeal.set(a.what_sf_id, [
        ...(textJeDeal.get(a.what_sf_id) ?? []),
        t,
      ]);
  }

  const status = leererStatus();
  const kundengruppen = leereGruppen();
  const gruende = new Map<string, number>();
  const interessenten: InteressentEinordnung[] = [];
  let vorgemerkt = 0;

  for (const s of alle.values()) {
    const offeneDeals = s.deals.filter((d) => klein(d.phase) !== "closed lost");
    const dealBetreffe = (d: DealZeile) => textJeDeal.get(d.sf_id) ?? [];
    const kaufangebot =
      s.cmKaufangebot ||
      s.cmStatus.some((x) => KAUFANGEBOT_STATUS.has(x)) ||
      offeneDeals.some(
        (d) =>
          (d.betrag ?? 0) > 0 ||
          (zahl(d.sf_daten?.Beurkundeter_Kaufpreis_in__c) ?? 0) > 0 ||
          DEAL_ABGESCHLOSSEN.has(klein(d.phase)),
      );
    const besichtigt = (d: DealZeile) => {
      const st = klein(d.sf_daten?.Besichtigungsstatus__c);
      const tag =
        typeof d.sf_daten?.Date_of_visit__c === "string"
          ? d.sf_daten.Date_of_visit__c.slice(0, 10)
          : null;
      return st === "stattgefunden" || (tag != null && tag <= heute);
    };
    const besichtigungGeplant = (d: DealZeile) => {
      const st = klein(d.sf_daten?.Besichtigungsstatus__c);
      const tag =
        typeof d.sf_daten?.Date_of_visit__c === "string"
          ? d.sf_daten.Date_of_visit__c.slice(0, 10)
          : null;
      return (
        (/vereinbart|geplant|terminiert/.test(st) && !/nicht/.test(st)) ||
        (tag != null && tag > heute) ||
        dealBetreffe(d).some((t) => BESICHTIGUNG_BETREFF.test(t))
      );
    };
    const hatInteresse =
      s.deals.length > 0 || s.cmStatus.some((x) => INTERESSE_STATUS.has(x));
    const abgesagt =
      s.deals.length > 0
        ? offeneDeals.length === 0
        : s.cmStatus.some((x) => ABSAGE_STATUS.has(x));
    const angeschrieben = s.cmStatus.some((x) => x && !GEPLANT_STATUS.has(x));

    let st: InteressentEinordnung["status"];
    if (abgesagt) st = hatInteresse ? "absageNachInteresse" : "absagen";
    else if (kaufangebot) st = "kaufangebot";
    else if (
      s.cmBesichtigt ||
      s.cmStatus.some((x) => BESICHTIGT_STATUS.has(x)) ||
      offeneDeals.some(besichtigt)
    )
      st = "pruefungNachBesichtigung";
    else if (
      s.cmStatus.some((x) => BESICHTIGUNG_STATUS.has(x)) ||
      offeneDeals.some(besichtigungGeplant)
    )
      st = "besichtigung";
    else if (hatInteresse) st = "erstesInteresse";
    else if (angeschrieben) st = "exposeInPruefung";
    else st = "vorgemerkt";

    const info = e.infos.get(s.id) ??
      [...s.kontakte].map((k) => e.infos.get(k)).find(Boolean) ?? {
        name: "Unbekannter Interessent",
      };
    const gruppe = kundengruppe(info);

    let grund: string | null = null;
    if (st === "absagen" || st === "absageNachInteresse") {
      const verlust = s.deals
        .map((d) => LOSS_REASON[klein(d.sf_daten?.Loss_Reason__c)])
        .find(Boolean);
      const texte = [
        ...[...s.kontakte].flatMap((k) => textJeKontakt.get(k) ?? []),
        ...s.deals.flatMap(dealBetreffe),
        ...s.deals.map((d) =>
          typeof d.sf_daten?.Description === "string"
            ? d.sf_daten.Description
            : "",
        ),
      ].join(" \n ");
      grund = verlust ?? absagegrundAusText(texte) ?? OHNE_ANGABE;
      gruende.set(grund, (gruende.get(grund) ?? 0) + 1);
    }

    if (st === "vorgemerkt") vorgemerkt += 1;
    else {
      status[st] += 1;
      kundengruppen[gruppe] += 1;
    }
    interessenten.push({
      id: s.id,
      name: info.firma || info.name,
      status: st,
      kundengruppe: gruppe,
      absagegrund: grund,
    });
  }

  const reihenfolge = [...ABSAGEGRUENDE, OHNE_ANGABE] as string[];
  const rang = (grund: string) => {
    const i = reihenfolge.indexOf(grund);
    return i < 0 ? reihenfolge.length : i;
  };
  return {
    objekttyp: e.objekttyp,
    objektanschrift: e.objektanschrift,
    ort: e.ort,
    auftraggeber: e.auftraggeber,
    vermarktungsbeginn: e.vermarktungsbeginn,
    status,
    vorgemerkt,
    kundengruppen,
    absagegruende: [...gruende.entries()]
      .map(([grund, anzahl]) => ({ grund, anzahl }))
      .sort((a, b) => rang(a.grund) - rang(b.grund) || b.anzahl - a.anzahl),
    interessenten: interessenten.sort(
      (a, b) =>
        STATUS_REIHENFOLGE.indexOf(a.status) -
          STATUS_REIHENFOLGE.indexOf(b.status) || a.name.localeCompare(b.name),
    ),
  };
}

const STATUS_REIHENFOLGE: InteressentEinordnung["status"][] = [
  "kaufangebot",
  "pruefungNachBesichtigung",
  "besichtigung",
  "erstesInteresse",
  "exposeInPruefung",
  "absageNachInteresse",
  "absagen",
  "vorgemerkt",
];

export function statusLabel(s: InteressentEinordnung["status"]): string {
  if (s === "vorgemerkt") return "Vorgemerkt (noch nicht angeschrieben)";
  return STATUS_STUFEN.find((x) => x.key === s)?.label ?? s;
}

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** „2026-02-14“ → „Februar 2026“ (wie in der Vorlage). */
export function monatJahr(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}/.test(iso)) return iso ?? "";
  return `${MONATE[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** „2026-10-25“ → „25. Oktober 2026“. */
export function datumLang(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso ?? "";
  return `${Number(iso.slice(8, 10))}. ${MONATE[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

export type Zeile = {
  label: string;
  wert: number;
  ausSalesforce: number | null;
};

/** Aufgelöster Bericht: Grundlage für Vorschau, PDF und PowerPoint. */
export type BerichtStand = {
  titel: string;
  objektbezeichnung: string;
  objektanschrift: string;
  objekttyp: string;
  auftraggeber: string;
  vermarktungsbeginn: string;
  berichtsdatum: string;
  angesprochen: number;
  status: (Zeile & { key: StatusSchluessel })[];
  kundengruppen: (Zeile & { key: KundengruppeSchluessel })[];
  absagegruende: Zeile[];
  absagenGesamt: number;
  herausforderungen: string[];
  weiteresVorgehen: string[];
  stempel: string | null;
};

function gesetzt(wert: string | undefined): wert is string {
  return typeof wert === "string" && wert.trim() !== "";
}

function nichtNegativ(n: unknown): number | undefined {
  const z = zahl(n);
  return z == null ? undefined : Math.max(0, Math.round(z));
}

/** Herausforderungen: eigene Punkte, sonst übernommenes Marktfeedback älterer Berichte. */
export function herausforderungenAus(texte: ReportTexte): string[] {
  if (texte.herausforderungen) return texte.herausforderungen;
  return (texte.marktfeedback ?? []).map((a) => a.text).filter(Boolean);
}

export function berichtStand(
  k: ReportKennzahlen,
  texte: ReportTexte,
  optionen: { freigegeben: boolean },
): BerichtStand {
  const v = k.vermarktung;
  const w = texte.werte ?? {};
  const typ = gesetzt(w.objekttyp) ? w.objekttyp : (v?.objekttyp ?? "");
  const anschrift = gesetzt(w.objektanschrift)
    ? w.objektanschrift
    : (v?.objektanschrift ??
      k.mandat.adresse ??
      k.mandat.objekt ??
      k.mandat.name);
  const strasseUndOrt = (() => {
    const teile = anschrift.split(",").map((t) => t.trim());
    const ort = (teile[1] ?? "").replace(/^\d{5}\s*/, "");
    return [teile[0], ort].filter(Boolean).join(", ");
  })();

  const status = STATUS_STUFEN.map((s) => {
    const sf = v ? v.status[s.key] : null;
    return {
      key: s.key,
      label: s.label,
      ausSalesforce: sf,
      wert: nichtNegativ(w.status?.[s.key]) ?? sf ?? 0,
    };
  });
  const kundengruppen = KUNDENGRUPPEN.map((g) => {
    const sf = v ? v.kundengruppen[g.key] : null;
    return {
      key: g.key,
      label: g.label,
      ausSalesforce: sf,
      wert: nichtNegativ(w.kundengruppen?.[g.key]) ?? sf ?? 0,
    };
  });
  const sfGruende = new Map(
    (v?.absagegruende ?? []).map((g) => [g.grund, g.anzahl]),
  );
  const absagegruende: Zeile[] = w.absagegruende
    ? w.absagegruende
        .filter((g) => g.grund.trim())
        .map((g) => ({
          label: g.grund.trim(),
          wert: nichtNegativ(g.anzahl) ?? 0,
          ausSalesforce: sfGruende.get(g.grund.trim()) ?? null,
        }))
    : (v?.absagegruende ?? []).map((g) => ({
        label: g.grund,
        wert: g.anzahl,
        ausSalesforce: g.anzahl,
      }));

  return {
    titel: gesetzt(w.titel) ? w.titel : "Vermarktungsbericht",
    objektbezeichnung: gesetzt(w.objektbezeichnung)
      ? w.objektbezeichnung
      : [typ, strasseUndOrt].filter(Boolean).join(" "),
    objektanschrift: anschrift,
    objekttyp: typ,
    auftraggeber: gesetzt(w.auftraggeber)
      ? w.auftraggeber
      : (v?.auftraggeber ?? ""),
    vermarktungsbeginn: gesetzt(w.vermarktungsbeginn)
      ? w.vermarktungsbeginn
      : monatJahr(v?.vermarktungsbeginn),
    berichtsdatum: datumLang(
      gesetzt(w.berichtsdatum) ? w.berichtsdatum : k.stand.slice(0, 10),
    ),
    angesprochen: status.reduce((s, x) => s + x.wert, 0),
    status,
    kundengruppen,
    absagegruende,
    absagenGesamt: absagegruende.reduce((s, x) => s + x.wert, 0),
    herausforderungen: herausforderungenAus(texte)
      .map((t) => t.trim())
      .filter(Boolean),
    weiteresVorgehen: (texte.naechsteSchritte ?? [])
      .map((t) => t.trim())
      .filter(Boolean),
    stempel: optionen.freigegeben ? null : "ENTWURF",
  };
}

/** Vorschlag „Weiteres Vorgehen“ nach dem Stand (wie in der Vorlage), beim Anlegen eingesetzt. */
export function standardVorgehen(
  status: Record<StatusSchluessel, number> | undefined,
): string[] {
  const punkte = ["Weitere Ansprache potenzieller Interessenten"];
  if (!status) return punkte;
  if (status.besichtigung + status.pruefungNachBesichtigung > 0)
    punkte.push("Besichtigungen nachfassen und Rückmeldungen einholen");
  if (status.erstesInteresse + status.kaufangebot > 0)
    punkte.push(
      "Verhandlung mit bestehenden Interessenten zum Abschluss bringen",
    );
  if (status.kaufangebot > 0) punkte.push("Kaufangebote optimieren");
  return punkte;
}

/** Tortenstück als SVG-Pfad (Mittelpunkt cx/cy, Radius r, Winkel im Uhrzeigersinn ab 12 Uhr). */
export function tortenPfad(
  cx: number,
  cy: number,
  r: number,
  start: number,
  ende: number,
): string {
  if (ende - start >= 0.9999)
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  const p = (anteil: number) => {
    const w = anteil * 2 * Math.PI - Math.PI / 2;
    return `${(cx + r * Math.cos(w)).toFixed(3)} ${(cy + r * Math.sin(w)).toFixed(3)}`;
  };
  const gross = ende - start > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${p(start)} A ${r} ${r} 0 ${gross} 1 ${p(ende)} Z`;
}

/** Stücke einer Torte: Anteil, Pfad und Farbe; leere Werte entfallen. */
export function tortenStuecke(
  werte: { label: string; wert: number }[],
  cx: number,
  cy: number,
  r: number,
  palette: readonly string[] = BERICHT_FARBEN.diagramm,
): {
  label: string;
  wert: number;
  anteil: number;
  pfad: string;
  farbe: string;
}[] {
  const summe = werte.reduce((s, w) => s + Math.max(0, w.wert), 0);
  if (!summe) return [];
  let start = 0;
  return werte.flatMap((w, i) => {
    if (w.wert <= 0) return [];
    const anteil = w.wert / summe;
    const pfad = tortenPfad(cx, cy, r, start, start + anteil);
    start += anteil;
    return [
      {
        label: w.label,
        wert: w.wert,
        anteil,
        pfad,
        farbe: palette[i % palette.length],
      },
    ];
  });
}
