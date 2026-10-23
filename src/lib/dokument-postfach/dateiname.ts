/**
 * Inhaltsbasierte OneDrive-/DATEV-Dateinamen aus KI-Feldern.
 */
import type { DokumentAnalyseFelder, DokumentTyp } from "@/lib/dokument-ai";
import { graphDriveDateinameSaeubern } from "@/lib/microsoft/graph";

function extensionAus(originalName: string | null | undefined): string {
  const name = (originalName ?? "").trim();
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return ".pdf";
  const ext = name.slice(dot).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return ".pdf";
  return ext;
}

function segment(raw: string | null | undefined, maxLen = 48): string | null {
  const t = (raw ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

function titelSegment(raw: string | null | undefined): string | null {
  return segment(raw, 96);
}

function datumSegment(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) {
    return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  }
  return null;
}

function dokumentKurztyp(input: {
  betreff?: string | null;
  anhangName?: string | null;
}): string {
  const text = `${input.betreff ?? ""} ${input.anhangName ?? ""}`.toLowerCase();
  if (/versicher/.test(text)) return "Versicherung";
  if (/vertrag|mietvertrag/.test(text)) return "Vertrag";
  if (/protokoll/.test(text)) return "Protokoll";
  if (/nachtrag/.test(text)) return "Nachtrag";
  if (/rechnung|invoice/.test(text)) return "Rechnung";
  return "Dokument";
}

export function baueAblageDateiname(input: {
  felder: DokumentAnalyseFelder | null | undefined;
  dokumentTyp: DokumentTyp | null | undefined;
  originalName?: string | null;
  betreff?: string | null;
}): string {
  const ext = extensionAus(input.originalName);
  const f = input.felder;
  const teile: string[] = [];

  if (input.dokumentTyp === "rechnung") {
    const datum =
      datumSegment(f?.rechnungsdatum?.value) ??
      new Date().toISOString().slice(0, 10);
    teile.push(datum);
    const steller = segment(f?.rechnungssteller?.value);
    if (steller) teile.push(steller);
    const nr = segment(f?.rechnungsnummer?.value, 32);
    if (nr) teile.push(nr);
  } else {
    const datum = new Date().toISOString().slice(0, 10);
    teile.push(datum);
    const kiTitel = titelSegment(f?.dokumentTitel?.value);
    if (kiTitel) {
      teile.push(kiTitel);
    } else {
      teile.push(
        dokumentKurztyp({
          betreff: input.betreff,
          anhangName: input.originalName,
        }),
      );
    }
    const gs = segment(f?.gesellschaftName?.value);
    if (gs && !kiTitel?.toLowerCase().includes(gs.toLowerCase())) teile.push(gs);
  }

  const basis =
    teile.filter(Boolean).join("_") ||
    segment(input.originalName?.replace(/\.[^.]+$/, "")) ||
    "Dokument";

  return graphDriveDateinameSaeubern(`${basis}${ext}`);
}
