/**
 * Parser für ISO 20022 camt.053 (Tagesauszüge) → BankBuchungEingabe.
 */

import { XMLParser } from "fast-xml-parser";

import type { BankBuchungEingabe } from "@/lib/bankAuszugParse";

export type { BankBuchungEingabe };

export interface Camt053ParseErgebnis {
  buchungen: BankBuchungEingabe[];
  zeitraumVon: string | null;
  zeitraumBis: string | null;
  kontoIban: string | null;
  warnungen: string[];
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const t = String(value).trim();
    return t || null;
  }
  if (typeof value === "object" && value !== null && "#text" in value) {
    return textOf((value as { "#text": unknown })["#text"]);
  }
  return null;
}

function normalisiereIban(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  return iban;
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

function findDeep(obj: unknown, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (k in rec) return rec[k];
  }
  for (const v of Object.values(rec)) {
    if (v && typeof v === "object") {
      const found = findDeep(v, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function extractIbanFromAcct(acct: unknown): string | null {
  const id = findDeep(acct, ["Id", "id"]);
  const iban = findDeep(id, ["IBAN", "iban"]);
  return normalisiereIban(textOf(iban));
}

function extractAmt(ntry: Record<string, unknown>): number | null {
  const amtNode = ntry.Amt ?? ntry.amt;
  const raw = textOf(amtNode);
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const ind = textOf(ntry.CdtDbtInd ?? ntry.cdtDbtInd)?.toUpperCase();
  if (ind === "DBIT") return -Math.abs(n);
  return Math.abs(n);
}

function extractDatum(ntry: Record<string, unknown>): string | null {
  const book = ntry.BookgDt ?? ntry.bookgDt;
  const valuta = ntry.ValDt ?? ntry.valDt;
  const dt =
    textOf(findDeep(book, ["Dt", "dt"])) ??
    textOf(findDeep(valuta, ["Dt", "dt"])) ??
    textOf(book) ??
    textOf(valuta);
  if (!dt) return null;
  // YYYY-MM-DD or YYYY-MM-DDThh:mm:ss
  const m = dt.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function extractNameAndIban(
  ntry: Record<string, unknown>,
  isCredit: boolean,
): { name: string | null; iban: string | null } {
  const details = asArray(ntry.NtryDtls ?? ntry.ntryDtls);
  for (const d of details) {
    const txs = asArray(
      (d as Record<string, unknown>).TxDtls ??
        (d as Record<string, unknown>).txDtls,
    );
    for (const tx of txs) {
      const parties =
        (tx as Record<string, unknown>).RltdPties ??
        (tx as Record<string, unknown>).rltdPties;
      if (!parties || typeof parties !== "object") continue;
      const p = parties as Record<string, unknown>;
      if (isCredit) {
        const dbtr = p.Dbtr ?? p.dbtr;
        const dbtrAcct = p.DbtrAcct ?? p.dbtrAcct;
        return {
          name: textOf(findDeep(dbtr, ["Nm", "nm"])),
          iban: extractIbanFromAcct(dbtrAcct),
        };
      }
      const cdtr = p.Cdtr ?? p.cdtr;
      const cdtrAcct = p.CdtrAcct ?? p.cdtrAcct;
      return {
        name: textOf(findDeep(cdtr, ["Nm", "nm"])),
        iban: extractIbanFromAcct(cdtrAcct),
      };
    }
  }
  return { name: null, iban: null };
}

function extractZweck(ntry: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const details = asArray(ntry.NtryDtls ?? ntry.ntryDtls);
  for (const d of details) {
    const txs = asArray(
      (d as Record<string, unknown>).TxDtls ??
        (d as Record<string, unknown>).txDtls,
    );
    for (const tx of txs) {
      const rmt =
        (tx as Record<string, unknown>).RmtInf ??
        (tx as Record<string, unknown>).rmtInf;
      if (!rmt) continue;
      for (const u of asArray(
        (rmt as Record<string, unknown>).Ustrd ??
          (rmt as Record<string, unknown>).ustrd,
      )) {
        const t = textOf(u);
        if (t) parts.push(t);
      }
    }
  }
  const addtl = textOf(ntry.AddtlNtryInf ?? ntry.addtlNtryInf);
  if (addtl) parts.push(addtl);
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined || null;
}

function parseStmt(stmt: Record<string, unknown>): Camt053ParseErgebnis {
  const warnungen: string[] = [];
  const buchungen: BankBuchungEingabe[] = [];
  const gesehen = new Set<string>();

  const kontoIban = extractIbanFromAcct(stmt.Acct ?? stmt.acct);
  const frToDt = stmt.FrToDt ?? stmt.frToDt;
  const zeitraumVon =
    textOf(findDeep(frToDt, ["FrDtTm", "frDtTm"]))?.slice(0, 10) ?? null;
  const zeitraumBis =
    textOf(findDeep(frToDt, ["ToDtTm", "toDtTm"]))?.slice(0, 10) ?? null;

  for (const ntryRaw of asArray(stmt.Ntry ?? stmt.ntry)) {
    const ntry = ntryRaw as Record<string, unknown>;
    const betrag = extractAmt(ntry);
    const buchungsdatum = extractDatum(ntry);
    if (betrag == null || !buchungsdatum) continue;

    const isCredit = betrag > 0;
    const { name, iban } = extractNameAndIban(ntry, isCredit);
    const gegenkontoIban =
      iban && kontoIban && iban === kontoIban ? null : iban;

    const eintrag = {
      buchungsdatum,
      betrag,
      gegenkontoIban,
      auftraggeberName: name,
      verwendungszweck: extractZweck(ntry),
    };
    const fp = fingerprint(eintrag);
    if (gesehen.has(fp)) continue;
    gesehen.add(fp);
    buchungen.push({ ...eintrag, fingerprint: fp });
  }

  if (!kontoIban) warnungen.push("Konto-IBAN im camt.053 nicht erkannt.");

  const daten = buchungen.map((b) => b.buchungsdatum).sort();
  return {
    buchungen,
    zeitraumVon: zeitraumVon ?? daten[0] ?? null,
    zeitraumBis: zeitraumBis ?? daten[daten.length - 1] ?? null,
    kontoIban,
    warnungen,
  };
}

/**
 * Parst ein oder mehrere camt.053-XML-Dokumente (Document-Root oder Stmt).
 */
export function parseCamt053Xml(xml: string): Camt053ParseErgebnis {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
  });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root =
    (doc.Document as Record<string, unknown> | undefined) ??
    (doc.document as Record<string, unknown> | undefined) ??
    doc;

  const bk =
    (root.BkToCstmrStmt as Record<string, unknown> | undefined) ??
    (root.bkToCstmrStmt as Record<string, unknown> | undefined);

  if (!bk) {
    throw new Error("Kein camt.053 BkToCstmrStmt gefunden.");
  }

  const stmts = asArray(bk.Stmt ?? bk.stmt);
  if (stmts.length === 0) {
    throw new Error("Kein Stmt in camt.053 gefunden.");
  }

  const merged: Camt053ParseErgebnis = {
    buchungen: [],
    zeitraumVon: null,
    zeitraumBis: null,
    kontoIban: null,
    warnungen: [],
  };
  const gesehen = new Set<string>();

  for (const stmt of stmts) {
    const part = parseStmt(stmt as Record<string, unknown>);
    if (!merged.kontoIban) merged.kontoIban = part.kontoIban;
    merged.warnungen.push(...part.warnungen);
    for (const b of part.buchungen) {
      if (gesehen.has(b.fingerprint)) continue;
      gesehen.add(b.fingerprint);
      merged.buchungen.push(b);
    }
    if (
      part.zeitraumVon &&
      (!merged.zeitraumVon || part.zeitraumVon < merged.zeitraumVon)
    ) {
      merged.zeitraumVon = part.zeitraumVon;
    }
    if (
      part.zeitraumBis &&
      (!merged.zeitraumBis || part.zeitraumBis > merged.zeitraumBis)
    ) {
      merged.zeitraumBis = part.zeitraumBis;
    }
  }

  return merged;
}

/**
 * Extrahiert camt.053-XML aus EBICS-OrderData (roh XML, ZIP oder mehrere Dateien).
 */
export async function extractCamt053Xmls(
  orderData: Buffer | string,
): Promise<string[]> {
  const buf = Buffer.isBuffer(orderData)
    ? orderData
    : Buffer.from(orderData, "binary");

  // ZIP magic
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const xmls: string[] = [];
    for (const name of Object.keys(zip.files)) {
      const file = zip.files[name];
      if (file.dir) continue;
      if (!/\.(xml|camt)$/i.test(name) && !/camt\.053/i.test(name)) {
        // trotzdem versuchen, wenn Text wie XML aussieht
        const content = await file.async("string");
        if (content.includes("BkToCstmrStmt") || content.includes("Document")) {
          xmls.push(content);
        }
        continue;
      }
      xmls.push(await file.async("string"));
    }
    if (xmls.length === 0) {
      throw new Error("ZIP enthält keine camt.053-XML-Dateien.");
    }
    return xmls;
  }

  const asText = buf.toString("utf8");
  if (asText.includes("BkToCstmrStmt") || asText.includes("Document")) {
    // Mehrere XML-Dokumente hintereinander möglich
    const parts = asText.split(/(?=<\?xml\b)/i).filter((p) => p.trim());
    return parts.length > 0 ? parts : [asText];
  }

  throw new Error("Unbekanntes C53-Format (weder ZIP noch camt.053-XML).");
}

export async function parseCamt053OrderData(
  orderData: Buffer | string,
): Promise<Camt053ParseErgebnis> {
  const xmls = await extractCamt053Xmls(orderData);
  const merged: Camt053ParseErgebnis = {
    buchungen: [],
    zeitraumVon: null,
    zeitraumBis: null,
    kontoIban: null,
    warnungen: [],
  };
  const gesehen = new Set<string>();

  for (const xml of xmls) {
    const part = parseCamt053Xml(xml);
    if (!merged.kontoIban) merged.kontoIban = part.kontoIban;
    merged.warnungen.push(...part.warnungen);
    for (const b of part.buchungen) {
      if (gesehen.has(b.fingerprint)) continue;
      gesehen.add(b.fingerprint);
      merged.buchungen.push(b);
    }
    if (
      part.zeitraumVon &&
      (!merged.zeitraumVon || part.zeitraumVon < merged.zeitraumVon)
    ) {
      merged.zeitraumVon = part.zeitraumVon;
    }
    if (
      part.zeitraumBis &&
      (!merged.zeitraumBis || part.zeitraumBis > merged.zeitraumBis)
    ) {
      merged.zeitraumBis = part.zeitraumBis;
    }
  }

  return merged;
}
