/**
 * KI-Bausteine des Exposé-Generators. Ergebnisse sind Vorschläge, die der Nutzer übernimmt.
 * Belege aus Unterlagen zählen nur, wenn das Zitat wörtlich auf der genannten Seite steht.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { Quelle } from "@/lib/vorlagen/typen";

import {
  FELD_IDS,
  FELDER,
  zitatAufSeite,
  type Aussage,
  type ExposeInhalt,
  type ExposeTyp,
  type FeldId,
  type TextAbschnitt,
  type Unterlage,
} from "./modell";

const MODELL = "claude-opus-5-5";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

async function jsonAntwort<T>(params: {
  system: string;
  text: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<T> {
  const antwort = await client().messages.create({
    model: MODELL,
    max_tokens: params.maxTokens,
    system: params.system,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: params.schema },
    },
    messages: [{ role: "user", content: params.text }],
  });
  if (antwort.stop_reason === "refusal")
    throw new Error("Die KI hat die Anfrage abgelehnt.");
  if (antwort.stop_reason === "max_tokens")
    throw new Error("Die KI-Antwort war zu lang. Bitte erneut versuchen.");
  const block = antwort.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("Die KI hat keinen Text geliefert.");
  return JSON.parse(block.text) as T;
}

const ohneStriche = (s: string) => s.replace(/\s*[–—]\s*/g, ", ").trim();

export type FeldVorschlag = { feld: FeldId; wert: string; quelle: Quelle };

/** Liest Pflichtangaben (Energieausweis, Flächen, Mieten …) mit Seite und Zitat aus einer Unterlage. */
export async function unterlageAuswerten(
  unterlage: Unterlage,
): Promise<{ vorschlaege: FeldVorschlag[]; verworfen: number }> {
  const schema = {
    type: "object",
    properties: {
      angaben: {
        type: "array",
        items: {
          type: "object",
          properties: {
            feld: { type: "string", enum: FELD_IDS },
            wert: { type: "string" },
            seite: { type: "integer" },
            zitat: { type: "string" },
          },
          required: ["feld", "wert", "seite", "zitat"],
          additionalProperties: false,
        },
      },
    },
    required: ["angaben"],
    additionalProperties: false,
  };
  const feldliste = FELDER.map((f) => `${f.id}: ${f.label}`).join("\n");
  const roh = await jsonAntwort<{
    angaben: { feld: FeldId; wert: string; seite: number; zitat: string }[];
  }>({
    system: `Du liest Objektunterlagen (Energieausweis, Mieterliste, Flächenaufstellung, Grundbuch, Exposé) für ein Maklerhaus.
Extrahiere nur Angaben, die wörtlich in der Unterlage stehen. Für jede Angabe: Feld, Wert (knapp, deutsche Schreibweise), Seitennummer aus der Markierung <<<PAGE n>>> und ein wörtliches Zitat von 3 bis 20 Wörtern aus genau dieser Seite, das den Wert belegt.
Summen (z. B. Jahresmiete aus einer Mieterliste) nur, wenn die Summe selbst in der Unterlage steht. Nichts schätzen, nichts berechnen. Felder ohne Beleg weglassen.
Felder:
${feldliste}`,
    text: `<unterlage name="${unterlage.name}">\n${unterlage.text.slice(0, 180_000)}\n</unterlage>`,
    schema,
    maxTokens: 4000,
  });
  const vorschlaege: FeldVorschlag[] = [];
  let verworfen = 0;
  for (const a of roh.angaben) {
    if (
      !FELD_IDS.includes(a.feld) ||
      !a.wert.trim() ||
      !zitatAufSeite(unterlage.text, a.seite, a.zitat)
    ) {
      verworfen += 1;
      continue;
    }
    vorschlaege.push({
      feld: a.feld,
      wert: ohneStriche(a.wert),
      quelle: {
        id: `dok:${unterlage.id}:${a.seite}:${a.feld}`,
        art: "dokument",
        bezeichnung: unterlage.name,
        verweis: unterlage.id,
        seite: a.seite,
        zitat: a.zitat.trim(),
      },
    });
  }
  return { vorschlaege, verworfen };
}

const ABSCHNITTE: TextAbschnitt[] = ["objekt", "lage", "investment"];

/**
 * Entwurf für Objektbeschreibung, Lage und Investment-Summary. Belege sind Felder („feld:<id>“)
 * oder Zitate aus Unterlagen; alles andere wird verworfen und als Lücke gemeldet.
 */
