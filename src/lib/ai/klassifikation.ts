/**
 * KI-Klassifikation für Ablage v2 (strukturierte Ausgabe mit Konfidenz je Feld).
 *
 * Live: ein Sprachmodell erhält Mail + Kontext (Gesellschaften, Objekte,
 * Darlehen, Mieter) und muss exakt `kiAntwortSchema` liefern (Structured
 * Output / Tool-Call). Mock: deterministische Heuristik ohne Netz, damit
 * Messung und Demo reproduzierbar sind.
 */
import { z } from "zod";
import { integrationsModus, nichtKonfiguriert } from "@/lib/integrations/modus";

export const DOKUMENTTYPEN = [
  "Rechnung",
  "Kontoauszug",
  "Darlehensvertrag",
  "Zinsmitteilung",
  "Mietvertrag",
  "Kündigung",
  "Mieterhöhung",
  "Nebenkostenabrechnung",
  "Kaufvertrag",
  "Versicherung",
  "Steuerbescheid",
  "Sonstiges",
] as const;
export type Dokumenttyp = (typeof DOKUMENTTYPEN)[number];

export const mailSchema = z.object({
  id: z.string(),
  empfangen: z.string(),
  absender: z.string(),
  betreff: z.string(),
  text: z.string(),
  anhang: z.string(),
});
export type EingangsMail = z.infer<typeof mailSchema>;

/** Was das Modell über die Gruppe wissen darf (keine Kontodaten, keine Beträge). */
export interface KlassifikationsKontext {
  gesellschaften: Array<{ id: string; kurz: string; name: string }>;
  objekte: Array<{
    id: string;
    companyId: string;
    name: string;
    strasse: string;
    ort: string;
  }>;
  darlehen: Array<{
    id: string;
    bankRef: string | null;
    companyId: string | null;
  }>;
  mieter: Array<{ name: string; objektId: string }>;
}

const feld = <T extends z.ZodTypeAny>(wert: T) =>
  z.object({ wert: wert.nullable(), konfidenz: z.number().min(0).max(1) });

