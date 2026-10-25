/**
 * Objektsteckbrief aus den Unterlagen im OneDrive-Ordner eines Mandats. Server-only.
 * Jede Angabe braucht ein wörtliches Zitat, das serverseitig auf der genannten Seite
 * (bzw. dem Tabellenblatt) gefunden werden muss; sonst wird sie verworfen.
 */

import Anthropic from "@anthropic-ai/sdk";

import { zitatAufSeite } from "@/lib/expose-generator/modell";

const MODELL = "claude-opus-5-5";

/** Text einer Unterlage, Seiten bzw. Tabellenblätter markiert mit <<<PAGE n>>>. */
export type SteckbriefUnterlage = {
  id: string;
  name: string;
  webUrl: string | null;
  text: string;
  /** Bei Tabellen: Name je Blatt (Index = Seitennummer − 1). */
  blaetter?: string[];
};

export const STECKBRIEF_THEMEN = [
  "kaufpreis",
  "jahresmiete",
  "einheiten",
  "wohnflaeche",
  "gewerbeflaeche",
  "grundstueck",
  "baujahr",
  "energie",
  "heizung",
  "leerstand",
  "faktor_rendite",
  "bewirtschaftung",
  "zustand",
  "rechtliches",
  "sonstiges",
] as const;

export type SteckbriefThema = (typeof STECKBRIEF_THEMEN)[number];

export type SteckbriefBeleg = {
  unterlageId: string;
  datei: string;
  webUrl: string | null;
  /** „S. 3“ oder „Blatt Mieterliste“. */
  stelle: string;
  zitat: string;
};

export type SteckbriefAngabe = {
  thema: SteckbriefThema;
  label: string;
  wert: string;
  beleg: SteckbriefBeleg;
};

export type SteckbriefHinweis = { text: string; beleg: SteckbriefBeleg };

export type Steckbrief = {
  erstelltAm: string;
  zusammenfassung: string;
  angaben: SteckbriefAngabe[];
  besonderheiten: SteckbriefHinweis[];
  risiken: SteckbriefHinweis[];
  offenePunkte: string[];
  ausgewertet: {
    datei: string;
    webUrl: string | null;
    hinweis: string | null;
  }[];
  verworfen: number;
};

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

const BELEG = {
  type: "object",
  additionalProperties: false,
  required: ["unterlageId", "seite", "zitat"],
  properties: {
    unterlageId: { type: "string" },
    seite: { type: "integer", description: "Nummer aus <<<PAGE n>>>" },
    zitat: {
      type: "string",
      description: "Wörtlich aus genau dieser Seite, 2 bis 20 Wörter",
    },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "zusammenfassung",
    "angaben",
    "besonderheiten",
    "risiken",
    "offenePunkte",
  ],
  properties: {
    zusammenfassung: {
      type: "string",
      description:
        "Drei bis fünf Sätze für den Makler, nur aus den belegten Angaben",
    },
    angaben: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["thema", "label", "wert", "beleg"],
        properties: {
          thema: { type: "string", enum: [...STECKBRIEF_THEMEN] },
          label: { type: "string" },
          wert: { type: "string" },
          beleg: BELEG,
        },
      },
    },
    besonderheiten: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "beleg"],
        properties: { text: { type: "string" }, beleg: BELEG },
      },
    },
    risiken: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "beleg"],
        properties: { text: { type: "string" }, beleg: BELEG },
      },
    },
    offenePunkte: {
      type: "array",
      items: { type: "string" },
      description:
        "Was für Vermarktung und Käuferprüfung fehlt oder widersprüchlich ist",
    },
  },
} as const;

type RohBeleg = { unterlageId: string; seite: number; zitat: string };
type Roh = {
  zusammenfassung: string;
  angaben: {
    thema: SteckbriefThema;
    label: string;
    wert: string;
    beleg: RohBeleg;
  }[];
  besonderheiten: { text: string; beleg: RohBeleg }[];
  risiken: { text: string; beleg: RohBeleg }[];
  offenePunkte: string[];
};

const ohneStriche = (s: string) => s.replace(/\s*[–—]\s*/g, ", ").trim();

