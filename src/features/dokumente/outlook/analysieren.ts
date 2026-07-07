import { analyzeDokumentFn } from "./analyze-fn";
import { dokumenteApi } from "@/api/dokumente";
import { einstellungenApi } from "@/api/einstellungen";
import { verwaltungApi } from "@/api/verwaltung";
import type { AnalyzeDokumentResponse } from "@/lib/email-ai";

import { fetchMessageForAnalysis, parseMessageId } from "./graph";
import type { OutlookMessageSummary, PosteingangAnalyseStatus } from "./types";

const ANALYZE_API = "/api/analyze-dokument";

async function callAnalyzeApi(
  body: Record<string, unknown>,
): Promise<AnalyzeDokumentResponse> {
  const res = await fetch(ANALYZE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    return (await res.json()) as AnalyzeDokumentResponse;
  }

  if (res.status === 404 || res.status === 405) {
    return analyzeDokumentFn({ data: body as never });
  }

  let message = `KI-Analyse fehlgeschlagen (${res.status})`;
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) message = json.error;
  } catch {
    /* ignore */
  }
  throw new Error(message);
}

export async function analysiereNachricht(
  message: OutlookMessageSummary,
  options: { force?: boolean } = {},
): Promise<PosteingangAnalyseStatus> {
  if (!options.force) {
    const existing = await dokumenteApi.getPosteingangStatus(message.id);
    if (existing && existing.status !== "neu") {
      return existing;
    }
  }

  const detail = await fetchMessageForAnalysis(message.id);
  const { accountId, graphId } = parseMessageId(message.id);

  const [kategorien, mandanten, objekte] = await Promise.all([
    dokumenteApi.listKategorien(),
    einstellungenApi.listMandanten(),
    verwaltungApi.listObjekte(),
  ]);

  const ergebnis = await callAnalyzeApi({
    subject: detail.subject,
    from: detail.from,
    text: detail.text,
    attachments: detail.attachments,
    kategorien: kategorien.items.map((k) => ({
      id: k.id,
      name: k.name,
      beschreibung: k.beschreibung,
    })),
    mandanten: mandanten.items.map((m) => ({
      id: m.id,
      name: m.name,
      kuerzel: m.kuerzel,
    })),
    objekte: objekte.items.map((o) => ({
      id: o.id,
      bezeichnung: o.bezeichnung,
      mandantId: o.mandantId,
      adresse: `${o.adresse.strasse}, ${o.adresse.plz} ${o.adresse.ort}`,
    })),
  });

  return dokumenteApi.savePosteingangAnalyse({
    nachrichtId: message.id,
    outlookAccountId: accountId,
    graphNachrichtId: graphId,
    betreff: detail.subject,
    absender: message.from,
    absenderMail: message.senderMail,
    eingegangenAm: message.receivedAt,
    anhangName: detail.anhangName,
    anhangContentType: detail.anhangContentType,
    emailText: detail.text,
    kategorieId: ergebnis.kategorieId,
    mandantId: ergebnis.mandantId,
    objektId: ergebnis.objektId,
    dateiname: ergebnis.dateiname,
    konfidenz: ergebnis.konfidenz,
  });
}
