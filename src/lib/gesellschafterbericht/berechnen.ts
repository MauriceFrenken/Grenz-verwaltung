/**
 * Gesellschafterbericht: Entwurf aus den Daten der App, Aufbau und Prüfung des Inhalts.
 * Reine Funktionen, getestet in berechnen.test.ts. Es wird nichts geschätzt: Was sich nicht
 * sauber ableiten lässt, bleibt null und wird im Formular manuell eingetragen.
 */

import { istTest } from "@/lib/uebersicht/berechnen";

import {
  BERICHT_ABSENDER,
  BERICHT_VERSION,
  HAUPTWERTE,
  KOMMENTAR_MAX,
  MAKLER_KENNZAHLEN,
  type BerichtArt,
  type BerichtFormular,
  type BerichtInhalt,
  type Entwurf,
  type EntwurfWert,
  type Feldname,
} from "./typen";

const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;
const USt_FAKTOR = 1.19;

export function istPeriode(wert: unknown): wert is string {
  return typeof wert === "string" && PERIODE.test(wert);
}

/** „2026-10-27“ → „2026-09“. */
export function vormonat(heute: string): string {
  const j = Number(heute.slice(0, 4));
  const m = Number(heute.slice(5, 7));
  return m === 1 ? `${j - 1}-12` : `${j}-${String(m - 1).padStart(2, "0")}`;
}

