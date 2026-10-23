/**
 * Kennzahlen für Grenz & Co. aus Bankbuchungen und Kontosalden.
 * Reine Funktionen, damit sie ohne Datenbank testbar bleiben.
 */

import {
  EINNAHME_KATEGORIEN,
  KATEGORIE_LABEL,
  kategorisiere,
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

const USt_FAKTOR = 1.19;

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

  for (const b of imJahr) {
    const kategorie = kategorisiere(b, eigene);
    if (kategorie === "intern") continue;
    const m = monate[Number(b.buchungsdatum.slice(5, 7)) - 1];
    jeKategorie.set(kategorie, (jeKategorie.get(kategorie) ?? 0) + b.betrag);

    if (EINNAHME_KATEGORIEN.has(kategorie) || b.betrag > 0) {
      m.einnahmen += b.betrag;
    } else {
      m.ausgaben += -b.betrag;
      const name = (b.auftraggeberName ?? "Unbekannt").trim();
      const e = jeEmpfaenger.get(name) ?? {
        betrag: 0,
        kategorie,
        monate: new Set<string>(),
      };
      e.betrag += -b.betrag;
      e.monate.add(m.monat);
      jeEmpfaenger.set(name, e);
      const km = kategorieJeMonat.get(m.monat) ?? new Map<Kategorie, number>();
      km.set(kategorie, (km.get(kategorie) ?? 0) - b.betrag);
      kategorieJeMonat.set(m.monat, km);
    }
    if (kategorie === "steuern") steuern += -b.betrag;
    if (kategorie === "provision") {
      m.provisionen += b.betrag;
      provisionen.push({
        datum: b.buchungsdatum,
        zahler: (b.auftraggeberName ?? "").trim(),
        objekt: provisionObjekt(b.verwendungszweck),
        brutto: runde(b.betrag),
        netto: runde(b.betrag / USt_FAKTOR),
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
  const kostenProMonat = monateBisher > 0 ? ausgaben / monateBisher : 0;

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

  const jeZahler = new Map<string, { anzahl: number; brutto: number }>();
  for (const p of provisionen) {
    const z = jeZahler.get(p.zahler || "Unbekannt") ?? { anzahl: 0, brutto: 0 };
    z.anzahl++;
    z.brutto += p.brutto;
    jeZahler.set(p.zahler || "Unbekannt", z);
  }

  return {
    jahr,
    stand: heute,
    kategorienMonat,
    fixkosten: {
      fixSumme: runde(fixSumme),
      variabelSumme: runde(ausgabenOhneSteuern - fixSumme),
      fixProMonat: runde(fixSumme / Math.max(1, monateBisher)),
      posten: fixPosten.slice(0, 12),
    },
    kumuliert,
    provisionsZahler: [...jeZahler.entries()]
      .map(([name, z]) => ({ name, anzahl: z.anzahl, brutto: runde(z.brutto) }))
      .sort((a, b) => b.brutto - a.brutto),
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
    provisionNetto: runde(provisionBrutto / USt_FAKTOR),
    anzahlProvisionen: provisionen.length,
    monateBisher,
    kostenProMonat: runde(kostenProMonat),
    reichweiteMonate:
      kostenProMonat > 0 ? runde(liquiditaet / kostenProMonat) : null,
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
