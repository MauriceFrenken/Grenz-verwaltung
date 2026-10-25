/**
 * KI-Teil der Tools (server-only). Claude liest die Unterlagen und liefert Angaben mit Beleg;
 * jedes Zitat wird gegen die genannte Seite geprüft, Web-Quellen gegen die tatsächlich
 * gefundenen URLs. Gerechnet wird nicht hier, sondern in rechnen.ts und in den Excel-Formeln.
 */

import Anthropic from "@anthropic-ai/sdk";

import { zitatAufSeite } from "@/lib/expose-generator/modell";

import {
  DCF_STANDARD,
  mietSummen,
  standardSchritt,
  staffelBasis,
} from "./rechnen";
import type {
  DateiToolId,
  Angabe,
  Beleg,
  DcfDaten,
  EinschaetzungObjekt,
  Erreichbarkeit,
  ExposeDaten,
  KaufpreisDaten,
  MarktpreisDaten,
  Mieteinheit,
  MieterlisteDaten,
  Nutzung,
  Objekt,
  ToolErgebnis,
  Unterlage,
  Vergleichsobjekt,
} from "./typen";
import { NUTZUNGEN } from "./typen";

const MODELL = "claude-opus-5-5";
const MAX_FORTSETZUNGEN = 4;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

async function jsonAntwort<T>(params: {
  system: string;
  inhalt: string;
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
}): Promise<T> {
  const antwort = await client()
    .messages.stream({
      model: MODELL,
      max_tokens: 32000,
      system: params.system,
      output_config: {
        effort: params.effort ?? "medium",
        format: { type: "json_schema", schema: params.schema },
      },
      messages: [{ role: "user", content: params.inhalt }],
    })
    .finalMessage();
  if (antwort.stop_reason === "refusal")
    throw new Error("Die KI hat die Anfrage abgelehnt.");
  if (antwort.stop_reason === "max_tokens")
    throw new Error(
      "Die KI-Antwort war zu lang. Bitte weniger Unterlagen auf einmal auswerten.",
    );
  const block = antwort.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("Die KI hat keinen Text geliefert.");
  return JSON.parse(block.text) as T;
}

// ---------- Schema-Bausteine (nur Strings und Zahlen, keine Null-Unions) ----------

type Q = {
  typ: "dokument" | "nutzer" | "annahme" | "keine";
  unterlage: string;
  seite: number;
  zitat: string;
  hinweis: string;
};
type Roh = { wert: string; q: Q };

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: "string" };
const strListe = { type: "array", items: str };
const Q_SCHEMA = obj({
  typ: { type: "string", enum: ["dokument", "nutzer", "annahme", "keine"] },
  unterlage: { type: "string", description: "Id der Unterlage, sonst leer" },
  seite: { type: "integer", description: "Seite aus <<<PAGE n>>>, sonst 0" },
  zitat: {
    type: "string",
    description:
      "Wörtliches Zitat (3 bis 25 Wörter) aus der Seite bzw. aus der Anweisung",
  },
  hinweis: { type: "string", description: "Bei Annahme: worauf sie beruht" },
});
const FELD = obj({ wert: str, q: Q_SCHEMA });
const felder = (namen: string[]) =>
  Object.fromEntries(namen.map((n) => [n, FELD]));

const OBJEKT_SCHEMA = obj(
  felder(["objektart", "strasse", "plz", "ort", "stadtteil"]),
);

const EINHEIT_SCHEMA = obj({
  lage: str,
  mieter: str,
  nutzung: { type: "string", enum: NUTZUNGEN },
  belegung: { type: "string", enum: ["vermietet", "leer"] },
  flaeche: { type: "string", description: "m², leer wenn unbekannt" },
  kaltmieteIst: {
    type: "string",
    description: "Nettokaltmiete pro Monat in EUR",
  },
  kaltmieteSoll: {
    type: "string",
    description: "Soll-/Zielmiete pro Monat, nur wenn genannt",
  },
  betriebskosten: str,
  heizkosten: str,
  vertragBeginn: {
    type: "string",
    description: "JJJJ-MM-TT oder JJJJ, sonst leer",
  },
  laufzeit: str,
  info: {
    type: "string",
    description: "Indexierung, Staffel, Kündigung, Besonderheiten",
  },
  q: Q_SCHEMA,
});

const REGELN = `Regeln für Belege:
- Jede Angabe hat q. typ "dokument": Unterlagen-Id, Seite aus der Markierung <<<PAGE n>>> und ein wörtliches Zitat (3 bis 25 Wörter) genau von dieser Seite, das den Wert belegt.
- typ "nutzer": der Wert steht in der Anweisung des Nutzers; zitat = die wörtliche Stelle aus der Anweisung.
- typ "annahme": nur wenn ausdrücklich erlaubt; hinweis nennt die Grundlage.
- typ "keine" mit leerem wert, wenn nichts belegt ist. Nichts erfinden, nichts schätzen, keine allgemeinen Floskeln.
- Zahlen ohne Tausenderpunkte und mit Punkt als Dezimaltrenner (1975000.50), Flächen in m², Mieten in EUR.
- Keine Gedankenstriche (– oder —) in Texten.`;

function unterlagenText(
  unterlagen: Unterlage[],
  proUnterlage = 150_000,
): string {
  return unterlagen
    .map(
      (u) =>
        `<unterlage id="${u.id}" name="${u.name.replace(/"/g, "'")}">\n${u.text.slice(0, proUnterlage)}\n</unterlage>`,
    )
    .join("\n\n");
}

// ---------- Prüfung ----------

