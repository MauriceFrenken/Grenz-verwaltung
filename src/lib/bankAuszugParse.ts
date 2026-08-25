/**
 * Parser für Volksbank/Raiffeisen-Kontoauszug-Text
 * (Umsätze-PDF: Name → IBAN → Verwendungszweck* → ±Betrag EUR → Datum|Valuta).
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

const IBAN_RE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const BETRAG_RE = /^([+-]?)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*EUR$/i;
const DATUM_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const VALUTA_RE =
  /^Valuta\s+(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(\d{4}))?/i;

function normalisiereIban(raw: string): string | null {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!IBAN_RE.test(iban)) return null;
  return iban;
}

function parseDeBetrag(raw: string): number | null {
  const m = raw.trim().match(BETRAG_RE);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const n = Number(m[2].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return sign * n;
}

function parseDatumTeile(d: string, m: string, y: string): string {
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseDatumZeile(line: string): string | null {
  const m = line.trim().match(DATUM_RE);
  if (!m) return null;
  return parseDatumTeile(m[1], m[2], m[3]);
}

function parseValutaZeile(line: string): string | null {
  const m = line.trim().match(VALUTA_RE);
  if (!m) return null;
  if (m[4] && m[5] && m[6]) return parseDatumTeile(m[4], m[5], m[6]);
  return parseDatumTeile(m[1], m[2], m[3]);
}

function istRauschen(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^Seite\s+\d+\s+von\s+\d+/i.test(t)) return true;
  if (/^--\s*\d+\s+of\s+\d+\s*--/i.test(t)) return true;
  if (/Wir machen den Weg frei/i.test(t)) return true;
  if (/Genossenschaftlichen FinanzGruppe/i.test(t)) return true;
  if (/^Filterparameter/i.test(t)) return true;
  if (/\(Endsaldo\)|\(Startsaldo\)/i.test(t)) return true;
  if (/^Umsätze$/i.test(t)) return true;
  if (/^Firmenkonto$/i.test(t)) return true;
  if (/^Kontoinhaber\b/i.test(t)) return true;
  if (/^Abgefragt von\b/i.test(t)) return true;
  if (/^BIC\b/i.test(t)) return true;
  if (/^IBAN\s+[A-Z]{2}\d{2}/i.test(t)) return true;
  if (/^Datum\s+\d{1,2}\.\d{1,2}\.\d{4}/i.test(t)) return true;
  if (/^Uhrzeit\b/i.test(t)) return true;
  if (/^GmbH$/i.test(t)) return true;
  return false;
}

function istIbanZeile(line: string): boolean {
  return Boolean(normalisiereIban(line.trim()));
}

function istBetragZeile(line: string): boolean {
  return BETRAG_RE.test(line.trim());
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

/** Parst den Fließtext eines VR-Bank-Umsatz-PDFs (zeilenweise). */
export function parseBankAuszugZeilen(zeilen: string[]): BankAuszugParseErgebnis {
  const warnungen: string[] = [];
  const buchungen: BankBuchungEingabe[] = [];
  const gesehen = new Set<string>();

  let kontoIban: string | null = null;
  for (const z of zeilen) {
    const m = z.match(/\bIBAN\s+([A-Z]{2}\d{2}[A-Z0-9]+)/i);
    if (m) {
      kontoIban = normalisiereIban(m[1]);
      if (kontoIban) break;
    }
  }

  const clean = zeilen.map((z) => z.trim()).filter((z) => !istRauschen(z));

  let i = 0;
  while (i < clean.length) {
    if (!istIbanZeile(clean[i])) {
      i++;
      continue;
    }

    const iban = normalisiereIban(clean[i])!;
    let name: string | null = null;
    if (i > 0) {
      const prev = clean[i - 1];
      if (
        !istIbanZeile(prev) &&
        !istBetragZeile(prev) &&
        !DATUM_RE.test(prev) &&
        !VALUTA_RE.test(prev)
      ) {
        name = prev;
      }
    }

    const zweckParts: string[] = [];
    let j = i + 1;
    while (
      j < clean.length &&
      !istBetragZeile(clean[j]) &&
      !istIbanZeile(clean[j])
    ) {
      const z = clean[j];
      if (DATUM_RE.test(z) || VALUTA_RE.test(z)) break;
      zweckParts.push(z);
      j++;
    }

    if (j >= clean.length || !istBetragZeile(clean[j])) {
      i++;
      continue;
    }

    const betrag = parseDeBetrag(clean[j]);
    if (betrag === null) {
      i++;
      continue;
    }
    j++;

    let datum: string | null = null;
    while (
      j < clean.length &&
      !istIbanZeile(clean[j]) &&
      !istBetragZeile(clean[j])
    ) {
      datum = parseDatumZeile(clean[j]) ?? parseValutaZeile(clean[j]);
      if (datum) {
        j++;
        break;
      }
      if (!DATUM_RE.test(clean[j]) && !VALUTA_RE.test(clean[j])) {
        zweckParts.push(clean[j]);
        j++;
        continue;
      }
      j++;
    }

    if (!datum) {
      i = j > i ? j : i + 1;
      continue;
    }

    const gegenkonto = iban === kontoIban ? null : iban;
    const eintrag = {
      buchungsdatum: datum,
      betrag,
      gegenkontoIban: gegenkonto,
      auftraggeberName: name,
      verwendungszweck: zweckParts.join(" ").trim() || null,
    };
    const fp = fingerprint(eintrag);
    if (!gesehen.has(fp)) {
      gesehen.add(fp);
      buchungen.push({ ...eintrag, fingerprint: fp });
    }

    i = j;
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
