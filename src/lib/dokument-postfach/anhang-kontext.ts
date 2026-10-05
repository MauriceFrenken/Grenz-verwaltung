/**
 * Anhang + Mail-Kontext für KI-Analyse aufbereiten. Server-only.
 */
import type { DokumentVisionBlock } from "@/lib/dokument-ai";
import {
  KI_MAX_DOKUMENT_ZEICHEN,
  KI_MAX_MAIL_ZEICHEN,
  KI_MAX_VISION_PAYLOAD_BYTES,
  istDokumentTextAusreichendFuerKi,
  kuerzeTextFuerKi,
  nutzbarerDokumentText,
} from "@/lib/ki-kontext";
import { extrahiereAnhangText } from "@/lib/postfach/anhang-text";
import { bereitePdfScanFuerKi } from "@/lib/postfach/pdf-scan-vision";
import {
  bildMediaType,
  istBildDatei,
  istPdfDatei,
} from "@/lib/postfach/dateityp";

export type AnhangAnalyseKontext = {
  titel: string;
  mailKontext: string;
  modelContext: string;
  vision: DokumentVisionBlock[];
  /** true = Scan/Bild-Pfad — Objekt-Matching darf KI-Felder nutzen. */
  istScanVision: boolean;
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
    zeilen.push(
      `E-Mail-Text:\n${kuerzeTextFuerKi(mail.emailText, KI_MAX_MAIL_ZEICHEN)}`,
    );
  }
  return zeilen.join("\n");
}

export async function baueAnhangAnalyseKontext(input: {
  name: string;
  contentType: string | null;
  bytes: Uint8Array;
  mail: MailKontextQuelle;
  /** Hinweis zu bereits analysierten Anhängen derselben Mail. */
  geschwisterHinweis?: string | null;
}): Promise<AnhangAnalyseKontext> {
  const titel = input.name.trim() || "Dokument";
  const mailKontext = baueMailKontext(input.mail);
  const metaZeilen = [
    `Dateiname: ${titel}`,
    input.contentType ? `Dateityp: ${input.contentType}` : null,
  ].filter(Boolean);

  const bytes = new Uint8Array(input.bytes);
  const istPdf = istPdfDatei(titel, input.contentType);
  const quellBytes = new Uint8Array(input.bytes);

  const extraktion = await extrahiereAnhangText({
    name: titel,
    contentType: input.contentType,
    bytes,
  });

  const extrahierterText = extraktion.text.trim();
  const nutzbarerText = nutzbarerDokumentText(extrahierterText);
  // Nur echter Inhalt zählt — Platzhalter „(kein extrahierbarer Text…)“ nicht.
  const textAusreichend = istDokumentTextAusreichendFuerKi(extrahierterText);
  let vision: DokumentVisionBlock[] = [];
  let scanHinweis: string | null = null;

  if (textAusreichend) {
    // Digitaler Text-PDF — unverändert ohne Vision.
  } else if (istPdf) {
    const scan = await bereitePdfScanFuerKi(quellBytes);
    vision = scan.vision;
    scanHinweis = scan.hinweis;
  } else if (
    istBildDatei(titel, input.contentType) &&
    quellBytes.byteLength <= KI_MAX_VISION_PAYLOAD_BYTES
  ) {
    vision.push({
      art: "image",
      mediaType: bildMediaType(titel, input.contentType),
      base64: bytesZuBase64(quellBytes),
    });
  }

  const istScanVision = vision.length > 0;

  const dokumentTextHinweis = (() => {
    // Text-PDF: voller Kontext inkl. Seitenmarker (wie bisher).
    if (textAusreichend && extrahierterText) {
      return `Extrahierter Dokumenttext:\n${kuerzeTextFuerKi(
        extrahierterText,
        KI_MAX_DOKUMENT_ZEICHEN,
      )}`;
    }
    // Scan mit wenig Resttext: nur den nutzbaren Anteil, keine Leerseiten-Platzhalter.
    if (istScanVision && nutzbarerText) {
      return `Extrahierter Dokumenttext (teilweise):\n${kuerzeTextFuerKi(
        nutzbarerText,
        KI_MAX_DOKUMENT_ZEICHEN,
      )}`;
    }
    if (istScanVision) {
      return null;
    }
    if (istBildDatei(titel, input.contentType)) {
      return "Hinweis: Bild zu groß für die Analyse — nutze Mail- und Dateimetadaten.";
    }
    return "Hinweis: Kein Text extrahierbar — nutze Mail- und Dateimetadaten.";
  })();

  const visionHinweis = (() => {
    if (scanHinweis) return scanHinweis;
    if (!vision.length) return null;
    if (istBildDatei(titel, input.contentType)) {
      return "Hinweis: Bild-Anhang — Inhalt im angehängten Bild.";
    }
    return null;
  })();

  // Mail bewusst NICHT in modelContext — wird separat als mailKontext
  // an die KI übergeben (spart Vision-Token-Budget, kein Doppeltext).
  const modelContext = [
    ...metaZeilen,
    dokumentTextHinweis,
    visionHinweis,
    input.geschwisterHinweis?.trim()
      ? `=== ANDERE ANHÄNGE DIESER MAIL ===\n${input.geschwisterHinweis.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { titel, mailKontext, modelContext, vision, istScanVision };
}