type Pruefer = {
  unterlagen: Unterlage[];
  anweisung: string;
  verworfen: number;
  hinweise: string[];
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const ohneStriche = (s: string) => s.replace(/\s*[–—]\s*/g, ", ").trim();

function belegAus(
  p: Pruefer,
  q: Q,
  was: string,
): { beleg: Beleg | null; geprueft: boolean } | null {
  if (q.typ === "dokument") {
    const u =
      p.unterlagen.find((x) => x.id === q.unterlage) ??
      p.unterlagen.find((x) => x.name === q.unterlage);
    if (u && q.zitat && zitatAufSeite(u.text, q.seite, q.zitat))
      return {
        beleg: {
          art: "dokument",
          unterlage: u.name,
          seite: q.seite,
          zitat: q.zitat.trim(),
        },
        geprueft: true,
      };
    p.verworfen += 1;
    p.hinweise.push(
      `${was}: Beleg nicht auf der genannten Seite gefunden, Angabe verworfen.`,
    );
    return null;
  }
  if (q.typ === "nutzer") {
    if (q.zitat && norm(p.anweisung).includes(norm(q.zitat)))
      return {
        beleg: { art: "nutzer", hinweis: q.zitat.trim() },
        geprueft: true,
      };
    p.verworfen += 1;
    p.hinweise.push(
      `${was}: steht so nicht in der Anweisung, Angabe verworfen.`,
    );
    return null;
  }
  if (q.typ === "annahme")
    return {
      beleg: { art: "annahme", hinweis: q.hinweis || "Annahme der KI" },
      geprueft: false,
    };
  return { beleg: null, geprueft: false };
}

export function zahlAus(s: string | number | null | undefined): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (!s) return null;
  let t = s.replace(/[^\d,.-]/g, "");
  if (!t) return null;
  // Deutsches Format (1.975.000,50) oder Punkt als Dezimaltrenner.
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function text(p: Pruefer, r: Roh, was: string): Angabe<string> {
  const wert = ohneStriche(r.wert ?? "");
  if (!wert) return { wert: null, beleg: null, geprueft: false };
  const b = belegAus(p, r.q, was);
  return b ? { wert, ...b } : { wert: null, beleg: null, geprueft: false };
}

function zahl(p: Pruefer, r: Roh, was: string): Angabe<number> {
  const wert = zahlAus(r.wert);
  if (wert == null) return { wert: null, beleg: null, geprueft: false };
  const b = belegAus(p, r.q, was);
  return b ? { wert, ...b } : { wert: null, beleg: null, geprueft: false };
}

function objektAus(p: Pruefer, r: Record<string, Roh>): Objekt {
  return {
    objektart: text(p, r.objektart, "Objektart"),
    strasse: text(p, r.strasse, "Straße"),
    plz: text(p, r.plz, "PLZ"),
    ort: text(p, r.ort, "Ort"),
    stadtteil: text(p, r.stadtteil, "Stadtteil"),
  };
}

type RohEinheit = {
  lage: string;
  mieter: string;
  nutzung: Nutzung;
  belegung: "vermietet" | "leer";
  flaeche: string;
  kaltmieteIst: string;
  kaltmieteSoll: string;
  betriebskosten: string;
  heizkosten: string;
  vertragBeginn: string;
  laufzeit: string;
  info: string;
  q: Q;
};

function datumAus(s: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s) ?? null;
  if (m) return m[0];
  const de = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (de) return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  const j = /^(\d{4})$/.exec(s.trim());
  return j ? `${j[1]}-01-01` : null;
}

function einheitenAus(p: Pruefer, liste: RohEinheit[]): Mieteinheit[] {
  const ergebnis: Mieteinheit[] = [];
  for (const e of liste) {
    const b = belegAus(p, e.q, `Einheit ${e.lage}`);
    if (!b) continue;
    ergebnis.push({
      lage: ohneStriche(e.lage),
      mieter: ohneStriche(e.mieter),
      nutzung: NUTZUNGEN.includes(e.nutzung) ? e.nutzung : "Sonstiges",
      belegung: e.belegung === "leer" ? "leer" : "vermietet",
      flaeche: zahlAus(e.flaeche),
      kaltmieteIst: zahlAus(e.kaltmieteIst),
      kaltmieteSoll: zahlAus(e.kaltmieteSoll),
      betriebskosten: zahlAus(e.betriebskosten),
      heizkosten: zahlAus(e.heizkosten),
      vertragBeginn: datumAus(e.vertragBeginn),
      laufzeit: ohneStriche(e.laufzeit),
      info: ohneStriche(e.info),
      beleg: b.beleg,
      geprueft: b.geprueft,
    });
  }
  return ergebnis;
}

const berechnet = (wert: number | null, hinweis: string): Angabe<number> =>
  wert == null || !Number.isFinite(wert) || wert === 0
    ? { wert: null, beleg: null, geprueft: false }
    : { wert, beleg: { art: "berechnung", hinweis }, geprueft: true };

const annahme = (wert: number, hinweis: string): Angabe<number> => ({
  wert,
  beleg: { art: "annahme", hinweis },
  geprueft: false,
});

const oder = <T>(a: Angabe<T>, b: Angabe<T>): Angabe<T> =>
  a.wert != null ? a : b;

// ---------- Auswertung je Tool ----------

export type AuswertungEingabe = {
  tool: DateiToolId;
  unterlagen: Unterlage[];
  anweisung: string;
  bildnamen: string[];
  /** Vorheriges Ergebnis für Rückfragen („Kaufpreis auf 2,1 Mio. ändern“). */
  vorher: ToolErgebnis | null;
};

