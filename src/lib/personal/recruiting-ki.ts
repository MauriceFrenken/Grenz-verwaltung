/** KI-Entwurf einer Stellenanzeige. Server-only. */

import Anthropic from "@anthropic-ai/sdk";

import type { AnzeigenEntwurf, Stelle } from "./recruiting";
import { VERTRAGSARTEN } from "./typen";

const MODELL = "claude-opus-5-5";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

const SCHEMA = {
  type: "object",
  properties: {
    titel: { type: "string" },
    einleitung: { type: "string" },
    aufgaben: { type: "array", items: { type: "string" } },
    profil: { type: "array", items: { type: "string" } },
    angebot: { type: "array", items: { type: "string" } },
    abschluss: { type: "string" },
  },
  required: [
    "titel",
    "einleitung",
    "aufgaben",
    "profil",
    "angebot",
    "abschluss",
  ],
  additionalProperties: false,
} as const;

const SYSTEM = `Du schreibst Stellenanzeigen für Grenz & Co. Immobilienberatungs-GmbH, eine inhabergeführte Investmentmaklerin für Zinshäuser, Mehrfamilienhäuser und Wohn- und Geschäftshäuser von 1 bis 15 Mio. € im Rheinland, mit Büros in Köln und Düsseldorf.
Regeln:
- Deutsch, Du-Ansprache, klar und konkret, ohne Floskeln und ohne Gedankenstriche.
- Titel immer mit „(m/w/d)“. Keine Angaben zu Alter, Geschlecht, Herkunft, Familienstand oder Muttersprache (AGG); statt „junges Team“ z. B. „kleines Team“.
- Nur Fakten aus den Angaben verwenden. Fehlt etwas (Gehalt, Benefits), nichts erfinden, sondern allgemein und ehrlich bleiben.
- Je Liste 4 bis 7 Punkte, jeder Punkt ein kurzer Satz.
- Abschluss: wie man sich bewirbt (Unterlagen per E-Mail, Ansprechpartner Geschäftsführung), Hinweis auf frühesten Starttermin, falls angegeben.`;

function punkte(liste: string[]): string {
  return liste
    .map((p) => `- ${p.replace(/\s*[–—]\s*/g, ", ").trim()}`)
    .join("\n");
}

export async function anzeigeEntwerfen(
  s: Partial<Stelle>,
): Promise<AnzeigenEntwurf> {
  const angaben = [
    `Stelle: ${s.titel}`,
    s.standort ? `Standort: ${s.standort}` : null,
    s.vertragsart ? `Vertragsart: ${VERTRAGSARTEN[s.vertragsart]}` : null,
    s.wochenstunden ? `Wochenstunden: ${s.wochenstunden}` : null,
    s.startAb ? `Start ab: ${s.startAb}` : null,
    s.aufgaben ? `Aufgaben (Stichworte):\n${s.aufgaben}` : null,
    s.anforderungen ? `Anforderungen (Stichworte):\n${s.anforderungen}` : null,
    s.angebot ? `Was wir bieten (Stichworte):\n${s.angebot}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const antwort = await client().messages.create({
    model: MODELL,
    max_tokens: 3000,
    system: SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `<angaben>\n${angaben}\n</angaben>\n\nSchreibe die Stellenanzeige als JSON.`,
      },
    ],
  });
  if (antwort.stop_reason === "refusal")
    throw new Error("Die KI hat die Anfrage abgelehnt.");
  const block = antwort.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("Die KI hat keinen Text geliefert.");
  const r = JSON.parse(block.text) as {
    titel: string;
    einleitung: string;
    aufgaben: string[];
    profil: string[];
    angebot: string[];
    abschluss: string;
  };
  const text = [
    r.titel,
    r.einleitung,
    `Deine Aufgaben\n${punkte(r.aufgaben)}`,
    `Das bringst du mit\n${punkte(r.profil)}`,
    `Das bieten wir\n${punkte(r.angebot)}`,
    r.abschluss,
  ].join("\n\n");
  return { titel: r.titel, text };
}
