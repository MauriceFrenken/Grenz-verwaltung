/**
 * Kennzahlen für Grenz & Co. aus Bankbuchungen und Kontosalden.
 * Reine Funktionen, damit sie ohne Datenbank testbar bleiben.
 */

import {
  EINNAHME_KATEGORIEN,
  KATEGORIE_LABEL,
  UST_SATZ,
  ustZeitraumEnde,
  zerlege,
  type Kategorie,
} from "./kategorien";
import type { KennzahlenDto } from "./types";

/** Dateiname-Präfix der Auszüge, die aus Kontoauszug-PDFs übernommen wurden. */
export const PDF_IMPORT_PRAEFIX = "PDF-Import";

export type RohBuchung = {
  kontoIban: string;
  buchungsdatum: string;
  betrag: number;
  gegenkontoIban: string | null;
  auftraggeberName: string | null;
  verwendungszweck: string | null;
  /** true = stammt aus einem PDF-Import, nicht aus EBICS. */
  ausPdfImport: boolean;
};

export type RohKonto = {
  iban: string;
  bezeichnung: string | null;
  saldo: number | null;
  saldoStichtag: string | null;
};

/**
 * PDF-Importe und EBICS überschneiden sich: Je Konto zählen PDF-Buchungen nur
 * vor dem ersten EBICS-Buchungstag, danach gilt EBICS.
 */
export function ohneDoppelte(buchungen: RohBuchung[]): RohBuchung[] {
  const ersterEbicsTag = new Map<string, string>();
  for (const b of buchungen) {
    if (b.ausPdfImport) continue;
    const bisher = ersterEbicsTag.get(b.kontoIban);
    if (!bisher || b.buchungsdatum < bisher) {
      ersterEbicsTag.set(b.kontoIban, b.buchungsdatum);
    }
  }
  return buchungen.filter((b) => {
    if (!b.ausPdfImport) return true;
    const grenze = ersterEbicsTag.get(b.kontoIban);
    return !grenze || b.buchungsdatum < grenze;
  });
}

/** Anteil einer Buchung nach Zerlegung, mit Nettobetrag (USt herausgerechnet). */
type Anteil = {
  b: RohBuchung;
  kategorie: Kategorie;
  brutto: number;
  netto: number;
  /** Empfänger/Zahler für Fixkosten und Rankings. */
  name: string;
};

function anteile(b: RohBuchung, eigene: ReadonlySet<string>): Anteil[] {
  const name = (b.auftraggeberName ?? "Unbekannt").trim();
  return zerlege(b, eigene).map((t) => ({
    b,
    kategorie: t.kategorie,
    brutto: t.betrag,
    netto: t.betrag / (1 + UST_SATZ[t.kategorie]),
    name:
      t.kategorie === "personal" && /steuerverwaltung|finanzamt/i.test(name)
        ? "Lohnsteuer (Finanzamt)"
        : name,
  }));
}

/** true = zählt weder als Einnahme noch als Ausgabe. */
function neutral(k: Kategorie): boolean {
  return k === "intern" || k === "umsatzsteuer";
}

function istEinnahme(a: Anteil): boolean {
  return EINNAHME_KATEGORIEN.has(a.kategorie) || a.brutto > 0;
}

/** „2026-10“ + n Monate. */
function monatPlus(monat: string, n: number): string {
  const j = Number(monat.slice(0, 4));
  const m = Number(monat.slice(5, 7)) - 1 + n;
  const jahr = j + Math.floor(m / 12);
  return `${jahr}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}`;
}

/**
 * Runway: Wie lange reicht die Liquidität (ohne noch abzuführende USt) bei den
 * aktuellen Fixkosten? Unabhängig vom gewählten Jahr, immer ab heute.
 */