function nutzerTeil(e: AuswertungEingabe): string {
  const teile = [`<anweisung>\n${e.anweisung || "(keine)"}\n</anweisung>`];
  if (e.bildnamen.length)
    teile.push(`<fotos>${e.bildnamen.join(", ")}</fotos>`);
  if (e.vorher)
    teile.push(
      `<bisheriges_ergebnis>\n${JSON.stringify(e.vorher.daten).slice(0, 60_000)}\n</bisheriges_ergebnis>\nÜbernimm das bisherige Ergebnis und ändere nur, was die Anweisung verlangt. Bisherige Werte behalten ihre Belege (gleiche Unterlage, Seite, Zitat).`,
    );
  teile.push(unterlagenText(e.unterlagen));
  return teile.join("\n\n");
}

const ROLLE =
  "Du arbeitest für Grenz & Co. Immobilienberatungs-GmbH (Köln, Düsseldorf), eine Investmentmaklerin für Zinshäuser, Wohn- und Geschäftshäuser und Gewerbeimmobilien.";

async function mieterlisteAuswerten(
  e: AuswertungEingabe,
  p: Pruefer,
): Promise<MieterlisteDaten> {
  const roh = await jsonAntwort<{
    objekt: Record<string, Roh>;
    kaufpreis: Roh;
    einheiten: RohEinheit[];
    hinweise: string[];
  }>({
    system: `${ROLLE}
Aufgabe: Überführe Mieterlisten, Mietverträge oder Sollstellungen in die Grenz-Mietaufstellung.
- Je Einheit eine Zeile: Lage (z. B. "39 EG li", "Stellplatz 1"), Mieter, Nutzung (Wohnen, Gewerbe, Stellplatz, Garagenstellplatz, Sonstiges), Belegung, Fläche, Nettokaltmiete IST pro Monat, SOLL nur wenn genannt, Nebenkosten (Betriebs-/Heizkosten) pro Monat, Vertragsbeginn, Laufzeit, Info.
- Wohnungsmieter (Privatpersonen) nicht namentlich übernehmen (Datenschutz), Feld Mieter leer lassen. Gewerbemieter mit Firmennamen.
- Leerstand als Belegung "leer" ohne IST-Miete.
- q der Einheit belegt die Zeile (Zitat aus der Zeile der Mieterliste).
- Jahresmieten in Monatsmieten umrechnen ist erlaubt (Wert /12), der Beleg zitiert dann die Jahresmiete.
- hinweise: Unstimmigkeiten (Summen weichen ab, Flächen fehlen, Einheiten doppelt).
${REGELN}`,
    inhalt: nutzerTeil(e),
    schema: obj({
      objekt: OBJEKT_SCHEMA,
      kaufpreis: FELD,
      einheiten: { type: "array", items: EINHEIT_SCHEMA },
      hinweise: strListe,
    }),
  });
  p.hinweise.push(...roh.hinweise.map(ohneStriche));
  return {
    objekt: objektAus(p, roh.objekt),
    kaufpreis: zahl(p, roh.kaufpreis, "Kaufpreis"),
    einheiten: einheitenAus(p, roh.einheiten),
  };
}

async function kaufpreisAuswerten(
  e: AuswertungEingabe,
  p: Pruefer,
  intern: InternerVergleich | null,
): Promise<KaufpreisDaten> {
  const namen = [
    "flaecheWohnen",
    "flaecheGewerbe",
    "mieteMonatIst",
    "mieteMonatSoll",
    "marktmieteWohnen",
    "marktmieteGewerbe",
    "zielKaufpreis",
    "schritt",
  ];
  const roh = await jsonAntwort<
    {
      objekt: Record<string, Roh>;
      einheiten: RohEinheit[];
      hinweise: string[];
    } & Record<string, Roh>
  >({
    system: `${ROLLE}
Aufgabe: Eingangsdaten für das Grenz-Kaufpreistool.
- flaecheWohnen / flaecheGewerbe: vermietbare Flächen in m².
- mieteMonatIst / mieteMonatSoll: Nettokaltmiete pro Monat gesamt (SOLL nur wenn genannt).
- marktmieteWohnen / marktmieteGewerbe: Marktmiete in EUR/m² nur aus Unterlagen (z. B. Mietspiegel, Gutachten) oder Anweisung.
- zielKaufpreis: Preisvorstellung oder Angebotspreis aus Unterlagen oder Anweisung. schritt: Schrittweite der Staffel nur wenn genannt.
- einheiten: alle Mieteinheiten, falls eine Mieterliste vorliegt (für die Summenbildung).
${REGELN}`,
    inhalt: nutzerTeil(e),
    schema: obj({
      objekt: OBJEKT_SCHEMA,
      ...felder(namen),
      einheiten: { type: "array", items: EINHEIT_SCHEMA },
      hinweise: strListe,
    }),
  });
  p.hinweise.push(...roh.hinweise.map(ohneStriche));
  const einheiten = einheitenAus(p, roh.einheiten);
  const s = mietSummen(einheiten);
  const ausListe = "Summe aus der Mieterliste";
  const flaecheWohnen = oder(
    zahl(p, roh.flaecheWohnen, "Fläche Wohnen"),
    berechnet(s.flaecheWohnen, ausListe),
  );
  const flaecheGewerbe = oder(
    zahl(p, roh.flaecheGewerbe, "Fläche Gewerbe"),
    berechnet(s.flaecheGewerbe, ausListe),
  );
  const mieteMonatIst = oder(
    zahl(p, roh.mieteMonatIst, "Miete IST"),
    berechnet(s.mieteMonatIst, ausListe),
  );
  const mieteMonatSoll = oder(
    zahl(p, roh.mieteMonatSoll, "Miete SOLL"),
    berechnet(
      s.mieteMonatSoll !== s.mieteMonatIst ? s.mieteMonatSoll : 0,
      ausListe,
    ),
  );
  const ziel = zahl(p, roh.zielKaufpreis, "Zielkaufpreis");
  const jahr = (mieteMonatIst.wert ?? 0) * 12;
  let basisZiel: Angabe<number> = ziel;
  if (ziel.wert == null && jahr > 0) {
    basisZiel = intern?.faktor
      ? annahme(
          jahr * intern.faktor.mittel,
          `Mittlerer Faktor ${intern.faktor.mittel.toFixed(1)} aus ${intern.anzahl} Grenz-Vergleichsdaten`,
        )
      : annahme(
          jahr * 20,
          "Kein Zielpreis genannt: Staffel um Faktor 20 der IST-Miete",
        );
  }
  const schrittRoh = zahl(p, roh.schritt, "Schrittweite");
  const schritt = schrittRoh.wert
    ? schrittRoh
    : berechnet(
        standardSchritt(basisZiel.wert ?? 0),
        "Schrittweite nach Größenordnung",
      );
  const basis: Angabe<number> =
    basisZiel.wert != null
      ? {
          ...basisZiel,
          wert: staffelBasis(basisZiel.wert, schritt.wert ?? 100_000),
        }
      : { wert: null, beleg: null, geprueft: false };
  if (basis.wert == null)
    p.hinweise.push("Basis-Kaufpreis fehlt: bitte Preisvorstellung angeben.");
  return {
    objekt: objektAus(p, roh.objekt),
    flaecheWohnen,
    flaecheGewerbe,
    mieteMonatIst,
    mieteMonatSoll,
    marktmieteWohnen: zahl(p, roh.marktmieteWohnen, "Marktmiete Wohnen"),
    marktmieteGewerbe: zahl(p, roh.marktmieteGewerbe, "Marktmiete Gewerbe"),
    basisKaufpreis: basis,
    schritt,
  };
}

