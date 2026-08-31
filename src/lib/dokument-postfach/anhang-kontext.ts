/**
 * Anhang + Mail-Kontext für KI-Analyse aufbereiten. Server-only.
 */
import type { DokumentVisionBlock } from "@/lib/dokument-ai";
import { extrahierePdfText } from "@/lib/postfach/pdf-text";

const MIN_PDF_TEXT_ZEICHEN = 60;
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

function istPdf(name: string, contentType: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  const n = name.toLowerCase();
  return ct.includes("pdf") || n.endsWith(".pdf");
}

function istBild(name: string, contentType: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  const n = name.toLowerCase();
  return (
    ct.startsWith("image/") || /\.(jpe?g|png|gif|webp|tiff?|bmp)$/i.test(n)
  );
}

function bildMediaType(name: string, contentType: string | null): string {
  const ct = (contentType ?? "").trim().toLowerCase();
  if (ct.startsWith("image/")) return ct;
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".tif") || n.endsWith(".tiff")) return "image/tiff";
  if (n.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

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

  if (istPdf(titel, input.contentType)) {
    let pdfText = "";
    try {
      const pdf = await extrahierePdfText(input.bytes);
      pdfText = pdf.modelContext.trim();
    } catch {
      pdfText = "";
    }

    const vision: DokumentVisionBlock[] = [];
    if (pdfText.length < MIN_PDF_TEXT_ZEICHEN && input.bytes.byteLength <= MAX_VISION_BYTES) {
      vision.push({ art: "pdf", base64: bytesZuBase64(input.bytes) });
    }

    const modelContext = [
      ...metaZeilen,
      mailKontext,
      pdfText ? `Extrahierter Dokumenttext:\n${pdfText}` : null,
      vision.length > 0
        ? "Hinweis: PDF enthält wenig Text — Inhalt liegt als Scan/Bild vor (siehe angehängtes PDF)."
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    return { titel, mailKontext, modelContext, vision };
  }

  if (istBild(titel, input.contentType) && input.bytes.byteLength <= MAX_VISION_BYTES) {
    const modelContext = [
      ...metaZeilen,
      mailKontext,
      "Hinweis: Bild-Anhang — Inhalt im angehängten Bild.",
    ].join("\n\n");

    return {
      titel,
      mailKontext,
      modelContext,
      vision: [
        {
          art: "image",
          mediaType: bildMediaType(titel, input.contentType),
          base64: bytesZuBase64(input.bytes),
        },
      ],
    };
  }

  const modelContext = [
    ...metaZeilen,
    mailKontext,
    "Hinweis: Dateityp ohne Textextraktion — nutze Mail- und Dateimetadaten für die Zuordnung.",
  ].join("\n\n");

  return { titel, mailKontext, modelContext, vision: [] };
}
