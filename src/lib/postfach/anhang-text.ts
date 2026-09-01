/**
 * Text aus Postfach-Anhängen extrahieren (PDF, Office, Text). Server-only.
 */
import {
  istDocDatei,
  istDocxDatei,
  istExcelDatei,
  istOfficeDatei,
  istPdfDatei,
  istTextDatei,
} from "@/lib/postfach/dateityp";
import { extrahierePdfText } from "@/lib/postfach/pdf-text";

export type AnhangTextQuelle =
  | "pdf"
  | "docx"
  | "doc"
  | "excel"
  | "text"
  | "keine";

export type AnhangTextExtraktion = {
  text: string;
  quelle: AnhangTextQuelle;
};

function bufferAus(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

async function extrahiereDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bufferAus(bytes) });
  return result.value.replace(/\s+/g, " ").trim();
}

async function extrahiereDoc(bytes: Uint8Array): Promise<string> {
  const WordExtractor = (await import("word-extractor")).default;
  const extractor = new WordExtractor();
  const doc = await extractor.extract(bufferAus(bytes));
  return doc.getBody().replace(/\s+/g, " ").trim();
}

async function extrahiereExcel(bytes: Uint8Array): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const teile: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet).trim();
    if (csv) {
      teile.push(`--- ${sheetName} ---\n${csv}`);
    }
  }

  return teile.join("\n\n").trim();
}

function extrahiereKlartext(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

export async function extrahiereAnhangText(input: {
  name: string;
  contentType: string | null;
  bytes: Uint8Array;
}): Promise<AnhangTextExtraktion> {
  const { name, contentType, bytes } = input;
  if (bytes.byteLength === 0) {
    return { text: "", quelle: "keine" };
  }

  try {
    if (istPdfDatei(name, contentType)) {
      const pdf = await extrahierePdfText(bytes);
      return { text: pdf.modelContext.trim(), quelle: "pdf" };
    }

    if (istDocxDatei(name, contentType)) {
      return { text: await extrahiereDocx(bytes), quelle: "docx" };
    }

    if (istDocDatei(name, contentType)) {
      return { text: await extrahiereDoc(bytes), quelle: "doc" };
    }

    if (istExcelDatei(name, contentType)) {
      return { text: await extrahiereExcel(bytes), quelle: "excel" };
    }

    if (istTextDatei(name, contentType)) {
      return { text: extrahiereKlartext(bytes), quelle: "text" };
    }

    if (istOfficeDatei(name, contentType)) {
      const parser: Array<{ fn: () => Promise<string>; quelle: AnhangTextQuelle }> = [
        { fn: () => extrahiereDocx(bytes), quelle: "docx" },
        { fn: () => extrahiereExcel(bytes), quelle: "excel" },
        { fn: () => extrahiereDoc(bytes), quelle: "doc" },
      ];
      for (const { fn, quelle } of parser) {
        try {
          const text = await fn();
          if (text) return { text, quelle };
        } catch {
          // nächster Parser
        }
      }
    }
  } catch {
    return { text: "", quelle: "keine" };
  }

  return { text: "", quelle: "keine" };
}