async function dcfAuswerten(
  e: AuswertungEingabe,
  p: Pruefer,
): Promise<DcfDaten> {
  const annahmen = Object.keys(DCF_STANDARD) as (keyof typeof DCF_STANDARD)[];
  const namen = [
    "kaufpreis",
    "flaeche",
    "mieteJahrIst",
    "marktmieteM2",
    "anzahlEinheiten",
    "exitFaktor",
    ...annahmen,
  ];
  const roh = await jsonAntwort<
    {
      objekt: Record<string, Roh>;
      einheiten: RohEinheit[];
      hinweise: string[];
    } & Record<string, Roh>
  >({
    system: `${ROLLE}
Aufgabe: Eingangsdaten für eine DCF-Kalkulation (10 Jahre, ungehebelt).
- kaufpreis, flaeche (Mietfläche gesamt m²), mieteJahrIst (Jahresnettokaltmiete), marktmieteM2 (EUR/m² und Monat, nur aus Unterlagen oder Anweisung), anzahlEinheiten.
- Annahmen nur füllen, wenn sie in Unterlagen oder Anweisung stehen; Prozentwerte als Dezimalzahl (2 % = 0.02):
  mietsteigerung, anpassungJahre (Jahre bis Marktmiete), mietausfall, verwaltungProEinheit (EUR p. a.), instandhaltungM2 (EUR/m² p. a.), nichtUmlagefaehig, kostensteigerung, diskontierung, grunderwerbsteuer, notarGrundbuch, makler, exitFaktor.
- einheiten: alle Mieteinheiten, falls eine Mieterliste vorliegt.
${REGELN}`,
    inhalt: nutzerTeil(e),
    schema: obj({
      objekt: OBJEKT_SCHEMA,
      ...felder(namen),
      einheiten: { type: "array", items: EINHEIT_SCHEMA },
      hinweise: strListe,
    }),
  });
  p.hinweise.push(...roh.hinweise.map(ohneStriche));
  const einheiten = einheitenAus(p, roh.einheiten);
  const s = mietSummen(einheiten);
  const ausListe = "Summe aus der Mieterliste";
  const kaufpreis = zahl(p, roh.kaufpreis, "Kaufpreis");
  const flaeche = oder(
    zahl(p, roh.flaeche, "Fläche"),
    berechnet(s.flaecheGesamt, ausListe),
  );
  const mieteJahrIst = oder(
    zahl(p, roh.mieteJahrIst, "Jahresmiete IST"),
    berechnet(s.mieteMonatIst * 12, ausListe),
  );
  const marktM2 = zahl(p, roh.marktmieteM2, "Marktmiete");
  const mieteJahrMarkt =
    marktM2.wert && flaeche.wert
      ? {
          wert: marktM2.wert * flaeche.wert * 12,
          beleg: {
            art: "berechnung" as const,
            hinweis: `Marktmiete ${marktM2.wert} €/m² × Fläche × 12`,
          },
          geprueft: marktM2.geprueft,
        }
      : mieteJahrIst.wert
        ? annahme(
            mieteJahrIst.wert,
            "Keine Marktmiete belegt: Marktmiete = IST-Miete",
          )
        : { wert: null, beleg: null, geprueft: false };
  const ann = Object.fromEntries(
    annahmen.map((k) => {
      const v = zahl(p, roh[k], k);
      return [
        k,
        v.wert != null
          ? v
          : annahme(DCF_STANDARD[k].wert, DCF_STANDARD[k].hinweis),
      ];
    }),
  ) as Record<keyof typeof DCF_STANDARD, Angabe<number>>;
  const exitRoh = zahl(p, roh.exitFaktor, "Exit-Faktor");
  const exitFaktor = exitRoh.wert
    ? exitRoh
    : kaufpreis.wert && mieteJahrIst.wert
      ? annahme(
          Math.round((kaufpreis.wert / mieteJahrIst.wert) * 10) / 10,
          "Exit zum Einstiegsfaktor (Kaufpreis / IST-Miete)",
        )
      : annahme(18, "Standard: Exit-Faktor 18");
  const anzahl = oder(
    zahl(p, roh.anzahlEinheiten, "Einheiten"),
    berechnet(
      einheiten.filter((x) => x.nutzung === "Wohnen" || x.nutzung === "Gewerbe")
        .length,
      ausListe,
    ),
  );
  if (!kaufpreis.wert)
    p.hinweise.push("Kaufpreis fehlt: bitte in der Anweisung nennen.");
  return {
    objekt: objektAus(p, roh.objekt),
    kaufpreis,
    flaeche,
    mieteJahrIst,
    mieteJahrMarkt,
    einheiten: anzahl,
    ...ann,
    exitFaktor,
    haltedauer: berechnet(10, "Betrachtungszeitraum 10 Jahre"),
  };
}

