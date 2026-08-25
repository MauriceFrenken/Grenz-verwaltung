/**
 * Parser für Volksbank/Raiffeisen-Kontoauszug-Text.
 * Findet Buchungen über IBAN + Betrag + Datum — unabhängig von Zeilenumbrüchen.
 */

export interface BankBuchungEingabe {
  buchungsdatum: string; // YYYY-MM-DD
  betrag: number;
  gegenkontoIban: string | null;
  auftraggeberName: string | null;
  verwendungszweck: string | null;
  fingerprint: string;
}

export interface BankAuszugParseErgebnis {
  buchungen: BankBuchungEingabe[];
  zeitraumVon: string | null;
  zeitraumBis: string | null;
  kontoIban: string | null;
  warnungen: string[];
}

const IBAN_TOKEN = /(?<![A-Z0-9])([A-Z]{2}[0-9]{2}[A-Z0-9]{11,30})(?![A-Z0-9])/gi;
const BETRAG_TOKEN =
  /([+-])\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*EUR/gi;
const DATUM_TOKEN = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;
const VALUTA_TOKEN =
  /Valuta\s+(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(\d{4}))?/gi;

function normalisiereIban(raw: string): string | null {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  return iban;
}

function parseDatumTeile(d: string, m: string, y: string): string {
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function fingerprint(b: {
  buchungsdatum: string;
  betrag: number;
  gegenkontoIban: string | null;
  auftraggeberName: string | null;
  verwendungszweck: string | null;
}): string {
  return [
    b.buchungsdatum,
    b.betrag.toFixed(2),
    b.gegenkontoIban ?? "",
    (b.auftraggeberName ?? "").slice(0, 80),
    (b.verwendungszweck ?? "").slice(0, 120),
  ].join("|");
}

function findeKontoIban(text: string): string | null {
  const m = text.match(/\bIBAN\s+([A-Z]{2}\d{2}[A-Z0-9]+)/i);
  return m ? normalisiereIban(m[1]) : null;
}

function istRauschenName(name: string): boolean {
  const t = name.trim();
  if (!t) return true;
  if (/^Seite\s+\d+/i.test(t)) return true;
  if (/Filterparameter|Endsaldo|Startsaldo|Firmenkonto|Kontoinhaber|Abgefragt|Umsätze/i.test(t))
    return true;
  if (/Wir machen den Weg frei|Genossenschaftlichen FinanzGruppe/i.test(t))
    return true;
  if (/^BIC\b/i.test(t)) return true;
  if (/^GmbH$/i.test(t)) return true;
  if (/^Abschluss$/i.test(t)) return true;
  return false;
}

function nameVorIban(text: string, ibanIndex: number): string | null {
  const davor = text.slice(Math.max(0, ibanIndex - 200), ibanIndex);
  const zeilen = davor.split(/\n/).map((z) => z.trim()).filter(Boolean);
  for (let i = zeilen.length - 1; i >= 0; i--) {
    const z = zeilen[i]
      .replace(/\bIBAN\s+[A-Z]{2}\d{2}[A-Z0-9]+\b/gi, "")
      .replace(BETRAG_TOKEN, "")
      .replace(DATUM_TOKEN, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!z) continue;
    if (normalisiereIban(z)) continue;
    if (istRauschenName(z)) continue;
    if (z.length > 80) continue;
    return z;
  }
  return null;
}

function zweckZwischen(
  text: string,
  ibanEnd: number,
  betragStart: number,
): string | null {
  const roh = text
    .slice(ibanEnd, betragStart)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return roh || null;
}

function naechsterBetrag(
  text: string,
  ab: number,
): { betrag: number; index: number; end: number } | null {
  BETRAG_TOKEN.lastIndex = ab;
  const m = BETRAG_TOKEN.exec(text);
  if (!m || m.index === undefined) return null;
  // Nur Beträge nah hinter der IBAN (nicht die nächste Buchung)
  if (m.index - ab > 600) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const n = Number(m[2].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return { betrag: sign * n, index: m.index, end: m.index + m[0].length };
}

function naechstesDatum(
  text: string,
  ab: number,
): { datum: string; end: number } | null {
  const fenster = text.slice(ab, ab + 120);
  VALUTA_TOKEN.lastIndex = 0;
  const v = VALUTA_TOKEN.exec(fenster);
  if (v) {
    const datum =
      v[4] && v[5] && v[6]
        ? parseDatumTeile(v[4], v[5], v[6])
        : parseDatumTeile(v[1], v[2], v[3]);
    return { datum, end: ab + (v.index ?? 0) + v[0].length };
  }
  DATUM_TOKEN.lastIndex = 0;
  const d = DATUM_TOKEN.exec(fenster);
  if (d) {
    return {
      datum: parseDatumTeile(d[1], d[2], d[3]),
      end: ab + (d.index ?? 0) + d[0].length,
    };
  }
  return null;
}

/**
 * Parst Kontoauszug-Text (Zeilen oder Fließtext).
 * Erwartet IBANs und Beträge im Text — Layout der PDF-Zeilen ist egal.
 */
export function parseBankAuszugZeilen(zeilen: string[]): BankAuszugParseErgebnis {
  const text = zeilen.join("\n");
  return parseBankAuszugText(text);
}

export function parseBankAuszugText(text: string): BankAuszugParseErgebnis {
  const warnungen: string[] = [];
  const buchungen: BankBuchungEingabe[] = [];
  const gesehen = new Set<string>();
  const kontoIban = findeKontoIban(text);

  IBAN_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IBAN_TOKEN.exec(text)) !== null) {
    const rawIban = match[1];
    const iban = normalisiereIban(rawIban);
    if (!iban) continue;

    // „IBAN DExx…“ / „IBAN: DExx…“ im Footer oder Verwendungszweck = kein Buchungsstart
    const prefix = text.slice(Math.max(0, match.index - 8), match.index);
    if (/IBAN\s*:?\s*$/i.test(prefix)) continue;

    const betragTreffer = naechsterBetrag(text, match.index + match[0].length);
    if (!betragTreffer) continue;

    const datumTreffer = naechstesDatum(text, betragTreffer.end);
    if (!datumTreffer) continue;

    const gegenkonto = iban === kontoIban ? null : iban;
    const eintrag = {
      buchungsdatum: datumTreffer.datum,
      betrag: betragTreffer.betrag,
      gegenkontoIban: gegenkonto,
      auftraggeberName: nameVorIban(text, match.index),
      verwendungszweck: zweckZwischen(
        text,
        match.index + match[0].length,
        betragTreffer.index,
      ),
    };
    const fp = fingerprint(eintrag);
    if (gesehen.has(fp)) continue;
    gesehen.add(fp);
    buchungen.push({ ...eintrag, fingerprint: fp });
  }

  if (buchungen.length === 0) {
    throw new Error(
      "Keine Buchungen im PDF erkannt — bitte VR-Bank-Umsatzauszug verwenden.",
    );
  }

  const daten = buchungen.map((b) => b.buchungsdatum).sort();
  if (!kontoIban) {
    warnungen.push("Konto-IBAN im PDF nicht erkannt.");
  }

  return {
    buchungen,
    zeitraumVon: daten[0] ?? null,
    zeitraumBis: daten[daten.length - 1] ?? null,
    kontoIban,
    warnungen,
  };
}
