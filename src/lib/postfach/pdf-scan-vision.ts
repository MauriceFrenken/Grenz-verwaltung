/**
 * Große gescannte PDFs für die KI-Analyse vorbereiten: zuerst Seiten-Auszug,
 * sonst eingebettete Scan-Bilder extrahieren und komprimieren. Läuft auf
 * Cloudflare Workers (kein natives Canvas). Server-only.
 */
import { encode as jpegEncode } from "jpeg-js";
import { PDFDocument } from "pdf-lib";
import { extractImages, getDocumentProxy } from "unpdf";

import type { DokumentVisionBlock } from "@/lib/dokument-ai";
import {
  KI_MAX_VISION_PAYLOAD_BYTES,
  KI_MAX_VISION_TOKENS,
  schaetzeVisionTokens,
} from "@/lib/ki-kontext";

const PDF_SEITEN_KANDIDATEN = [10, 8, 6, 5, 4, 3, 2, 1] as const;
const BILD_SEITEN_KANDIDATEN = [8, 6, 5, 4, 3, 2, 1] as const;
const BILD_BREITE_KANDIDATEN = [1_600, 1_400, 1_200, 1_000, 850] as const;
const JPEG_QUALITAET_KANDIDATEN = [78, 72, 62, 52] as const;

function bytesZuBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function extrahierePdfErsteSeiten(
  bytes: Uint8Array,
  maxSeiten: number,
): Promise<Uint8Array> {
  const quelle = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ziel = await PDFDocument.create();
  const anzahl = Math.min(maxSeiten, quelle.getPageCount());
  if (anzahl <= 0) {
    throw new Error("PDF enthält keine Seiten.");
  }
  const indizes = Array.from({ length: anzahl }, (_, i) => i);
  const kopiert = await ziel.copyPages(quelle, indizes);
  for (const seite of kopiert) {
    ziel.addPage(seite);
  }
  return ziel.save();
}

function zuRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 3 | 4,
): Uint8ClampedArray {
  if (channels === 4) return data;
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (channels === 3) {
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i]!;
      rgba[j + 1] = data[i + 1]!;
      rgba[j + 2] = data[i + 2]!;
      rgba[j + 3] = 255;
    }
    return rgba;
  }
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    const g = data[i]!;
    rgba[j] = g;
    rgba[j + 1] = g;
    rgba[j + 2] = g;
    rgba[j + 3] = 255;
  }
  return rgba;
}

function skaliereRgba(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const dstH = Math.max(1, Math.round(srcH * (dstW / srcW)));
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = src[si]!;
      dst[di + 1] = src[si + 1]!;
      dst[di + 2] = src[si + 2]!;
      dst[di + 3] = 255;
    }
  }
  return { data: dst, width: dstW, height: dstH };
}

function bildZuJpeg(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  qualitaet: number,
): Uint8Array {
  const { data } = jpegEncode(
    { data: rgba, width, height },
    Math.min(100, Math.max(1, qualitaet)),
  );
  return new Uint8Array(data);
}

function visionPasst(blocks: DokumentVisionBlock[]): boolean {
  if (blocks.length === 0) return false;
  const bytes = blocks.reduce(
    (sum, block) => sum + Math.ceil(block.base64.length * 0.75),
    0,
  );
  if (bytes > KI_MAX_VISION_PAYLOAD_BYTES) return false;
  return schaetzeVisionTokens(blocks) <= KI_MAX_VISION_TOKENS;
}

async function extrahiereScanSeiteAlsJpeg(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  seite: number,
  breite: number,
  qualitaet: number,
): Promise<DokumentVisionBlock | null> {
  const bilder = await extractImages(pdf, seite);
  if (!bilder.length) return null;

  const groesstes = bilder.reduce((a, b) =>
    b.width * b.height > a.width * a.height ? b : a,
  );

  let rgba = zuRgba(
    groesstes.data,
    groesstes.width,
    groesstes.height,
    groesstes.channels,
  );
  let width = groesstes.width;
  let height = groesstes.height;

  if (width > breite) {
    const skaliert = skaliereRgba(rgba, width, height, breite);
    rgba = skaliert.data;
    width = skaliert.width;
    height = skaliert.height;
  }

  const jpeg = bildZuJpeg(rgba, width, height, qualitaet);
  return {
    art: "image",
    mediaType: "image/jpeg",
    base64: bytesZuBase64(jpeg),
  };
}

async function versuchePdfVorschau(
  bytes: Uint8Array,
  gesamtSeiten: number,
): Promise<{ vision: DokumentVisionBlock[]; hinweis: string } | null> {
  for (const maxSeiten of PDF_SEITEN_KANDIDATEN) {
    if (maxSeiten > gesamtSeiten) continue;
    try {
      const vorschau = await extrahierePdfErsteSeiten(bytes, maxSeiten);
      const block: DokumentVisionBlock = {
        art: "pdf",
        base64: bytesZuBase64(vorschau),
      };
      if (!visionPasst([block])) continue;
      const hinweis =
        maxSeiten < gesamtSeiten
          ? `Hinweis: Scan — nur die ersten ${maxSeiten} von ${gesamtSeiten} Seiten als PDF bei.`
          : "Hinweis: Scan — PDF liegt als ganzes Dokument bei.";
      return { vision: [block], hinweis };
    } catch {
      // Nächster Kandidat
    }
  }
  return null;
}

async function versucheEingebetteteScanBilder(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  gesamtSeiten: number,
): Promise<{ vision: DokumentVisionBlock[]; hinweis: string }> {
  for (const maxSeiten of BILD_SEITEN_KANDIDATEN) {
    const seitenAnzahl = Math.min(maxSeiten, gesamtSeiten);
    for (const breite of BILD_BREITE_KANDIDATEN) {
      for (const qualitaet of JPEG_QUALITAET_KANDIDATEN) {
        const vision: DokumentVisionBlock[] = [];
        for (let seite = 1; seite <= seitenAnzahl; seite++) {
          const block = await extrahiereScanSeiteAlsJpeg(
            pdf,
            seite,
            breite,
            qualitaet,
          );
          if (!block) {
            vision.length = 0;
            break;
          }
          vision.push(block);
        }
        if (!visionPasst(vision)) continue;

        const hinweis =
          seitenAnzahl < gesamtSeiten
            ? `Hinweis: Scan — erste ${seitenAnzahl} von ${gesamtSeiten} Seiten als komprimierte Bilder.`
            : `Hinweis: Scan — ${seitenAnzahl} Seite(n) als komprimierte Bilder.`;
        return { vision, hinweis };
      }
    }
  }

  throw new Error(
    "Scan ist auch als komprimierte Vorschau zu groß für die KI-Analyse.",
  );
}

export type PdfScanVisionErgebnis = {
  vision: DokumentVisionBlock[];
  hinweis: string;
};

/** Gescanntes PDF für KI-Vision aufbereiten (beliebige Dateigröße). */
export async function bereitePdfScanFuerKi(
  bytes: Uint8Array,
): Promise<PdfScanVisionErgebnis> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const gesamtSeiten = pdf.numPages;

  const vorschau = await versuchePdfVorschau(bytes, gesamtSeiten);
  if (vorschau) return vorschau;

  return versucheEingebetteteScanBilder(pdf, gesamtSeiten);
}