async function exposeAuswerten(
  e: AuswertungEingabe,
  p: Pruefer,
): Promise<ExposeDaten> {
  const zahlen = [
    "kaufpreis",
    "mieteJahrIst",
    "mieteJahrSoll",
    "grundstueck",
    "flaecheGesamt",
    "wohneinheiten",
    "flaecheWohnen",
    "gewerbeeinheiten",
    "flaecheGewerbe",
    "sonstigeFlaechen",
    "stellplaetze",
  ];
  const texte = [
    "titelzeile",
    "bodenrichtwert",
    "baujahr",
    "geschosse",
    "bauweise",
    "geschossdecken",
    "fenster",
    "heizsystem",
    "energietraeger",
    "baujahrHeizung",
    "balkone",
    "aufzug",
    "dachgeschoss",
    "denkmalschutz",
    "mikrolage",
    "ausweistyp",
    "energiekennwert",
    "effizienzklasse",
  ];
  const roh = await jsonAntwort<
    {
      objekt: Record<string, Roh>;
      provision: "kaeufer" | "provisionsfrei";
      besonderheiten: Roh[];
      einheiten: RohEinheit[];
      erreichbarkeit: {
        ziel: string;
        minuten: string;
        verkehrsmittel: string;
        q: Q;
      }[];
      hinweise: string[];
    } & Record<string, Roh>
  >({
    system: `${ROLLE}
Aufgabe: Daten für das Verkaufsexposé im Grenz-Format.
- titelzeile: Objekttitel für die Titelseite, höchstens zwei Zeilen mit \\n getrennt (z. B. "Wohn- und Geschäftshaus\\nim Severinsviertel"), belegt durch Unterlage oder Anweisung.
- Investment: kaufpreis, mieteJahrIst/mieteJahrSoll (Jahresnettokaltmiete), provision "kaeufer" (Standard) oder "provisionsfrei" (nur wenn die Anweisung das sagt).
- Objektdaten: grundstueck (m²), bodenrichtwert (Text mit Stichtag), Flächen, Einheiten, Stellplätze.
- Weitere Objektinformationen: baujahr, geschosse, bauweise, geschossdecken, fenster (z. B. "Kunststoff / doppelt verglast"), heizsystem, energietraeger, baujahrHeizung, balkone, aufzug, dachgeschoss, denkmalschutz.
- besonderheiten: 3 bis 6 kurze, belegte Stichpunkte (Lage, Potenzial, Zustand).
- einheiten: Mieterübersicht je Einheit (Wohnungsmieter ohne Namen).
- erreichbarkeit: nur wenn in Unterlagen genannt (Ziel, Minuten, ÖPNV/Auto/zu Fuß).
- mikrolage: 2 bis 4 sachliche Sätze zur Lage, nur aus Unterlagen belegt.
- Energieausweis: ausweistyp, energiekennwert (z. B. "132 kWh/(m²*a)"), effizienzklasse.
${REGELN}`,
    inhalt: nutzerTeil(e),
    schema: obj({
      objekt: OBJEKT_SCHEMA,
      ...felder([...zahlen, ...texte]),
      provision: { type: "string", enum: ["kaeufer", "provisionsfrei"] },
      besonderheiten: { type: "array", items: FELD },
      einheiten: { type: "array", items: EINHEIT_SCHEMA },
      erreichbarkeit: {
        type: "array",
        items: obj({
          ziel: str,
          minuten: str,
          verkehrsmittel: str,
          q: Q_SCHEMA,
        }),
      },
      hinweise: strListe,
    }),
    effort: "high",
  });
  p.hinweise.push(...roh.hinweise.map(ohneStriche));
  const z = Object.fromEntries(
    zahlen.map((k) => [k, zahl(p, roh[k], k)]),
  ) as Record<string, Angabe<number>>;
  const t = Object.fromEntries(
    texte.map((k) => [k, text(p, roh[k], k)]),
  ) as Record<string, Angabe<string>>;
  const erreichbarkeit: Erreichbarkeit[] = [];
  for (const r of roh.erreichbarkeit) {
    const b = belegAus(p, r.q, `Erreichbarkeit ${r.ziel}`);
    if (!b) continue;
    erreichbarkeit.push({
      ziel: ohneStriche(r.ziel),
      minuten: zahlAus(r.minuten),
      verkehrsmittel: r.verkehrsmittel,
      ...b,
    });
  }
  return {
    objekt: objektAus(p, roh.objekt),
    titelzeile: t.titelzeile,
    kaufpreis: z.kaufpreis,
    mieteJahrIst: z.mieteJahrIst,
    mieteJahrSoll: z.mieteJahrSoll,
    vermietungsstand: { wert: null, beleg: null, geprueft: false },
    provision:
      roh.provision === "provisionsfrei" ? "provisionsfrei" : "kaeufer",
    grundstueck: z.grundstueck,
    bodenrichtwert: t.bodenrichtwert,
    flaecheGesamt: z.flaecheGesamt,
    wohneinheiten: z.wohneinheiten,
    flaecheWohnen: z.flaecheWohnen,
    gewerbeeinheiten: z.gewerbeeinheiten,
    flaecheGewerbe: z.flaecheGewerbe,
    sonstigeFlaechen: z.sonstigeFlaechen,
    stellplaetze: z.stellplaetze,
    baujahr: t.baujahr,
    geschosse: t.geschosse,
    bauweise: t.bauweise,
    geschossdecken: t.geschossdecken,
    fenster: t.fenster,
    heizsystem: t.heizsystem,
    energietraeger: t.energietraeger,
    baujahrHeizung: t.baujahrHeizung,
    balkone: t.balkone,
    aufzug: t.aufzug,
    dachgeschoss: t.dachgeschoss,
    denkmalschutz: t.denkmalschutz,
    besonderheiten: roh.besonderheiten
      .map((b, i) => text(p, b, `Besonderheit ${i + 1}`))
      .filter((b) => b.wert),
    mieter: einheitenAus(p, roh.einheiten),
    erreichbarkeit,
    mikrolage: t.mikrolage,
    ausweistyp: t.ausweistyp,
    energiekennwert: t.energiekennwert,
    effizienzklasse: t.effizienzklasse,
  };
}