/** Monat verschieben, z. B. („2026-01“, -1) → „2025-12“. */
export function monatPlus(periode: string, n: number): string {
  const index = Number(periode.slice(0, 4)) * 12 + Number(periode.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Erster und letzter Tag des Monats (ISO-Datum). */
export function monatsgrenzen(periode: string): { start: string; ende: string } {
  const j = Number(periode.slice(0, 4));
  const m = Number(periode.slice(5, 7));
  const letzter = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return {
    start: `${periode}-01`,
    ende: `${periode}-${String(letzter).padStart(2, "0")}`,
  };
}

function runde(n: number, stellen = 2): number {
  const f = 10 ** stellen;
  return Math.round(n * f) / f;
}

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
function euro(n: number): string {
  return EUR.format(n);
}
function datumDe(iso: string): string {
  return iso.slice(0, 10).split("-").reverse().join(".");
}

// --- Eingabe des Entwurfs -----------------------------------------------------

export type FinanzMonat = {
  einnahmen: number;
  ausgaben: number;
  /** Provisionseingänge brutto. */
  provisionen: number;
  /** Gesamtsaldo am Monatsende, rückgerechnet (null = nicht rechenbar). */
  saldo: number | null;
};

export type EntwurfEingabe = {
  periode: string;
  art: BerichtArt;
  /** Heutiges Datum (ISO). */
  heute: string;
  /** Bankdaten aus den Kennzahlen (null = keine Konten oder Fehler). */
  finanzen: {
    monat: FinanzMonat | null;
    kontenMitSaldo: number;
    /** Jüngster Saldostichtag aller Konten. */
    saldoStichtag: string | null;
  } | null;
  /** Monatswerte aus `unternehmenszahlen` (BWA, DATEV, manuell), genau dieser Monat. */
  unternehmenszahlen: Array<{
    quelle: string;
    kennzahl: string;
    betrag: number;
    dokumentRef: string | null;
  }>;
  /** Personalakten (null = Personalbereich nicht verfügbar). */
  personal: Array<{
    eintrittAm: string | null;
    austrittAm: string | null;
    vertragsart: string | null;
  }> | null;
  mandate: Array<{
    name: string;
    status: string | null;
    angebotspreis: number | null;
    beauftragtAm: string | null;
  }>;
  deals: Array<{
    name: string;
    gewonnen: boolean;
    abschlussAm: string | null;
    /** Provision_in__c (netto). */
    provision: number | null;
    /** Beurkundeter Kaufpreis, sonst Betrag. */
    kaufpreis: number | null;
  }>;
  /** Letzter Salesforce-Abruf (ISO), null = nie. */
  salesforceStand: string | null;
};

function leer(quelle: string): EntwurfWert {
  return { wert: null, quelle, automatisch: false };
}
function auto(wert: number, quelle: string): EntwurfWert {
  return { wert, quelle, automatisch: true };
}

/** Reihenfolge, in der Monatswerte aus `unternehmenszahlen` gelten. */
const QUELLE_RANG: Record<string, number> = {
  bwa: 0,
  datev: 1,
  manuell: 2,
  jahresabschluss: 3,
};
const QUELLE_LABEL: Record<string, string> = {
  bwa: "BWA",
  datev: "DATEV",
  manuell: "Unternehmenszahlen (manuell)",
  jahresabschluss: "Jahresabschluss",
};

function ausUnternehmenszahlen(
  e: EntwurfEingabe,
  kennzahl: string,
): EntwurfWert | null {
  const treffer = e.unternehmenszahlen
    .filter((u) => u.kennzahl === kennzahl && Number.isFinite(u.betrag))
    .sort((a, b) => (QUELLE_RANG[a.quelle] ?? 9) - (QUELLE_RANG[b.quelle] ?? 9))[0];
  if (!treffer) return null;
  const label = QUELLE_LABEL[treffer.quelle] ?? treffer.quelle;
  return auto(
    runde(treffer.betrag),
    `${label}${treffer.dokumentRef ? ` (${treffer.dokumentRef})` : ""}, Monatswert`,
  );
}

export function entwurfBerechnen(e: EntwurfEingabe): Entwurf {
  const werte = {} as Record<Feldname, EntwurfWert>;

  if (e.art === "plan") {
    for (const f of [...HAUPTWERTE, ...MAKLER_KENNZAHLEN])
      werte[f] = leer("Planwert, bitte manuell eintragen");
    return { periode: e.periode, art: e.art, werte };
  }

  const { ende } = monatsgrenzen(e.periode);
  const fm = e.finanzen?.monat ?? null;
  const bankMonat = fm && (fm.einnahmen > 0 || fm.ausgaben > 0) ? fm : null;

  // Umsatz: Monatswert aus der BWA, sonst Provisionseingänge laut Bank (netto).
  werte.umsatz =
    ausUnternehmenszahlen(e, "umsatz") ??
    (bankMonat
      ? auto(
          runde(bankMonat.provisionen / USt_FAKTOR),
          `Bankumsätze: Provisionseingänge im Monat ${euro(bankMonat.provisionen)} brutto, ohne 19 % USt (Zahlungseingang, nicht periodengerecht)`,
        )
      : leer(
          e.finanzen
            ? "Keine Bankumsätze für diesen Monat, bitte manuell eintragen"
            : "Keine Bankkonten hinterlegt, bitte manuell eintragen",
        ));

  werte.rohertrag =
    ausUnternehmenszahlen(e, "rohertrag") ??
    leer("Kein Monatswert aus BWA, bitte manuell eintragen");
  werte.ebitda =
    ausUnternehmenszahlen(e, "ebitda") ??
    leer("Kein Monatswert aus BWA, bitte manuell eintragen");
  werte.ergebnis =
    ausUnternehmenszahlen(e, "ergebnis") ??
    leer(
      bankMonat
        ? `Kein Monatswert aus BWA. Zur Orientierung: Zahlungsüberschuss laut Bank ${euro(bankMonat.einnahmen - bankMonat.ausgaben)} (inkl. USt und Steuern, kein Ergebnis)`
        : "Kein Monatswert aus BWA, bitte manuell eintragen",
    );

  // Liquidität: Kontosalden, über die Buchungen auf das Monatsende zurückgerechnet.
  werte.liquiditaet =
    e.finanzen && e.finanzen.kontenMitSaldo > 0 && fm && fm.saldo !== null
      ? auto(
          runde(fm.saldo),
          `Bank: Saldo aller Konten${e.finanzen.saldoStichtag ? ` zum ${datumDe(e.finanzen.saldoStichtag)}` : ""}, über die Bankbuchungen auf den ${datumDe(ende)} zurückgerechnet`,
        )
      : leer(
          e.finanzen && e.finanzen.kontenMitSaldo > 0
            ? "Monatsendsaldo nicht rechenbar, bitte manuell eintragen"
            : "Keine Kontosalden vorhanden, bitte manuell eintragen",
        );

  // Mitarbeiter: Personalakten, die am Monatsende beschäftigt waren (ohne freie Mitarbeit).
  if (!e.personal) {
    werte.mitarbeiter = leer("Personalbereich nicht verfügbar, bitte manuell eintragen");
  } else if (e.personal.length === 0) {
    werte.mitarbeiter = leer("Keine Personalakten angelegt, bitte manuell eintragen");
  } else {
    const beschaeftigt = e.personal.filter(
      (p) =>
        p.vertragsart !== "freie_mitarbeit" &&
        (!p.eintrittAm || p.eintrittAm.slice(0, 10) <= ende) &&
        (!p.austrittAm || p.austrittAm.slice(0, 10) >= ende),
    );
    const ohneEintritt = beschaeftigt.filter((p) => !p.eintrittAm).length;
    werte.mitarbeiter = auto(
      beschaeftigt.length,
      `Personal: Akten mit Eintritt bis ${datumDe(ende)} und ohne früheren Austritt, ohne freie Mitarbeit` +
        (ohneEintritt ? `; ${ohneEintritt} ohne Eintrittsdatum mitgezählt` : ""),
    );
  }

  // Maklerkennzahlen aus dem Salesforce-Abruf.
  const mandate = e.mandate.filter((m) => !istTest(m.name));
  const deals = e.deals.filter((d) => !istTest(d.name));
  const sfStand = e.salesforceStand
    ? `Stand Abruf ${datumDe(e.salesforceStand)}`
    : "ohne Abrufdatum";
  const sfLeer = mandate.length === 0 && deals.length === 0;

  // Salesforce kennt nur den aktuellen Status: Stichtagswerte nur für den Vormonat
  // oder den laufenden Monat, ältere Monate lassen sich nicht zurückrechnen.
  const stichtagMoeglich = e.periode >= vormonat(e.heute);
  if (sfLeer) {
    werte.mandate = leer("Keine Salesforce-Daten, bitte manuell eintragen");
    werte.pipeline = leer("Keine Salesforce-Daten, bitte manuell eintragen");
  } else if (!stichtagMoeglich) {
    const grund =
      "Salesforce zeigt nur den aktuellen Status, für ältere Monate bitte manuell eintragen";
    werte.mandate = leer(grund);
    werte.pipeline = leer(grund);
  } else {
    const aktiv = mandate.filter(
      (m) =>
        m.status === "Beauftragung" &&
        (!m.beauftragtAm || m.beauftragtAm.slice(0, 10) <= ende),
    );
    const ohnePreis = aktiv.filter((m) => !m.angebotspreis).length;
    werte.mandate = auto(
      aktiv.length,
      `Salesforce: Mandate in Phase Beauftragung, beauftragt bis ${datumDe(ende)} (${sfStand}; spätere Statuswechsel nicht rückrechenbar)`,
    );
    werte.pipeline = auto(
      runde(aktiv.reduce((s, m) => s + (m.angebotspreis ?? 0), 0)),
      `Salesforce: Summe der Exposé-Preise dieser Mandate (${sfStand})` +
        (ohnePreis ? `; ${ohnePreis} ohne Preis nicht enthalten` : ""),
    );
  }

  const abschluesse = deals.filter(
    (d) => d.gewonnen && (d.abschlussAm ?? "").slice(0, 7) === e.periode,
  );
  if (sfLeer) {
    werte.abschluesse = leer("Keine Salesforce-Daten, bitte manuell eintragen");
    werte.provisionsquote = leer("Keine Salesforce-Daten, bitte manuell eintragen");
  } else {
    werte.abschluesse = auto(
      abschluesse.length,
      `Salesforce: gewonnene Deals mit Abschlussdatum im Monat (${sfStand})`,
    );
    const mitQuote = abschluesse.filter(
      (d) => (d.provision ?? 0) > 0 && (d.kaufpreis ?? 0) > 0,
    );
    const provision = mitQuote.reduce((s, d) => s + (d.provision ?? 0), 0);
    const kaufpreis = mitQuote.reduce((s, d) => s + (d.kaufpreis ?? 0), 0);
    werte.provisionsquote =
      kaufpreis > 0
        ? auto(
            runde((provision / kaufpreis) * 100),
            `Salesforce: Provision netto ÷ beurkundeter Kaufpreis der ${mitQuote.length} ${mitQuote.length === 1 ? "Abschluss" : "Abschlüsse"} mit beiden Angaben`,
          )
        : leer(
            abschluesse.length
              ? "Abschlüsse ohne Provision oder Kaufpreis in Salesforce, bitte manuell eintragen"
              : "Keine Abschlüsse im Monat",
          );
  }

  werte.forderungen = leer(
    "Offene Provisionsrechnungen werden in der App nicht geführt, bitte manuell eintragen",
  );

  return { periode: e.periode, art: e.art, werte };
}

// --- Inhalt aufbauen und prüfen ----------------------------------------------

function zahlOderNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Formular plus Freigabe → exakter Inhalt laut Schnittstelle. */
export function inhaltBauen(
  f: BerichtFormular,
  freigabe: { von: string; am: string },
): BerichtInhalt {
  const w = (k: Feldname) => zahlOderNull(f.werte[k]);
  return {
    version: BERICHT_VERSION,
    periode: f.periode,
    art: f.art,
    umsatz: w("umsatz"),
    rohertrag: w("rohertrag"),
    ebitda: w("ebitda"),
    ergebnis: w("ergebnis"),
    liquiditaet: w("liquiditaet"),
    mitarbeiter: w("mitarbeiter"),
    kennzahlen: {
      mandate: w("mandate"),
      pipeline: w("pipeline"),
      abschluesse: w("abschluesse"),
      provisionsquote: w("provisionsquote"),
      forderungen: w("forderungen"),
    },
    kommentar: f.kommentar.trim(),
    freigegeben_von: freigabe.von,
    freigegeben_am: freigabe.am,
    absender: BERICHT_ABSENDER,
  };
}

const ERLAUBTE_FELDER = new Set([
  "version",
  "periode",
  "art",
  ...HAUPTWERTE,
  "kennzahlen",
  "kommentar",
  "freigegeben_von",
  "freigegeben_am",
  "absender",
]);
const ERLAUBTE_KENNZAHLEN = new Set<string>(MAKLER_KENNZAHLEN);
const ISO_ZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Prüft einen Inhalt wie die Schnittstelle der FRENKEN-App, damit Fehler schon vor dem
 * Senden auffallen. Liefert alle Fehler auf einmal.
 */
export function inhaltPruefen(roh: unknown, heute: string): string[] {
  const fehler: string[] = [];
  if (!roh || typeof roh !== "object" || Array.isArray(roh))
    return ["Inhalt ist kein Objekt."];
  const d = roh as Record<string, unknown>;

  for (const k of Object.keys(d))
    if (!ERLAUBTE_FELDER.has(k)) fehler.push(`Unbekanntes Feld „${k}“.`);
  if (d.version !== BERICHT_VERSION) fehler.push("version muss 1 sein.");
  if (d.art !== "ist" && d.art !== "plan") fehler.push("art muss „ist“ oder „plan“ sein.");
  const periode = d.periode;
  if (!istPeriode(periode)) fehler.push("periode muss das Format JJJJ-MM haben.");
  else if (d.art === "ist" && periode > heute.slice(0, 7))
    fehler.push("periode darf bei „ist“ nicht in der Zukunft liegen.");

  for (const k of HAUPTWERTE) {
    const v = d[k];
    if (v !== undefined && v !== null && (typeof v !== "number" || !Number.isFinite(v)))
      fehler.push(`${k} muss eine Zahl oder null sein.`);
  }
  const mitarbeiter = d.mitarbeiter;
  if (typeof mitarbeiter === "number" && (mitarbeiter < 0 || !Number.isInteger(mitarbeiter)))
    fehler.push("mitarbeiter muss eine ganze Zahl ab 0 sein.");

  if (d.kennzahlen !== undefined && d.kennzahlen !== null) {
    if (typeof d.kennzahlen !== "object" || Array.isArray(d.kennzahlen)) {
      fehler.push("kennzahlen muss ein Objekt sein.");
    } else {
      for (const [k, v] of Object.entries(d.kennzahlen as Record<string, unknown>)) {
        if (!ERLAUBTE_KENNZAHLEN.has(k)) fehler.push(`Unbekannte Kennzahl „${k}“.`);
        else if (v !== null && (typeof v !== "number" || !Number.isFinite(v)))
          fehler.push(`kennzahlen.${k} muss eine Zahl oder null sein.`);
      }
    }
  }

  const kommentar = d.kommentar;
  if (kommentar !== undefined && kommentar !== null) {
    if (typeof kommentar !== "string") fehler.push("kommentar muss Text sein.");
    else if (kommentar.length > KOMMENTAR_MAX)
      fehler.push(`kommentar darf höchstens ${KOMMENTAR_MAX} Zeichen haben.`);
  }
  const von = d.freigegeben_von;
  if (typeof von !== "string" || !von.trim())
    fehler.push("freigegeben_von fehlt.");
  const am = d.freigegeben_am;
  if (typeof am !== "string" || !ISO_ZEIT.test(am) || Number.isNaN(Date.parse(am)))
    fehler.push("freigegeben_am muss ein Zeitpunkt nach ISO 8601 sein.");
  if (d.absender !== BERICHT_ABSENDER) fehler.push(`absender muss „${BERICHT_ABSENDER}“ sein.`);
  return fehler;
}
