/** Serverseitig: Dokument als Datei erzeugen, wahlweise PDF oder PPTX, als Base64 für den Download. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ladeLogo, ladeVorlage } from "./laden";
import { abschnitteNachVorlage } from "./standard";
import type { DokumentInhalt } from "./typen";

export type DateiFormat = "pdf" | "pptx";

export type DateiErgebnis = { dateiname: string; mime: string; base64: string };

export function dateinameAus(titel: string, format: DateiFormat): string {
  const basis = titel
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `${new Date().toISOString().slice(0, 10)}_${basis || "Dokument"}.${format}`;
}

export async function dokumentErzeugen(
  admin: SupabaseClient,
  inhalt: DokumentInhalt,
  format: DateiFormat,
): Promise<{ datei: Buffer; dateiname: string; mime: string }> {
  const vorlage = await ladeVorlage(admin, inhalt.typ);
  const logo = await ladeLogo(admin, vorlage);
  const geordnet: DokumentInhalt = {
    ...inhalt,
    abschnitte: abschnitteNachVorlage(inhalt.abschnitte, vorlage),
  };
  if (format === "pptx") {
    const { dokumentAlsPptx } = await import("./pptx");
    return {
      datei: await dokumentAlsPptx(geordnet, vorlage, logo),
      dateiname: dateinameAus(inhalt.titel, "pptx"),
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
  }
  const { dokumentAlsPdf } = await import("./pdf");
  return {
    datei: await dokumentAlsPdf(geordnet, vorlage, logo),
    dateiname: dateinameAus(inhalt.titel, "pdf"),
    mime: "application/pdf",
  };
}

export async function dokumentAlsDownload(
  admin: SupabaseClient,
  inhalt: DokumentInhalt,
  format: DateiFormat,
): Promise<DateiErgebnis> {
  const { datei, dateiname, mime } = await dokumentErzeugen(
    admin,
    inhalt,
    format,
  );
  return { dateiname, mime, base64: datei.toString("base64") };
}