/** Erstellt den Steckbrief; Unterlagen ohne Text (Scans) werden vorher aussortiert. */
export async function steckbriefErstellen(input: {
  objekt: string;
  unterlagen: SteckbriefUnterlage[];
  hinweise: { datei: string; webUrl: string | null; hinweis: string | null }[];
}): Promise<Steckbrief> {
  const jeId = new Map(input.unterlagen.map((u) => [u.id, u]));
  // Rund 600.000 Zeichen insgesamt, gleichmäßig auf die Unterlagen verteilt.
  const jeUnterlage = Math.floor(
    600_000 / Math.max(1, input.unterlagen.length),
  );
  const unterlagenText = input.unterlagen
    .map(
      (u) =>
        `<unterlage id="${u.id}" name="${u.name.replace(/"/g, "'")}">\n${u.text.slice(0, jeUnterlage)}\n</unterlage>`,
    )
    .join("\n\n");

  const antwort = await client()
    .messages.stream({
      model: MODELL,
      max_tokens: 32000,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: `Du bist Analyst bei Grenz & Co., einer Investmentmaklerin in Düsseldorf. Du erstellst aus den Objektunterlagen eines Verkaufsmandats einen Steckbrief für die Mandatsakte.
Regeln:
- Nur Angaben, die in den Unterlagen stehen. Nichts schätzen, nichts rechnen, keine Marktannahmen.
- Jede Angabe, Besonderheit und jedes Risiko mit Beleg: Unterlagen-Id, Seitennummer aus <<<PAGE n>>> und ein wörtliches Zitat von 2 bis 20 Wörtern von genau dieser Seite. Bei Tabellen ist eine Seite ein Tabellenblatt; zitiere dort Zellinhalte so, wie sie im Text stehen.
- Bei widersprüchlichen Werten (z. B. Miete in Exposé und Mieterliste) beide Angaben aufnehmen und den Widerspruch unter offenePunkte nennen.
- Labels und Werte knapp, deutsche Schreibweise (1.234,56 €, m²). Keine Gedankenstriche.
- offenePunkte: fehlende Unterlagen oder Angaben, die Käufer typischerweise prüfen (Mieterliste, Energieausweis, Grundbuch, Baulasten, Wohnflächenberechnung, Betriebskosten), ohne Beleg.`,
      messages: [
        {
          role: "user",
          content: `Objekt: ${input.objekt}\n\n${unterlagenText}`,
        },
      ],
    })
    .finalMessage();

  if (antwort.stop_reason === "refusal")
    throw new Error("Die KI hat die Auswertung abgelehnt.");
  if (antwort.stop_reason === "max_tokens")
    throw new Error("Die Auswertung war zu lang. Bitte erneut versuchen.");
  const block = antwort.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("Die KI hat keinen Steckbrief geliefert.");
  const roh = JSON.parse(block.text) as Roh;

  let verworfen = 0;
  const beleg = (b: RohBeleg): SteckbriefBeleg | null => {
    const u = jeId.get(b.unterlageId);
    if (!u || !b.zitat?.trim() || !zitatAufSeite(u.text, b.seite, b.zitat)) {
      verworfen += 1;
      return null;
    }
    const blatt = u.blaetter?.[b.seite - 1];
    return {
      unterlageId: u.id,
      datei: u.name,
      webUrl: u.webUrl,
      stelle: blatt ? `Blatt ${blatt}` : `S. ${b.seite}`,
      zitat: b.zitat.trim(),
    };
  };

  const angaben: SteckbriefAngabe[] = [];
  for (const a of roh.angaben) {
    const bel = beleg(a.beleg);
    if (bel && a.wert.trim() && STECKBRIEF_THEMEN.includes(a.thema))
      angaben.push({
        thema: a.thema,
        label: ohneStriche(a.label),
        wert: ohneStriche(a.wert),
        beleg: bel,
      });
  }
  const hinweise = (liste: Roh["besonderheiten"]) =>
    liste.flatMap((h) => {
      const bel = beleg(h.beleg);
      return bel && h.text.trim()
        ? [{ text: ohneStriche(h.text), beleg: bel }]
        : [];
    });

  return {
    erstelltAm: new Date().toISOString(),
    zusammenfassung: ohneStriche(roh.zusammenfassung),
    angaben,
    besonderheiten: hinweise(roh.besonderheiten),
    risiken: hinweise(roh.risiken),
    offenePunkte: roh.offenePunkte.map(ohneStriche).filter(Boolean),
    ausgewertet: input.hinweise,
    verworfen,
  };
}
