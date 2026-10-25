/**
 * Browser-Seite der KI-Tools: Dateien vorbereiten (Text mit Seitenmarken, Fotos verkleinern),
 * Vorlage laden und die Ausgabe im Grenz-Format bauen und herunterladen.
 */

import type { BildDatei } from "./dateien/powerpoint";
import type { DateiToolId, ToolErgebnis, Unterlage } from "./typen";
import {
  excelText,
  istBild,
  istExcel,
  istPdf,
  istText,
  klartext,
} from "./unterlagen";

export type Anhang =
  | {
      id: string;
      name: string;
      art: "unterlage";
      unterlage: Unterlage;
      quelle: "upload" | "ordner";
    }
  | {
      id: string;
      name: string;
      art: "bild";
      bild: BildDatei;
      vorschau: string;
      quelle: "upload" | "ordner";
    };

let zaehler = 0;
const neueId = () => `u${Date.now().toString(36)}${(zaehler += 1)}`;

export const ANNEHMEN = ".pdf,.xlsx,.xlsm,.xls,.csv,.txt,.jpg,.jpeg,.png";

/** Foto auf max. 2000 px verkleinern und als JPEG kodieren (PPTX bleibt handlich). */
export async function bildVorbereiten(
  name: string,
  blob: Blob,
): Promise<{ bild: BildDatei; vorschau: string }> {
  const bitmap = await createImageBitmap(blob);
  const faktor = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const breite = Math.round(bitmap.width * faktor);
  const hoehe = Math.round(bitmap.height * faktor);
  const canvas = document.createElement("canvas");
  canvas.width = breite;
  canvas.height = hoehe;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, breite, hoehe);
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Bild konnte nicht gelesen werden.")),
      "image/jpeg",
      0.85,
    ),
  );
  const daten = new Uint8Array(await jpeg.arrayBuffer());
  return {
    bild: { name, daten, endung: "jpeg", breite, hoehe },
    vorschau: URL.createObjectURL(jpeg),
  };
}

export async function dateiVorbereiten(datei: File): Promise<Anhang> {
  const name = datei.name;
  if (istBild(name)) {
    const { bild, vorschau } = await bildVorbereiten(name, datei);
    return {
      id: neueId(),
      name,
      art: "bild",
      bild,
      vorschau,
      quelle: "upload",
    };
  }
  const bytes = new Uint8Array(await datei.arrayBuffer());
  let ergebnis: { text: string; seiten: number };
  if (istPdf(name)) {
    const { extractPdfForChat } =
      await import("@/features/exposes/expose-import/extractPdfText");
    const pdf = await extractPdfForChat(datei);
    if (!pdf.pages.some((p) => p.text))
      throw new Error(
        `${name}: kein auslesbarer Text (Scan). Bitte als durchsuchbares PDF hochladen.`,
      );
    ergebnis = { text: pdf.modelContext, seiten: pdf.pages.length };
  } else if (istExcel(name)) ergebnis = await excelText(bytes);
  else if (istText(name)) ergebnis = klartext(bytes);
  else
    throw new Error(
      `${name}: Dateityp nicht unterstützt (PDF, Excel, CSV, Text, JPG, PNG).`,
    );
  const id = neueId();
  return {
    id,
    name,
    art: "unterlage",
    unterlage: { id, name, text: ergebnis.text, seiten: ergebnis.seiten },
    quelle: "upload",
  };
}

export function anhangAusOrdner(inhalt: {
  art: "text";
  name: string;
  text: string;
  seiten: number;
}): Anhang {
  const id = neueId();
  return {
    id,
    name: inhalt.name,
    art: "unterlage",
    unterlage: {
      id,
      name: inhalt.name,
      text: inhalt.text,
      seiten: inhalt.seiten,
    },
    quelle: "ordner",
  };
}

