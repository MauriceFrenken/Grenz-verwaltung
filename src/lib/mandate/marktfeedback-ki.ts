/**
 * KI-Entwurf „Marktfeedback“ für den Eigentümer-Report. Jede Aussage muss eine oder mehrere
 * Salesforce-Aktivitäten als Beleg nennen; Aussagen ohne gültigen Beleg werden verworfen und als
 * Lücke ausgewiesen. Ergebnis ist immer ein Entwurf, freigeben kann nur ein Nutzer.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { AktivitaetZeile, MitgliedZeile, ReportTexte } from "./report";

const MODELL = "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    aussagen: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          quellen: { type: "array", items: { type: "string" } },
        },
        required: ["text", "quellen"],
        additionalProperties: false,
      },
    },
    luecken: { type: "array", items: { type: "string" } },
  },
  required: ["aussagen", "luecken"],
  additionalProperties: false,
} as const;

const SYSTEM = `Du schreibst für das Maklerhaus Grenz & Co. (Köln) den Abschnitt „Marktfeedback“ eines Vermarktungsberichts an den Eigentümer.
Regeln:
- Nutze ausschließlich die gelieferten Aktivitäten und Rückmeldungen. Erfinde nichts, keine allgemeinen Marktaussagen.
- Jede Aussage nennt in "quellen" die IDs der Aktivitäten oder Kampagnenmitglieder, auf die sie sich stützt. Nur IDs aus den Daten.
- Fasse zusammen: Wie reagieren Investoren auf Preis, Lage, Zustand, Unterlagen? Gründe für Absagen? Offene Fragen?
- Keine Namen von Investoren nennen, nur Investorentyp oder "ein Interessent".
- Sachlich, freundlich, kurz. Deutsch. Höchstens 6 Aussagen, je ein bis zwei Sätze.
- Keine Gedankenstriche (– oder —) verwenden.
- Wenn die Daten zu einem Thema (z. B. Preis) nichts hergeben, schreibe das als Eintrag in "luecken", nicht als Aussage.`;

function kuerzen(text: unknown, max: number): string {
  if (typeof text !== "string") return "";
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export type MarktfeedbackEingabe = {
  objekt: string;
  aktivitaeten: AktivitaetZeile[];
  mitglieder: MitgliedZeile[];
};

export function marktfeedbackKontext(e: MarktfeedbackEingabe): {
  text: string;
  ids: Set<string>;
} {
  const ids = new Set<string>();
  const zeilen: string[] = [
    `Objekt: ${e.objekt}`,
    "",
    "Aktivitäten (neueste zuerst):",
  ];
  const akt = [...e.aktivitaeten]
    .sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? ""))
    .slice(0, 150);
  for (const a of akt) {
    ids.add(a.sf_id);
    const beschreibung = kuerzen(
      a.sf_daten?.Description ?? a.sf_daten?.TextBody,
      600,
    );
    zeilen.push(
      `[${a.sf_id}] ${a.datum?.slice(0, 10) ?? "ohne Datum"} ${a.art ?? ""}: ${kuerzen(a.betreff, 160)}${beschreibung ? ` | ${beschreibung}` : ""}`,
    );
  }
  zeilen.push("", "Rückmeldungen aus Kampagnen:");
  for (const m of e.mitglieder) {
    const notiz = kuerzen(m.sf_daten?.Notizen_Kaufangebot__c, 400);
    if (!m.status && !notiz) continue;
    if (/^geplant/i.test(m.status ?? "")) continue;
    ids.add(m.sf_id);
    zeilen.push(
      `[${m.sf_id}] Status ${m.status ?? "unbekannt"}${notiz ? ` | Notiz: ${notiz}` : ""}`,
    );
  }
  return { text: zeilen.join("\n"), ids };
}

export async function marktfeedbackEntwurf(
  e: MarktfeedbackEingabe,
): Promise<Pick<ReportTexte, "marktfeedback" | "marktfeedbackLuecken">> {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  const { text, ids } = marktfeedbackKontext(e);
  if (!ids.size) {
    return {
      marktfeedback: [],
      marktfeedbackLuecken: [
        "Keine Aktivitäten oder Rückmeldungen in Salesforce, aus denen sich Marktfeedback ableiten lässt.",
      ],
    };
  }

  const client = new Anthropic();
  const antwort = await client.messages.create({
    model: MODELL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `<daten>\n${text}\n</daten>\n\nSchreibe das Marktfeedback als JSON.`,
      },
    ],
  });
  if (antwort.stop_reason === "refusal")
    throw new Error(
      "Die KI hat den Entwurf abgelehnt. Bitte Marktfeedback von Hand erfassen.",
    );
  if (antwort.stop_reason === "max_tokens")
    throw new Error(
      "Der KI-Entwurf war zu lang und wurde abgebrochen. Bitte erneut versuchen.",
    );
  const block = antwort.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("Die KI hat keinen Text geliefert.");

  const roh = JSON.parse(block.text) as {
    aussagen: { text: string; quellen: string[] }[];
    luecken: string[];
  };
  const ohneStriche = (s: string) => s.replace(/\s*[–—]\s*/g, ", ");
  const marktfeedback: { text: string; quellen: string[] }[] = [];
  const luecken = roh.luecken.map(ohneStriche);
  for (const a of roh.aussagen) {
    const belege = a.quellen.filter((id) => ids.has(id));
    if (belege.length)
      marktfeedback.push({ text: ohneStriche(a.text), quellen: belege });
    else luecken.push(`Ohne Beleg verworfen: ${ohneStriche(a.text)}`);
  }
  return { marktfeedback, marktfeedbackLuecken: luecken };
}
