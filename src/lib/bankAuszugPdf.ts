/**
 * Clientseitige PDF-Extraktion für VR-Bank-Kontoauszüge (pdf.js).
 */

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  parseBankAuszugZeilen,
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

/** Textzeilen aus PDF rekonstruieren (Y-Cluster). */
export async function extrahierePdfZeilen(file: File): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const zeilen: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .map((it) => ({
        str: itemText(it).trim(),
        x: itemX(it) ?? 0,
        y: itemY(it) ?? 0,
      }))
      .filter((it) => it.str.length > 0);

    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const Y_TOL = 2.5;
    let currentY: number | null = null;
    let current: { str: string; x: number }[] = [];

    const flush = () => {
      if (!current.length) return;
      current.sort((a, b) => a.x - b.x);
      const line = current
        .map((c) => c.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) zeilen.push(line);
      current = [];
    };

    for (const it of items) {
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
  }

  return zeilen;
}

export async function parseBankAuszugPdf(
  file: File,
): Promise<BankAuszugParseErgebnis> {
  const name = file.name.toLowerCase();
  if (file.type !== "application/pdf" && !name.endsWith(".pdf")) {
    throw new Error("Bitte eine PDF-Datei hochladen.");
  }
  const zeilen = await extrahierePdfZeilen(file);
  if (zeilen.length === 0) {
    throw new Error("PDF enthält keinen Text.");
  }
  return parseBankAuszugZeilen(zeilen);
}