// ---------- Marktpreisanalyse ----------

export type InternerVergleich = NonNullable<MarktpreisDaten["intern"]> & {
  vergleiche: Vergleichsobjekt[];
};

async function marktpreisObjekteAuswerten(
  e: AuswertungEingabe,
  p: Pruefer,
): Promise<MarktpreisDaten> {
  const zahlen = [
    "grundstueck",
    "wohneinheiten",
    "flaecheWohnen",
    "flaecheGewerbe",
    "mieteJahrIst",
    "mieteJahrSoll",
    "mieteM2Wohnen",
    "mieteM2Gewerbe",
    "preisEigentuemer",
  ];
  const roh = await jsonAntwort<{
    empfaenger: Roh;
    untertitel: string;
    objekte: ({
      bezeichnung: string;
      gewerbeeinheiten: Roh;
      besonderheiten: string[];
      objekt: Record<string, Roh>;
    } & Record<string, Roh>)[];
    hinweise: string[];
  }>({
    system: `${ROLLE}
Aufgabe: Key Facts für eine Vermarktungseinschätzung (bis zu drei Liegenschaften).
- empfaenger: Eigentümer oder Auftraggeber (Name), aus Anweisung oder Unterlagen.
- untertitel: kurze Beschreibung, z. B. "Wohn- und Geschäftshaus in Düsseldorf-Unterbilk".
- je Liegenschaft: bezeichnung (Straße Hausnummer), objekt (Adresse), grundstueck, wohneinheiten, gewerbeeinheiten (Text, z. B. "1 (Arztpraxis)"), flaecheWohnen, flaecheGewerbe, mieteJahrIst, mieteJahrSoll, mieteM2Wohnen, mieteM2Gewerbe (EUR/m² Monat), preisEigentuemer (Preisvorstellung, nur wenn genannt), besonderheiten (2 bis 4 belegte Stichpunkte).
${REGELN}`,
    inhalt: nutzerTeil(e),
    schema: obj({
      empfaenger: FELD,
      untertitel: str,
      objekte: {
        type: "array",
        items: obj({
          bezeichnung: str,
          objekt: OBJEKT_SCHEMA,
          gewerbeeinheiten: FELD,
          besonderheiten: strListe,
          ...felder(zahlen),
        }),
      },
      hinweise: strListe,
    }),
  });
  p.hinweise.push(...roh.hinweise.map(ohneStriche));
  const objekte: EinschaetzungObjekt[] = roh.objekte.slice(0, 3).map((o) => {
    const z = Object.fromEntries(
      zahlen.map((k) => [k, zahl(p, o[k], `${o.bezeichnung}: ${k}`)]),
    ) as Record<string, Angabe<number>>;
    return {
      bezeichnung: ohneStriche(o.bezeichnung),
      grundstueck: z.grundstueck,
      wohneinheiten: z.wohneinheiten,
      gewerbeeinheiten: text(
        p,
        o.gewerbeeinheiten,
        `${o.bezeichnung}: Gewerbeeinheiten`,
      ),
      flaecheWohnen: z.flaecheWohnen,
      flaecheGewerbe: z.flaecheGewerbe,
      mieteJahrIst: z.mieteJahrIst,
      mieteJahrSoll: z.mieteJahrSoll,
      mieteM2Wohnen: z.mieteM2Wohnen,
      mieteM2Gewerbe: z.mieteM2Gewerbe,
      besonderheiten: o.besonderheiten.map(ohneStriche),
      preisGrenz: { wert: null, beleg: null, geprueft: false },
      preisAnmerkung: "",
      preisEigentuemer: z.preisEigentuemer,
      objekt: objektAus(p, o.objekt),
    };
  });
  return {
    empfaenger: text(p, roh.empfaenger, "Empfänger").wert ?? "",
    datum: new Date().toISOString().slice(0, 10),
    untertitel: ohneStriche(roh.untertitel),
    objekte,
    vergleiche: [],
    zusammenfassung: [],
    vorgehen: [],
    intern: null,
  };
}