export function berechneRunway(input: {
  heute: string;
  liquiditaet: number;
  eigene: ReadonlySet<string>;
  buchungen: RohBuchung[];
}): KennzahlenDto["runway"] {
  const { heute, liquiditaet, eigene } = input;
  const dieserMonat = heute.slice(0, 7);
  const start12 = monatPlus(dieserMonat, -12);
  const start3 = monatPlus(dieserMonat, -3);
  const alle = ohneDoppelte(input.buchungen)
    .filter((b) => b.buchungsdatum <= heute)
    .flatMap((b) => anteile(b, eigene));

  // Bis wann ist die USt abgerechnet? Danach angefallene USt ist noch offen.
  let ustBis: string | null = null;
  for (const a of alle) {
    if (a.kategorie !== "umsatzsteuer") continue;
    const ende = ustZeitraumEnde(a.b.verwendungszweck);
    if (ende && (!ustBis || ende > ustBis)) ustBis = ende;
  }
  const ustOffenAb = ustBis ? monatPlus(ustBis, 1) : monatPlus(dieserMonat, -1);
  const offeneUst = alle
    .filter((a) => a.b.buchungsdatum.slice(0, 7) >= ustOffenAb)
    .reduce((s, a) => s + (a.brutto - a.netto), 0);

  // Wiederkehrende Empfänger: in mind. 3 der letzten 12 Monate bezahlt.
  const empfaenger = new Map<
    string,
    {
      monate: Set<string>;
      summe12: number;
      summe3: number;
      kategorie: Kategorie;
    }
  >();
  let ausgaben12 = 0;
  let ertragsteuern12 = 0;
  let ersterMonat: string | null = null;
  for (const a of alle) {
    const monat = a.b.buchungsdatum.slice(0, 7);
    if (!ersterMonat || monat < ersterMonat) ersterMonat = monat;
    if (monat < start12 || monat >= dieserMonat) continue;
    if (neutral(a.kategorie) || istEinnahme(a)) continue;
    if (a.kategorie === "steuern") {
      ertragsteuern12 += -a.netto;
      continue;
    }
    ausgaben12 += -a.netto;
    const e = empfaenger.get(a.name) ?? {
      monate: new Set<string>(),
      summe12: 0,
      summe3: 0,
      kategorie: a.kategorie,
    };
    e.monate.add(monat);
    e.summe12 += -a.netto;
    if (monat >= start3) e.summe3 += -a.netto;
    empfaenger.set(a.name, e);
  }
  const fix = [...empfaenger.entries()].filter(([, e]) => e.monate.size >= 3);
  const fixProMonat = fix.reduce((s, [, e]) => s + e.summe3, 0) / 3;
  const monate12 = Math.max(
    1,
    Math.min(
      12,
      ersterMonat
        ? (Number(dieserMonat.slice(0, 4)) - Number(ersterMonat.slice(0, 4))) *
            12 +
            Number(dieserMonat.slice(5, 7)) -
            Number(ersterMonat.slice(5, 7))
        : 12,
    ),
  );
  const fix12 = fix.reduce((s, [, e]) => s + e.summe12, 0);
  const variabelProMonat = Math.max(0, (ausgaben12 - fix12) / monate12);

  const netto = liquiditaet - offeneUst;
  const monate = fixProMonat > 0 ? Math.max(0, netto / fixProMonat) : null;
  const horizont =
    monate === null ? 12 : Math.min(60, Math.max(12, Math.ceil(monate) + 3));
  const verlauf = Array.from({ length: horizont + 1 }, (_, k) => ({
    monat: monatPlus(dieserMonat, k),
    nurFix: runde(Math.max(0, netto - k * fixProMonat)),
    mitVariabel: runde(
      Math.max(0, netto - k * (fixProMonat + variabelProMonat)),
    ),
  }));

  return {
    kontostand: runde(liquiditaet),
    offeneUst: runde(offeneUst),
    ustOffenAb,
    liquiditaetNetto: runde(netto),
    fixProMonat: runde(fixProMonat),
    variabelProMonat: runde(variabelProMonat),
    ertragsteuern12Monate: runde(ertragsteuern12),
    monate: monate === null ? null : runde(monate),
    monateMitVariabel:
      fixProMonat + variabelProMonat > 0
        ? runde(Math.max(0, netto / (fixProMonat + variabelProMonat)))
        : null,
    reichtBis:
      monate === null ? null : monatPlus(dieserMonat, Math.floor(monate)),
    posten: fix
      .map(([name, e]) => ({
        name,
        kategorie: KATEGORIE_LABEL[e.kategorie],
        proMonat: runde(e.summe3 / 3),
      }))
      .filter((p) => p.proMonat > 0)
      .sort((a, b) => b.proMonat - a.proMonat),
    verlauf,
  };
}

function runde(n: number): number {
  return Math.round(n * 100) / 100;
}

function provisionObjekt(zweck: string | null): string | null {
  if (!zweck) return null;
  const m = zweck.match(/(?:objekt|provision)\s+(.+)$/i);
  return m ? m[1].trim() : zweck.trim();
}

