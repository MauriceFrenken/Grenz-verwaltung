/**
 * Anhang + Mail-Kontext für KI-Analyse aufbereiten. Server-only.
 */
import type { DokumentVisionBlock } from "@/lib/dokument-ai";
import { extrahiereAnhangText } from "@/lib/postfach/anhang-text";
import {
  bildMediaType,
  istBildDatei,
  istPdfDatei,
} from "@/lib/postfach/dateityp";

const MAX_VISION_BYTES = 20 * 1024 * 1024;

export type AnhangAnalyseKontext = {
  titel: string;
  mailKontext: string;
  modelContext: string;
  vision: DokumentVisionBlock[];
};

export type MailKontextQuelle = {
  betreff?: string | null;
  absenderName?: string | null;
  absenderMail?: string | null;
  emailText?: string | null;
};

function bytesZuBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function baueMailKontext(mail: MailKontextQuelle): string {
  const zeilen: string[] = [];
  if (mail.betreff?.trim()) zeilen.push(`Betreff: ${mail.betreff.trim()}`);
  if (mail.absenderName?.trim() || mail.absenderMail?.trim()) {
    zeilen.push(
      `Absender: ${[mail.absenderName?.trim(), mail.absenderMail?.trim()].filter(Boolean).join(" · ")}`,
    );
  }
  if (mail.emailText?.trim()) {
    zeilen.push(`E-Mail-Text:\n${mail.emailText.trim()}`);
  }
  return zeilen.join("\n");
}

export async function baueAnhangAnalyseKontext(input: {
  name: string;
  contentType: string | null;
  bytes: Uint8Array;
  mail: MailKontextQuelle;
}): Promise<AnhangAnalyseKontext> {
  const titel = input.name.trim() || "Dokument";
  const mailKontext = baueMailKontext(input.mail);
  const metaZeilen = [
    `Dateiname: ${titel}`,
    input.contentType ? `Dateityp: ${input.contentType}` : null,
  ].filter(Boolean);

  const extraktion = await extrahiereAnhangText({
    name: titel,
    contentType: input.contentType,
    bytes: input.bytes,
  });

  const vision: DokumentVisionBlock[] = [];
  const visionMoeglich = input.bytes.byteLength <= MAX_VISION_BYTES;

  if (istPdfDatei(titel, input.contentType) && visionMoeglich) {
    vision.push({ art: "pdf", base64: bytesZuBase64(input.bytes) });
  } else if (istBildDatei(titel, input.contentType) && visionMoeglich) {
    vision.push({
      art: "image",
      mediaType: bildMediaType(titel, input.contentType),
      base64: bytesZuBase64(input.bytes),
    });
  }

  const dokumentTextHinweis = (() => {
    if (extraktion.text) {
      return `Extrahierter Dokumenttext:\n${extraktion.text}`;
    }
    if (vision.length > 0) {
      return null;
    }
    return "Hinweis: Kein Text extrahierbar — nutze Mail- und Dateimetadaten.";
  })();

  const visionHinweis = (() => {
    if (!vision.length) return null;
    if (istPdfDatei(titel, input.contentType)) {
      return "Hinweis: PDF liegt zusätzlich als ganzes Dokument bei (auch für Scans und eingescannte Seiten).";
    }
    if (istBildDatei(titel, input.contentType)) {
      return "Hinweis: Bild-Anhang — Inhalt im angehängten Bild.";
    }
    return null;
  })();

  const modelContext = [
    ...metaZeilen,
    mailKontext,
    dokumentTextHinweis,
    visionHinweis,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { titel, mailKontext, modelContext, vision };
}