export async function texteEntwerfen(
  typ: ExposeTyp,
  inhalt: ExposeInhalt,
): Promise<{
  texte: Partial<Record<TextAbschnitt, Aussage[]>>;
  belege: Quelle[];
  luecken: string[];
}> {
  const belegteFelder = (
    Object.entries(inhalt.felder) as [FeldId, ExposeInhalt["felder"][FeldId]][]
  ).filter(([, w]) => w?.wert && w.quelle);
  const felderText = belegteFelder
    .map(([id, w]) => `feld:${id} = ${w!.wert}`)
    .join("\n");
  const unterlagenText = inhalt.unterlagen
    .map(
      (u) =>
        `<unterlage id="${u.id}" name="${u.name}">\n${u.text.slice(0, 60_000)}\n</unterlage>`,
    )
    .join("\n\n");
  const schema = {
    type: "object",
    properties: {
      aussagen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            abschnitt: {
              type: "string",
              enum: typ === "teaser" ? ["objekt", "investment"] : ABSCHNITTE,
            },
            text: { type: "string" },
            felder: { type: "array", items: { type: "string" } },
            zitate: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  unterlage: { type: "string" },
                  seite: { type: "integer" },
                  zitat: { type: "string" },
                },
                required: ["unterlage", "seite", "zitat"],
                additionalProperties: false,
              },
            },
          },
          required: ["abschnitt", "text", "felder", "zitate"],
          additionalProperties: false,
        },
      },
      luecken: { type: "array", items: { type: "string" } },
    },
    required: ["aussagen", "luecken"],
    additionalProperties: false,
  };

  const roh = await jsonAntwort<{
    aussagen: {
      abschnitt: TextAbschnitt;
      text: string;
      felder: string[];
      zitate: { unterlage: string; seite: number; zitat: string }[];
    }[];
    luecken: string[];
  }>({
    system: `Du schreibst für das Maklerhaus Grenz & Co. (Köln) Texte für ein${typ === "teaser" ? "en anonymisierten Teaser" : " Exposé"} an professionelle Investoren.
Regeln:
- Jede Aussage stützt sich auf belegte Felder (Angabe der Feld-Ids wie "feld:baujahr") und/oder wörtliche Zitate aus den Unterlagen (Unterlagen-Id, Seite aus <<<PAGE n>>>, Zitat 3 bis 20 Wörter).
- Keine Aussage ohne Beleg. Keine allgemeinen Lagefloskeln, keine Superlative, nichts schätzen.
- Fehlt für ein Thema der Beleg (z. B. Lage, Zustand, Mieterstruktur), schreibe es in "luecken".
${typ === "teaser" ? "- Teaser: keine Adresse, keine Hausnummer, keine Namen von Mietern oder Eigentümern.\n" : ""}- Sachlich, präzise, Deutsch, kurze Sätze. Je Abschnitt höchstens 5 Aussagen.
- Keine Gedankenstriche (– oder —).`,
    text: `<felder>\n${felderText || "(keine belegten Felder)"}\n</felder>\n\n${unterlagenText}`,
    schema,
    maxTokens: 6000,
  });

  const texte: Partial<Record<TextAbschnitt, Aussage[]>> = {};
  const belege: Quelle[] = [];
  const luecken = roh.luecken.map(ohneStriche);
  const feldOk = new Set(belegteFelder.map(([id]) => `feld:${id}`));
  for (const a of roh.aussagen) {
    const ids = a.felder.filter((f) => feldOk.has(f));
    for (const z of a.zitate) {
      const u = inhalt.unterlagen.find((x) => x.id === z.unterlage);
      if (!u || !zitatAufSeite(u.text, z.seite, z.zitat)) continue;
      const id = `dok:${u.id}:${z.seite}:${belege.length}`;
      belege.push({
        id,
        art: "dokument",
        bezeichnung: u.name,
        verweis: u.id,
        seite: z.seite,
        zitat: z.zitat.trim(),
      });
      ids.push(id);
    }
    if (!ids.length) {
      luecken.push(`Ohne Beleg verworfen: ${ohneStriche(a.text)}`);
      continue;
    }
    (texte[a.abschnitt] ??= []).push({
      text: ohneStriche(a.text),
      quellen: ids,
    });
  }
  return { texte, belege, luecken };
}
