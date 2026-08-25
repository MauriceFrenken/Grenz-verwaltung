/**
 * Clientseitige PDF-Extraktion für VR-Bank-Kontoauszüge (pdf.js).
 */

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  parseBankAuszugText,
  type BankAuszugParseErgebnis,
  type BankBuchungEingabe,
} from "./bankAuszugParse";

export type { BankAuszugParseErgebnis, BankBuchungEingabe };

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function itemText(item: unknown): string {
  if (
    item &&
    typeof item === "object" &&
    "str" in item &&
    typeof (item as { str: unknown }).str === "string"
  ) {
    return (item as { str: string }).str;
  }
  return "";
}

function itemHasEol(item: unknown): boolean {
  return Boolean(
    item &&
      typeof item === "object" &&
      "hasEOL" in item &&
      (item as { hasEOL?: boolean }).hasEOL,
  );
}

function itemY(item: unknown): number | null {
  if (
    item &&
    typeof item === "object" &&
    "transform" in item &&
    Array.isArray((item as { transform: unknown }).transform)
  ) {
    const t = (item as { transform: number[] }).transform;
    return typeof t[5] === "number" ? t[5] : null;
  }
  return null;
}

function itemX(item: unknown): number | null {
  if (
    item &&
    typeof item === "object" &&
    "transform" in item &&
    Array.isArray((item as { transform: unknown }).transform)
  ) {
    const t = (item as { transform: number[] }).transform;
    return typeof t[4] === "number" ? t[4] : null;
  }
  return null;
}

/**
 * Text aus PDF: bevorzugt hasEOL, sonst Y-Cluster.
 * Ergebnis ist Fließtext mit Zeilenumbrüchen — der Parser braucht keine
 * 1:1-Feldzeilen mehr.
 */
export async function extrahierePdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const seiten: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items;

    let mitEol = 0;
    for (const it of items) {
      if (itemHasEol(it)) mitEol++;
    }

    if (mitEol > 0) {
      let buf = "";
      for (const it of items) {
        const t = itemText(it);
        if (!t && !itemHasEol(it)) continue;
        buf += t;
        if (itemHasEol(it)) buf += "\n";
        else if (t && !t.endsWith(" ")) buf += " ";
      }
      seiten.push(buf);
      continue;
    }

    // Fallback: Y-Cluster
    const mapped = items
      .map((it) => ({
        str: itemText(it).trim(),
        x: itemX(it) ?? 0,
        y: itemY(it) ?? 0,
      }))
      .filter((it) => it.str.length > 0);

    mapped.sort((a, b) => b.y - a.y || a.x - b.x);

    const Y_TOL = 3;
    const zeilen: string[] = [];
    let currentY: number | null = null;
    let current: { str: string; x: number }[] = [];

    const flush = () => {
      if (!current.length) return;
      current.sort((a, b) => a.x - b.x);
      zeilen.push(
        current
          .map((c) => c.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
      current = [];
    };

    for (const it of mapped) {
      if (currentY === null || Math.abs(it.y - currentY) <= Y_TOL) {
        currentY = currentY === null ? it.y : (currentY + it.y) / 2;
        current.push({ str: it.str, x: it.x });
      } else {
        flush();
        currentY = it.y;
        current.push({ str: it.str, x: it.x });
      }
    }
    flush();
    seiten.push(zeilen.join("\n"));
  }

  return seiten.join("\n");
}

export async function parseBankAuszugPdf(
  file: File,
): Promise<BankAuszugParseErgebnis> {
  const name = file.name.toLowerCase();
  if (file.type !== "application/pdf" && !name.endsWith(".pdf")) {
    throw new Error("Bitte eine PDF-Datei hochladen.");
  }
  const text = await extrahierePdfText(file);
  if (!text.trim()) {
    throw new Error("PDF enthält keinen Text.");
  }
  return parseBankAuszugText(text);
}