export function berechneKennzahlen(input: {
  jahr: number;
  /** Stichtag für „bis heute“ (ISO-Datum), begrenzt die Monatsanzahl. */
  heute: string;
  konten: RohKonto[];
  buchungen: RohBuchung[];
}): KennzahlenDto {
  const { jahr, heute } = input;
  const eigene = new Set(input.konten.map((k) => k.iban));
  const imJahr = ohneDoppelte(input.buchungen).filter((b) =>
    b.buchungsdatum.startsWith(`${jahr}-`),
  );

  const monate = Array.from({ length: 12 }, (_, i) => ({
    monat: `${jahr}-${String(i + 1).padStart(2, "0")}`,
    einnahmen: 0,
    ausgaben: 0,
    provisionen: 0,
  }));

  const jeKategorie = new Map<Kategorie, number>();
  const jeEmpfaenger = new Map<
    string,
    { betrag: number; kategorie: Kategorie; monate: Set<string> }
  >();
  const kategorieJeMonat = new Map<string, Map<Kategorie, number>>();
  const provisionen: KennzahlenDto["provisionen"] = [];
  let steuern = 0;

  let ustSaldo = 0;

  for (const a of imJahr.flatMap((b) => anteile(b, eigene))) {
    const { b, kategorie } = a;
    if (kategorie === "umsatzsteuer") ustSaldo += -a.brutto;
    if (neutral(kategorie)) continue;
    const m = monate[Number(b.buchungsdatum.slice(5, 7)) - 1];
    jeKategorie.set(kategorie, (jeKategorie.get(kategorie) ?? 0) + a.netto);

    if (istEinnahme(a)) {
      m.einnahmen += a.netto;
    } else {
      m.ausgaben += -a.netto;
      const e = jeEmpfaenger.get(a.name) ?? {
        betrag: 0,
        kategorie,
        monate: new Set<string>(),
      };
      e.betrag += -a.netto;
      e.monate.add(m.monat);
      jeEmpfaenger.set(a.name, e);
      const km = kategorieJeMonat.get(m.monat) ?? new Map<Kategorie, number>();
      km.set(kategorie, (km.get(kategorie) ?? 0) - a.netto);
      kategorieJeMonat.set(m.monat, km);
    }
    if (kategorie === "steuern") steuern += -a.netto;
    if (kategorie === "provision") {
      m.provisionen += a.netto;
      provisionen.push({
        datum: b.buchungsdatum,
        zahler: (b.auftraggeberName ?? "").trim(),
        objekt: provisionObjekt(b.verwendungszweck),
        brutto: runde(a.brutto),
        netto: runde(a.netto),
      });
    }
  }

  const einnahmen = monate.reduce((s, m) => s + m.einnahmen, 0);
  const ausgaben = monate.reduce((s, m) => s + m.ausgaben, 0);
  const provisionBrutto = provisionen.reduce((s, p) => s + p.brutto, 0);

  const aktuellesJahr = Number(heute.slice(0, 4));
  const monateBisher =
    jahr < aktuellesJahr
      ? 12
      : jahr > aktuellesJahr
        ? 0
        : Number(heute.slice(5, 7));
  const ausgabenOhneSteuern = ausgaben - steuern;

  const liquiditaet = input.konten.reduce((s, k) => s + (k.saldo ?? 0), 0);
  const kostenProMonat =
    monateBisher > 0 ? ausgabenOhneSteuern / monateBisher : 0;
  const runway = berechneRunway({
    heute,
    liquiditaet,
    eigene,
    buchungen: input.buchungen,
  });

  // Liquiditätsverlauf: vom aktuellen Saldo rückwärts über alle Buchungen.
  let laufend = liquiditaet;
  const saldoMonatsende = new Map<string, number>();
  const allesSortiert = ohneDoppelte(input.buchungen)
    .filter((b) => b.buchungsdatum <= heute)
    .sort((a, b) => b.buchungsdatum.localeCompare(a.buchungsdatum));
  const monatsEnden = monate.map((m) => m.monat).reverse();
  let i = 0;
  for (const monat of monatsEnden) {
    if (monat > heute.slice(0, 7)) continue;
    while (
      i < allesSortiert.length &&
      allesSortiert[i].buchungsdatum.slice(0, 7) > monat
    ) {
      laufend -= allesSortiert[i].betrag;
      i++;
    }
    saldoMonatsende.set(monat, runde(laufend));
  }

  // Größte Ausgabenkategorien je Monat, der Rest wird „Sonstiges“.
  const TOP_KATEGORIEN = 4;
  const topKategorien = [...jeKategorie.entries()]
    .filter(([k, v]) => !EINNAHME_KATEGORIEN.has(k) && v < 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, TOP_KATEGORIEN)
    .map(([k]) => k);
  const monateMitDaten = monate.filter(
    (m) => m.monat <= heute.slice(0, 7) && (m.ausgaben || m.einnahmen),
  );
  const kategorienMonat: KennzahlenDto["kategorienMonat"] = {
    kategorien: [
      ...topKategorien.map((k) => ({
        schluessel: k,
        label: KATEGORIE_LABEL[k],
      })),
      { schluessel: "rest", label: "Übrige" },
    ],
    monate: monateMitDaten.map((m) => {
      const km = kategorieJeMonat.get(m.monat) ?? new Map<Kategorie, number>();
      const zeile: { monat: string } & Record<string, number | string> = {
        monat: m.monat,
      };
      let rest = 0;
      for (const [k, v] of km) {
        if (topKategorien.includes(k)) zeile[k] = runde(v);
        else rest += v;
      }
      for (const k of topKategorien) zeile[k] ??= 0;
      zeile.rest = runde(rest);
      return zeile;
    }),
  };

  // Fixkosten: Empfänger, die in mindestens drei Monaten bezahlt wurden.
  const fixPosten = [...jeEmpfaenger.entries()]
    .filter(([, e]) => e.monate.size >= 3 && e.kategorie !== "steuern")
    .map(([name, e]) => ({
      name,
      kategorie: KATEGORIE_LABEL[e.kategorie],
      monate: e.monate.size,
      summe: runde(e.betrag),
      proMonat: runde(e.betrag / Math.max(1, monateBisher)),
    }))
    .sort((a, b) => b.summe - a.summe);
  const fixSumme = fixPosten.reduce((s, p) => s + p.summe, 0);

  let provKum = 0;
  let ausgKum = 0;
  const kumuliert = monateMitDaten.map((m) => {
    provKum += m.provisionen;
    ausgKum += m.ausgaben;
    return {
      monat: m.monat,
      provisionen: runde(provKum),
      ausgaben: runde(ausgKum),
    };
  });

  const jeZahler = new Map<string, { anzahl: number; netto: number }>();
  for (const p of provisionen) {
    const z = jeZahler.get(p.zahler || "Unbekannt") ?? { anzahl: 0, netto: 0 };
    z.anzahl++;
    z.netto += p.netto;
    jeZahler.set(p.zahler || "Unbekannt", z);
  }

  return {
    jahr,
    stand: heute,
    runway,
    ustSaldo: runde(ustSaldo),
    kategorienMonat,
    fixkosten: {
      fixSumme: runde(fixSumme),
      variabelSumme: runde(ausgabenOhneSteuern - fixSumme),
      fixProMonat: runde(fixSumme / Math.max(1, monateBisher)),
      posten: fixPosten.slice(0, 12),
    },
    kumuliert,
    provisionsZahler: [...jeZahler.entries()]
      .map(([name, z]) => ({ name, anzahl: z.anzahl, netto: runde(z.netto) }))
      .sort((a, b) => b.netto - a.netto),
    konten: input.konten.map((k) => ({
      iban: k.iban,
      bezeichnung: k.bezeichnung,
      saldo: k.saldo,
      saldoStichtag: k.saldoStichtag,
    })),
    liquiditaet: runde(liquiditaet),
    einnahmen: runde(einnahmen),
    ausgaben: runde(ausgaben),
    ergebnis: runde(einnahmen - ausgaben),
    steuern: runde(steuern),
    ausgabenOhneSteuern: runde(ausgabenOhneSteuern),
    provisionBrutto: runde(provisionBrutto),
    provisionNetto: runde(provisionen.reduce((s, p) => s + p.netto, 0)),
    anzahlProvisionen: provisionen.length,
    monateBisher,
    kostenProMonat: runde(kostenProMonat),
    reichweiteMonate: runway.monate,
    monate: monate.map((m) => ({
      monat: m.monat,
      einnahmen: runde(m.einnahmen),
      ausgaben: runde(m.ausgaben),
      provisionen: runde(m.provisionen),
      saldo: saldoMonatsende.get(m.monat) ?? null,
    })),
    kategorien: [...jeKategorie.entries()]
      .filter(([k]) => !EINNAHME_KATEGORIEN.has(k))
      .map(([kategorie, betrag]) => ({
        kategorie,
        label: KATEGORIE_LABEL[kategorie],
        betrag: runde(-betrag),
      }))
      .filter((k) => k.betrag > 0)
      .sort((a, b) => b.betrag - a.betrag),
    topEmpfaenger: [...jeEmpfaenger.entries()]
      .map(([name, e]) => ({
        name,
        kategorie: KATEGORIE_LABEL[e.kategorie],
        betrag: runde(e.betrag),
      }))
      .sort((a, b) => b.betrag - a.betrag)
      .slice(0, 10),
    provisionen: provisionen.sort((a, b) => b.datum.localeCompare(a.datum)),
  };
}
