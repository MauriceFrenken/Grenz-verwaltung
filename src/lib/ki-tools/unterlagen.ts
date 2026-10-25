/**
 * Unterlagen in Text mit Seitenmarken <<<PAGE n>>> überführen (PDF-Seite bzw. Excel-Blatt),
 * damit Belege seitengenau geprüft werden können. Excel, CSV und Text laufen im Browser und auf
 * dem Server gleich; PDF nutzt im Browser pdf.js, auf dem Server unpdf.
 */

import { buildModelContext } from "@/lib/expose-pdf-context";

export const istPdf = (name: string) => /\.pdf$/i.test(name);
export const istExcel = (name: string) => /\.(xlsx|xlsm|xls|ods)$/i.test(name);
export const istText = (name: string) => /\.(csv|txt|md)$/i.test(name);
export const istWord = (name: string) => /\.docx$/i.test(name);
export const istBild = (name: string) => /\.(jpe?g|png)$/i.test(name);

export async function excelText(
  bytes: Uint8Array,
): Promise<{ text: string; seiten: number }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array" });
  const pages = wb.SheetNames.map((name, i) => {
    const csv = XLSX.utils
      .sheet_to_csv(wb.Sheets[name], { FS: " ; ", blankrows: false })
      .replace(/( ; )+$/gm, "")
      .trim();
    return { pageNumber: i + 1, text: `Blatt: ${name}\n${csv}` };
  });
  return { text: buildModelContext(pages, null), seiten: pages.length };
}

export function klartext(bytes: Uint8Array): { text: string; seiten: number } {
  const t = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes)
    .replaceAll("\0", "");
  // Lange Texte in Abschnitte von ca. 6.000 Zeichen teilen, damit Seitenangaben eindeutig bleiben.
  const pages: { pageNumber: number; text: string }[] = [];
  for (let i = 0; i < t.length || i === 0; i += 6000)
    pages.push({ pageNumber: pages.length + 1, text: t.slice(i, i + 6000) });
  return { text: buildModelContext(pages, null), seiten: pages.length };
}