export async function bildAusOrdner(
  name: string,
  base64: string,
  mime: string,
): Promise<Anhang> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { bild, vorschau } = await bildVorbereiten(
    name,
    new Blob([bytes], { type: mime }),
  );
  return { id: neueId(), name, art: "bild", bild, vorschau, quelle: "ordner" };
}

const vorlagenCache = new Map<string, Uint8Array>();

async function vorlage(
  token: string,
  name:
    | "expose.pptx"
    | "einschaetzung.pptx"
    | "mietaufstellung.xlsx"
    | "kaufpreistool.xlsx",
): Promise<Uint8Array> {
  const treffer = vorlagenCache.get(name);
  if (treffer) return treffer;
  const { kiVorlageFn } = await import("./server-fn");
  const { base64 } = await kiVorlageFn({
    data: { supabaseAccessToken: token, name },
  });
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  vorlagenCache.set(name, bytes);
  return bytes;
}

const MIME = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function dateiname(
  praefix: string,
  ergebnis: ToolErgebnis,
  endung: "pptx" | "xlsx",
): string {
  const d = ergebnis.daten as {
    objekt?: { strasse: { wert: string | null } };
    objekte?: { bezeichnung: string }[];
  };
  const ort = d.objekt?.strasse.wert ?? d.objekte?.[0]?.bezeichnung ?? "Objekt";
  const sauber = ort.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  return `GrenzCo_${praefix}_${sauber}_${new Date().toISOString().slice(0, 10)}.${endung}`;
}

export async function dateiErstellen(
  token: string,
  ergebnis: ToolErgebnis,
  bilder: BildDatei[],
): Promise<{ daten: Uint8Array; name: string; mime: string }> {
  const tool: DateiToolId = ergebnis.tool;
  if (tool === "expose") {
    const { exposeErstellen } = await import("./dateien/powerpoint");
    const daten = await exposeErstellen(
      await vorlage(token, "expose.pptx"),
      ergebnis.daten as ToolErgebnis<"expose">["daten"],
      bilder,
    );
    return {
      daten,
      name: dateiname("Expose", ergebnis, "pptx"),
      mime: MIME.pptx,
    };
  }
  if (tool === "marktpreis") {
    const { einschaetzungErstellen } = await import("./dateien/powerpoint");
    const daten = await einschaetzungErstellen(
      await vorlage(token, "einschaetzung.pptx"),
      ergebnis.daten as ToolErgebnis<"marktpreis">["daten"],
      bilder,
    );
    return {
      daten,
      name: dateiname("Einschaetzung", ergebnis, "pptx"),
      mime: MIME.pptx,
    };
  }
  const excel = await import("./dateien/excel");
  if (tool === "mieterliste") {
    const daten = await excel.mietaufstellungErstellen(
      await vorlage(token, "mietaufstellung.xlsx"),
      ergebnis.daten as ToolErgebnis<"mieterliste">["daten"],
    );
    return {
      daten,
      name: dateiname("Mietaufstellung", ergebnis, "xlsx"),
      mime: MIME.xlsx,
    };
  }
  if (tool === "kaufpreis") {
    const daten = await excel.kaufpreistoolErstellen(
      await vorlage(token, "kaufpreistool.xlsx"),
      ergebnis.daten as ToolErgebnis<"kaufpreis">["daten"],
    );
    return {
      daten,
      name: dateiname("Kaufpreistool", ergebnis, "xlsx"),
      mime: MIME.xlsx,
    };
  }
  const daten = await excel.dcfErstellen(
    await vorlage(token, "mietaufstellung.xlsx"),
    ergebnis.daten as ToolErgebnis<"dcf">["daten"],
  );
  return { daten, name: dateiname("DCF", ergebnis, "xlsx"), mime: MIME.xlsx };
}

export function herunterladen(datei: {
  daten: Uint8Array;
  name: string;
  mime: string;
}): void {
  const url = URL.createObjectURL(
    new Blob([datei.daten as BlobPart], { type: datei.mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = datei.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
