/** Serverseitig: Vermarktungsbericht als PDF oder PowerPoint erzeugen (Fotos aus dem Storage). */

import type { SupabaseClient } from "@supabase/supabase-js";

import { dateinameAus, type DateiFormat } from "@/lib/vorlagen/export";

import type { BerichtFoto } from "./bericht-pptx";
import type { ReportKennzahlen, ReportTexte } from "./report";
import { berichtStand } from "./vermarktungsbericht";

export const FOTO_BUCKET = "dokumente";

/** Breite und Höhe aus dem JPEG- oder PNG-Kopf (für den Bildzuschnitt in PowerPoint). */
export function bildGroesse(
  buf: Buffer,
): { breite: number; hoehe: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47)
    return { breite: buf.readUInt32BE(16), hoehe: buf.readUInt32BE(20) };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    const laenge = buf.readUInt16BE(i + 2);
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    )
      return {
        hoehe: buf.readUInt16BE(i + 5),
        breite: buf.readUInt16BE(i + 7),
      };
    i += 2 + laenge;
  }
  return null;
}

async function ladeFoto(
  admin: SupabaseClient,
  pfad: string | null | undefined,
): Promise<BerichtFoto | null> {
  if (!pfad) return null;
  const { data, error } = await admin.storage.from(FOTO_BUCKET).download(pfad);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const groesse = bildGroesse(buf);
  if (!groesse) return null;
  const mime = buf[0] === 0x89 ? "image/png" : "image/jpeg";
  // pptxgenjs rechnet den Zuschnitt aus den Bildmaßen; Zoll-Werte reichen als Seitenverhältnis.
  return {
    dataUri: `data:${mime};base64,${buf.toString("base64")}`,
    breite: groesse.breite / 100,
    hoehe: groesse.hoehe / 100,
  };
}

export async function berichtDatei(
  admin: SupabaseClient,
  report: {
    kennzahlen: ReportKennzahlen;
    texte: ReportTexte;
    status: string;
  },
  format: DateiFormat,
): Promise<{ datei: Buffer; dateiname: string; mime: string }> {
  const stand = berichtStand(report.kennzahlen, report.texte, {
    freigegeben: report.status !== "entwurf",
  });
  const [titel, objekt] = await Promise.all([
    ladeFoto(admin, report.texte.fotos?.titel),
    ladeFoto(admin, report.texte.fotos?.objekt),
  ]);
  const name = `${stand.titel} ${stand.objektanschrift}`;
  if (format === "pptx") {
    const { berichtAlsPptx } = await import("./bericht-pptx");
    return {
      datei: await berichtAlsPptx(stand, { titel, objekt }),
      dateiname: dateinameAus(name, "pptx"),
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
  }
  const { berichtAlsPdf } = await import("./bericht-pdf");
  return {
    datei: await berichtAlsPdf(stand, { titel, objekt }),
    dateiname: dateinameAus(name, "pdf"),
    mime: "application/pdf",
  };
}