/** Strukturierte Ausgabe, die das Modell liefern muss. */
export const kiAntwortSchema = z.object({
  gesellschaftId: feld(z.string()),
  dokumenttyp: feld(z.enum(DOKUMENTTYPEN)),
  bezugId: feld(z.string()),
  datum: feld(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  kurzbeschreibung: feld(z.string().max(60)),
});
export type KiAntwort = z.infer<typeof kiAntwortSchema>;

export interface DokumentKlassifikator {
  readonly modell: string;
  klassifiziere(
    mail: EingangsMail,
    kontext: KlassifikationsKontext,
  ): Promise<KiAntwort>;
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

/** Schlüsselwörter je Dokumenttyp mit Gewicht (Mock-Heuristik). */
const SIGNALE: Record<Dokumenttyp, Array<[RegExp, number]>> = {
  Rechnung: [
    [/rechnung|invoice/i, 3],
    [/betrag|zahlbar|netto|honorar|abschlag/i, 1],
  ],
  Kontoauszug: [
    [/kontoauszug/i, 4],
    [/auszug/i, 1],
  ],
  Darlehensvertrag: [
    [/darlehensvertrag/i, 4],
    [/darlehen/i, 1],
  ],
  Zinsmitteilung: [
    [/zinsmitteilung|zinsbescheinigung|zinsanpassung/i, 4],
    [/sollzins|zinsen|darlehen/i, 1],
  ],
  Mietvertrag: [
    [/mietvertrag/i, 4],
    [/mietbeginn/i, 1],
  ],
  Kündigung: [
    [/kündig/i, 4],
    [/fristgerecht|auszug aus/i, 1],
  ],
  Mieterhöhung: [
    [/mieterhöhung/i, 4],
    [/§\s?558/i, 2],
  ],
  Nebenkostenabrechnung: [
    [/nebenkosten|betriebskosten/i, 4],
    [/abrechnung/i, 1],
  ],
  Kaufvertrag: [
    [/kaufvertrag/i, 4],
    [/notar|beurkund/i, 2],
  ],
  Versicherung: [
    [/versicherung/i, 3],
    [/prämie|versicherungsschein/i, 2],
  ],
  Steuerbescheid: [
    [/bescheid/i, 3],
    [/steuer|finanzamt/i, 2],
  ],
  Sonstiges: [[/einladung|newsletter|ticket|messe/i, 3]],
};

/** Stabiler Pseudo-Zufall aus der Mail-ID (für leichte Konfidenz-Streuung). */
function streuung(id: string, salz: string): number {
  let h = 2166136261;
  for (const ch of id + salz) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function erstesDatum(text: string): string | null {
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function kurz(betreff: string): string {
  return betreff
    .replace(/\b(IM|DL|BK)-\d{4}-\d{3}\b/g, "")
    .replace(/^(AW|WG|RE|FW):\s*/i, "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export class MockKlassifikator implements DokumentKlassifikator {
  readonly modell = "mock-heuristik-1";

  async klassifiziere(
    mail: EingangsMail,
    k: KlassifikationsKontext,
  ): Promise<KiAntwort> {
    return this.klassifiziereSync(mail, k);
  }

  /** Synchron für Messskript und Tests. */
  klassifiziereSync(mail: EingangsMail, k: KlassifikationsKontext): KiAntwort {
    const voll = `${mail.betreff}\n${mail.text}\n${mail.anhang}`;
    const jitter = (salz: string) => streuung(mail.id, salz) * 0.04;

    // Dokumenttyp: gewichtete Signale, Konfidenz aus Abstand zum Zweitbesten
    const punkte = (Object.keys(SIGNALE) as Dokumenttyp[])
      .map((typ) => ({
        typ,
        p: SIGNALE[typ].reduce(
          (s, [re, w]) =>
            s + (re.test(voll) ? w : 0) + (re.test(mail.betreff) ? w / 2 : 0),
          0,
        ),
      }))
      .sort((a, b) => b.p - a.p);
    const [erster, zweiter] = punkte;
    const typKonf =
      erster.p === 0
        ? 0.3
        : Math.min(0.95, 0.55 + (erster.p - zweiter.p) * 0.07) - jitter("t");

    // Objekt: Name, Straße oder Mietername (mehrdeutig → niedrige Konfidenz)
    const treffer = new Map<string, number>();
    const merke = (id: string, w: number) =>
      treffer.set(id, Math.max(treffer.get(id) ?? 0, w));
    for (const o of k.objekte) {
      if (voll.includes(o.strasse)) merke(o.id, 0.93);
      if (new RegExp(`\\b${o.name}\\b`).test(voll)) merke(o.id, 0.9);
    }
    for (const m of k.mieter)
      if (voll.includes(m.name)) merke(m.objektId, 0.86);
    if (treffer.size === 0) {
      // nur der Ort: schwaches Signal, bei mehreren Objekten am Ort sehr unsicher
      const amOrt = k.objekte.filter((o) => voll.includes(o.ort));
      for (const o of amOrt) merke(o.id, amOrt.length === 1 ? 0.7 : 0.45);
    }
    const objekte = [...treffer.entries()].sort((a, b) => b[1] - a[1]);
    let bezug: string | null = objekte[0]?.[0] ?? null;
    let bezugKonf = objekte[0]?.[1] ?? 0.5;
    if (objekte.length > 1) bezugKonf = Math.min(bezugKonf, 0.5);
    bezugKonf -= jitter("o");

    // Gesellschaft: ausgeschriebener Name schlägt Ableitung aus dem Objekt
    const namentlich = k.gesellschaften.filter((g) => voll.includes(g.name));
    let gesellschaft: string | null = null;
    let gesKonf = 0.3;
    if (namentlich.length === 1) {
      gesellschaft = namentlich[0].id;
      gesKonf = 0.94;
    } else if (bezug) {
      gesellschaft = k.objekte.find((o) => o.id === bezug)?.companyId ?? null;
      gesKonf = bezugKonf;
    }
    if (objekte.length > 1 && gesellschaft) {
      const firmen = new Set(
        objekte.map(([id]) => k.objekte.find((o) => o.id === id)?.companyId),
      );
      if (firmen.size === 1 && namentlich.length === 1) {
        // gleiche Gesellschaft, aber Sammelbeleg: kein einzelnes Objekt
        bezug = null;
        bezugKonf = 0.6;
      }
    }
    gesKonf -= jitter("g");

    const datum = erstesDatum(mail.text) ?? mail.empfangen.slice(0, 10);
    return {
      gesellschaftId: { wert: gesellschaft, konfidenz: round(gesKonf) },
      dokumenttyp: {
        wert: erster.p === 0 ? "Sonstiges" : erster.typ,
        konfidenz: round(typKonf),
      },
      bezugId: { wert: bezug, konfidenz: round(bezugKonf) },
      datum: {
        wert: datum,
        konfidenz: erstesDatum(mail.text) ? 0.88 : 0.6,
      },
      kurzbeschreibung: { wert: kurz(mail.betreff), konfidenz: 0.9 },
    };
  }
}

function round(x: number): number {
  return Math.max(0, Math.min(1, Math.round(x * 100) / 100));
}

export class LiveKlassifikator implements DokumentKlassifikator {
  readonly modell = "live";
  // TODO(live): Server-Funktion, die das Modell mit `kiAntwortSchema` als
  // Tool-Schema aufruft; API-Key nur serverseitig, nie als VITE_*.
  async klassifiziere(): Promise<KiAntwort> {
    return nichtKonfiguriert("KI-Klassifikation");
  }
}

export function dokumentKlassifikator(): DokumentKlassifikator {
  return integrationsModus() === "live"
    ? new LiveKlassifikator()
    : new MockKlassifikator();
}