/**
 * Schritt 2 der Marktpreisanalyse: Websuche nach Vergleichstransaktionen, dann Preisfindung.
 * Vergleiche zählen nur mit URL aus der Suche; der Preis ist eine Einschätzung (als Annahme markiert).
 */
export async function marktpreisRecherche(
  daten: MarktpreisDaten & { objekte: EinschaetzungObjekt[] },
  intern: InternerVergleich | null,
  anweisung: string,
  mitWebsuche: boolean,
): Promise<{ daten: MarktpreisDaten; hinweise: string[]; verworfen: number }> {
  const hinweise: string[] = [];
  let verworfen = 0;
  const objektText = daten.objekte
    .map((o, i) => {
      const adr = o.objekt
        ? [
            o.objekt.strasse.wert,
            o.objekt.plz.wert,
            o.objekt.ort.wert,
            o.objekt.stadtteil.wert,
          ]
            .filter(Boolean)
            .join(", ")
        : o.bezeichnung;
      return `Objekt ${i}: ${adr}; Objektart ${o.objekt?.objektart.wert ?? "?"}; Wohnfläche ${o.flaecheWohnen.wert ?? "?"} m², Gewerbe ${o.flaecheGewerbe.wert ?? "?"} m², JNKM IST ${o.mieteJahrIst.wert ?? "?"} €, SOLL ${o.mieteJahrSoll.wert ?? "?"} €, Ø Miete Wohnen ${o.mieteM2Wohnen.wert ?? "?"} €/m²; Besonderheiten: ${o.besonderheiten.join("; ")}`;
    })
    .join("\n");
  const internText = intern
    ? `Interne Grenz-Vergleichsdaten: ${intern.anzahl} Objekte, Faktor ${intern.faktor ? `${intern.faktor.min.toFixed(1)} bis ${intern.faktor.max.toFixed(1)} (Mittel ${intern.faktor.mittel.toFixed(1)})` : "k. A."}, Preis/m² ${intern.preisM2 ? `${Math.round(intern.preisM2.min)} bis ${Math.round(intern.preisM2.max)} €` : "k. A."}.\n${intern.vergleiche.map((v) => `- ${v.adresse}: ${v.preisart}, ${v.preis ?? "?"} €, ${v.flaeche ?? "?"} m², JNKM ${v.mieteJahr ?? "?"} €`).join("\n")}`
    : "Keine internen Vergleichsdaten.";

  let bericht = "";
  const urls = new Set<string>();
  if (mitWebsuche) {
    const ki = client();
    const nachrichten: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Recherchiere für eine Vermarktungseinschätzung von Grenz & Co. vergleichbare Transaktionen und aktuelle Angebote (Mehrfamilienhäuser, Wohn- und Geschäftshäuser) im selben Ort und möglichst im selben Stadtteil, möglichst aus den letzten 24 Monaten, mit Kaufpreis bzw. Angebotspreis, Mietfläche, Jahresmiete oder Faktor. Suche auch Marktberichte mit Faktoren und Preisen je m² für die Lage. Nenne zu jedem Fund die exakte Quell-URL.\n\n${objektText}\n\n${internText}`,
      },
    ];
    for (let runde = 0; runde <= MAX_FORTSETZUNGEN; runde++) {
      const antwort = await ki.messages
        .stream({
          model: MODELL,
          max_tokens: 32000,
          system: `${ROLLE} Du bist Research-Analyst. Berichte nur, was die Quellen belegen; keine Schätzungen.`,
          output_config: { effort: "medium" },
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: 8,
              user_location: {
                type: "approximate",
                city: "Köln",
                region: "Nordrhein-Westfalen",
                country: "DE",
                timezone: "Europe/Berlin",
              },
            },
            { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
          ],
          messages: nachrichten,
        })
        .finalMessage();
      for (const block of antwort.content) {
        if (
          block.type === "web_search_tool_result" &&
          Array.isArray(block.content)
        ) {
          for (const r of block.content) urls.add(r.url);
        } else if (block.type === "web_fetch_tool_result") {
          const inhalt = block.content as { type?: string; url?: string };
          if (inhalt.type === "web_fetch_result" && inhalt.url)
            urls.add(inhalt.url);
        } else if (block.type === "text") bericht += block.text;
      }
      if (antwort.stop_reason === "refusal")
        throw new Error("Die KI hat die Recherche abgelehnt.");
      if (antwort.stop_reason !== "pause_turn") break;
      nachrichten.push({ role: "assistant", content: antwort.content });
    }
  }

  const roh = await jsonAntwort<{
    vergleiche: {
      adresse: string;
      objektart: string;
      flaeche: string;
      mieteJahr: string;
      preis: string;
      preisart: "kauf" | "angebot";
      datum: string;
      einordnung: string[];
      url: string;
    }[];
    preise: {
      objekt: number;
      preis: string;
      anmerkung: string;
      begruendung: string;
    }[];
    zusammenfassung: string[];
    vorgehen: string[];
  }>({
    system: `${ROLLE}
Aufgabe: Vermarktungseinschätzung abschließen.
- vergleiche: bis zu drei passende Vergleichsobjekte aus dem Recherchebericht (nur mit exakter URL aus dem Bericht) oder aus den internen Grenz-Daten (url = "intern"). preisart "kauf" für Verkäufe, "angebot" für aktuelle Angebote. einordnung: 1 bis 3 Stichpunkte im Vergleich zum Objekt. Zahlen ohne Tausenderpunkte.
- preise: je Objekt (Index) eine realistische Kaufpreis-Einschätzung von Grenz & Co. in EUR, gerundet auf 50.000 €, begründet mit Faktoren und Preisen je m² der Vergleiche. anmerkung: kurzer Zusatz für die Tabelle (z. B. "Garagenhof enthalten") oder leer.
- zusammenfassung: 2 bis 3 Sätze, wie die Einschätzung einzuordnen ist (auch im Verhältnis zur Preisvorstellung des Eigentümers, falls bekannt).
- vorgehen: 3 bis 5 Punkte zum empfohlenen Vermarktungsvorgehen von Grenz & Co. (erster Punkt als Kernaussage).
- Sachlich, keine Superlative, keine Gedankenstriche.`,
    inhalt: `<anweisung>${anweisung || "(keine)"}</anweisung>\n\n<objekte>\n${objektText}\n</objekte>\n\n<intern>\n${internText}\n</intern>\n\n<recherche>\n${bericht || "(keine Websuche)"}\n</recherche>\n\n<gefundene_urls>\n${[...urls].join("\n")}\n</gefundene_urls>`,
    schema: obj({
      vergleiche: {
        type: "array",
        items: obj({
          adresse: str,
          objektart: str,
          flaeche: str,
          mieteJahr: str,
          preis: str,
          preisart: { type: "string", enum: ["kauf", "angebot"] },
          datum: str,
          einordnung: strListe,
          url: str,
        }),
      },
      preise: {
        type: "array",
        items: obj({
          objekt: { type: "integer" },
          preis: str,
          anmerkung: str,
          begruendung: str,
        }),
      },
      zusammenfassung: strListe,
      vorgehen: strListe,
    }),
    effort: "high",
  });

  const vergleiche: Vergleichsobjekt[] = [];
  for (const v of roh.vergleiche) {
    let beleg: Beleg | null = null;
    if (v.url === "intern") {
      const treffer = intern?.vergleiche.find(
        (x) => norm(x.adresse) === norm(v.adresse),
      );
      if (!treffer) {
        verworfen += 1;
        continue;
      }
      vergleiche.push(treffer);
      continue;
    }
    if (urls.has(v.url)) beleg = { art: "web", url: v.url, titel: null };
    else {
      verworfen += 1;
      hinweise.push(`Vergleich ${v.adresse} ohne gefundene Quelle verworfen.`);
      continue;
    }
    vergleiche.push({
      adresse: ohneStriche(v.adresse),
      objektart: ohneStriche(v.objektart),
      flaeche: zahlAus(v.flaeche),
      mieteJahr: zahlAus(v.mieteJahr),
      preis: zahlAus(v.preis),
      preisart: v.preisart === "angebot" ? "angebot" : "kauf",
      datum: datumAus(v.datum),
      einordnung: v.einordnung.map(ohneStriche),
      beleg,
      geprueft: true,
    });
  }
  if (!vergleiche.length && intern?.vergleiche.length)
    vergleiche.push(...intern.vergleiche.slice(0, 3));

  const objekte = daten.objekte.map((o, i) => {
    const pr = roh.preise.find((x) => x.objekt === i);
    const wert = zahlAus(pr?.preis);
    return {
      ...o,
      preisGrenz: wert
        ? annahme(
            wert,
            ohneStriche(
              pr?.begruendung ?? "Einschätzung auf Basis der Vergleiche",
            ),
          )
        : o.preisGrenz,
      preisAnmerkung: ohneStriche(pr?.anmerkung ?? ""),
    };
  });
  return {
    daten: {
      ...daten,
      objekte,
      vergleiche: vergleiche.slice(0, 3),
      zusammenfassung: roh.zusammenfassung.map(ohneStriche),
      vorgehen: roh.vorgehen.map(ohneStriche),
      intern: intern
        ? {
            anzahl: intern.anzahl,
            faktor: intern.faktor,
            preisM2: intern.preisM2,
          }
        : null,
    },
    hinweise,
    verworfen,
  };
}

export async function auswerten(
  e: AuswertungEingabe,
  intern: InternerVergleich | null,
): Promise<ToolErgebnis> {
  const p: Pruefer = {
    unterlagen: e.unterlagen,
    anweisung: e.anweisung,
    verworfen: 0,
    hinweise: [],
  };
  let daten: ToolErgebnis["daten"];
  switch (e.tool) {
    case "mieterliste":
      daten = await mieterlisteAuswerten(e, p);
      break;
    case "kaufpreis":
      daten = await kaufpreisAuswerten(e, p, intern);
      break;
    case "dcf":
      daten = await dcfAuswerten(e, p);
      break;
    case "expose":
      daten = await exposeAuswerten(e, p);
      break;
    case "marktpreis":
      daten = await marktpreisObjekteAuswerten(e, p);
      break;
  }
  return {
    tool: e.tool,
    daten,
    hinweise: [...new Set(p.hinweise)].filter(Boolean),
    verworfen: p.verworfen,
  };
}
