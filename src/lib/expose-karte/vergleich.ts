/**
 * Vergleichsobjekte (Comparables) zu einem frei beschriebenen Projekt.
 * Server-only: ruft Claude und OpenStreetMap Nominatim auf.
 */

import { geocodeExpose } from "./geocode";
import type { KartenObjekt } from "./server-fn";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5";
const MAX_TREFFER = 10;

export type ProjektAngaben = {
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  objektart: string | null;
  einheiten: number | null;
  flaeche: number | null;
  baujahr: number | null;
  miete: number | null;
  preis: number | null;
};

export type VergleichErgebnis = {
  projekt: ProjektAngaben & { lat: number | null; lng: number | null };
  treffer: Array<{ id: string; begruendung: string; km: number | null }>;
  einschaetzung: string;
};

type Werkzeug = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type AnthropicAntwort = {
  content?: Array<{ type?: string; name?: string; input?: unknown }>;
  error?: { message?: string };
};

async function claudeWerkzeug<T>(
  system: string,
  text: string,
  werkzeug: Werkzeug,
): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2500,
      temperature: 0,
      system,
      tools: [werkzeug],
      tool_choice: { type: "tool", name: werkzeug.name },
      messages: [{ role: "user", content: text }],
    }),
  });
  const json = (await res.json()) as AnthropicAntwort;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Anthropic Fehler (${res.status})`);
  }
  const block = json.content?.find((b) => b.type === "tool_use");
  if (!block?.input) throw new Error("Die KI hat keine Antwort geliefert.");
  return block.input as T;
}

const zahlOderNull = { type: ["number", "null"] };
const textOderNull = { type: ["string", "null"] };

const PROJEKT_WERKZEUG: Werkzeug = {
  name: "projekt_erfassen",
  description: "Eckdaten des beschriebenen Immobilienprojekts.",
  input_schema: {
    type: "object",
    properties: {
      strasse: { ...textOderNull, description: "Straße und Hausnummer" },
      plz: textOderNull,
      ort: { ...textOderNull, description: "Stadt (ohne Stadtteil-Zusatz)" },
      objektart: {
        ...textOderNull,
        description:
          "z. B. Mehrfamilienhaus, Wohn-und Geschäftshaus, Wohnanlage, Geschäftshaus, Einfamilienhaus",
      },
      einheiten: { ...zahlOderNull, description: "Anzahl Wohneinheiten" },
      flaeche: { ...zahlOderNull, description: "Wohn-/Mietfläche in m²" },
      baujahr: zahlOderNull,
      miete: { ...zahlOderNull, description: "Jahresnettokaltmiete in €" },
      preis: {
        ...zahlOderNull,
        description: "Kaufpreis bzw. Preisvorstellung in €",
      },
    },
    required: [
      "strasse",
      "plz",
      "ort",
      "objektart",
      "einheiten",
      "flaeche",
      "baujahr",
      "miete",
      "preis",
    ],
  },
};

const AUSWAHL_WERKZEUG: Werkzeug = {
  name: "vergleichsobjekte_waehlen",
  description: "Die besten Vergleichsobjekte und eine kurze Einordnung.",
  input_schema: {
    type: "object",
    properties: {
      auswahl: {
        type: "array",
        maxItems: MAX_TREFFER,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            begruendung: {
              type: "string",
              description:
                "Ein kurzer Satz, warum das Objekt vergleichbar ist.",
            },
          },
          required: ["id", "begruendung"],
        },
      },
      einschaetzung: {
        type: "string",
        description:
          "3–5 Sätze für das Kundengespräch: Spanne von Faktor, Miete je m² und Preis je m² der Vergleichsobjekte und wo das Projekt einzuordnen ist.",
      },
    },
    required: ["auswahl", "einschaetzung"],
  },
};

function km(a: [number, number], b: [number, number]): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const dLat = r(b[0] - a[0]);
  const dLng = r(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Herkunft und Preisart je Objekt für die KI. */
function art(o: KartenObjekt): string {
  if (o.status === "verkauft")
    return o.preisGeschaetzt
      ? "Verkauf (Kaufpreis geschätzt)"
      : o.grenz
        ? "Verkauf Grenz & Co. (Kaufpreis)"
        : "Verkauf (Kaufpreis)";
  if (o.status === "nicht_verkauft") return "nicht verkauft (Angebotspreis)";
  return o.quelle === "expose"
    ? "Exposé (Angebotspreis)"
    : "am Markt (Angebotspreis)";
}

function wert(n: number | null, einheit = ""): string {
  return n === null ? "–" : `${Math.round(n * 10) / 10}${einheit}`;
}

export async function sucheVergleichsobjekte(
  beschreibung: string,
  objekte: KartenObjekt[],
): Promise<VergleichErgebnis> {
  const angaben = await claudeWerkzeug<ProjektAngaben>(
    "Du liest die Beschreibung eines Immobilienprojekts (Deutschland) und erfasst die Eckdaten. Unbekanntes bleibt null. Beträge in Euro als Zahl, „80 T€“ = 80000, „1,2 Mio“ = 1200000.",
    beschreibung,
    PROJEKT_WERKZEUG,
  );

  let lage: { lat: number; lng: number } | null = null;
  try {
    lage = await geocodeExpose({
      adresse: angaben.strasse,
      plz: angaben.plz,
      stadt: angaben.ort,
    });
  } catch (err) {
    console.error("[expose-vergleich] Geocoding fehlgeschlagen", err);
  }

  const mitAbstand = objekte.map((o) => ({
    o,
    km:
      lage && o.lat !== null && o.lng !== null
        ? Math.round(km([lage.lat, lage.lng], [o.lat, o.lng]) * 10) / 10
        : null,
  }));

  const tabelle = mitAbstand
    .filter(({ o }) => o.objektart || o.miete || o.preis || o.flaeche)
    .map(({ o, km: d }) =>
      [
        o.id,
        art(o),
        [o.plz, o.stadt].filter(Boolean).join(" ") || "–",
        d === null ? "–" : `${d} km`,
        o.objektart ?? "–",
        wert(o.einheiten),
        wert(o.flaeche, " m²"),
        wert(o.baujahr),
        wert(o.miete),
        wert(o.preis),
        wert(o.faktor),
        wert(o.mieteQm, " €/m²"),
        wert(o.preisQm, " €/m²"),
      ].join(" | "),
    )
    .join("\n");

  const auswahl = await claudeWerkzeug<{
    auswahl: Array<{ id: string; begruendung: string }>;
    einschaetzung: string;
  }>(
    [
      "Du bist Analyst bei Grenz & Co., einem Immobilienmakler für Zinshäuser.",
      `Wähle aus den Markttransaktionen und Exposés bis zu ${MAX_TREFFER} Vergleichsobjekte (Comparables) für das Projekt des Kunden.`,
      "Gewichtung: gleiche oder ähnliche Objektart, Nähe (Entfernung), ähnliche Größe (Einheiten/Fläche), ähnliches Baujahr. Objekte mit Miete und Preis sind wertvoller; tatsächliche Verkäufe mit Kaufpreis sind wertvoller als Angebote.",
      "Trenne in der Einschätzung Kaufpreise (Verkäufe) von Angebotspreisen und kennzeichne geschätzte Kaufpreise als geschätzt.",
      "Nutze nur IDs aus der Tabelle. Schreibe auf Deutsch, sachlich, ohne Floskeln. Nenne in der Einschätzung konkrete Zahlen aus den gewählten Objekten.",
    ].join("\n"),
    [
      "PROJEKT DES KUNDEN:",
      beschreibung,
      "",
      `Erfasste Eckdaten: ${JSON.stringify(angaben)}`,
      "",
      "MARKTDATEN (id | Art | Ort | Entfernung zum Projekt | Objektart | WE | Fläche | Baujahr | Jahresmiete € | Preis € | Faktor | Miete je m² | Preis je m²):",
      tabelle,
    ].join("\n"),
    AUSWAHL_WERKZEUG,
  );

  const abstand = new Map(mitAbstand.map(({ o, km: d }) => [o.id, d]));
  const treffer = auswahl.auswahl
    .filter((t) => abstand.has(t.id))
    .slice(0, MAX_TREFFER)
    .map((t) => ({
      id: t.id,
      begruendung: t.begruendung,
      km: abstand.get(t.id) ?? null,
    }));

  return {
    projekt: { ...angaben, lat: lage?.lat ?? null, lng: lage?.lng ?? null },
    treffer,
    einschaetzung: auswahl.einschaetzung,
  };
}
