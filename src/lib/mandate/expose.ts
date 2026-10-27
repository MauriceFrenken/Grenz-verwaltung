/**
 * Exposé der Mandatsakte: Salesforce-Stammdaten als belegbare Unterlage, Auswahl der Unterlagen
 * und Fotos aus dem Objektordner, Pflichtangaben-Prüfung vor der Freigabe. Rein funktional.
 */

import {
  feldLabel,
  type ExposeInhalt,
  type FeldId,
} from "@/lib/expose-generator/modell";
import type {
  ExposeDaten,
  ToolErgebnis,
  Unterlage,
} from "@/lib/ki-tools/typen";

import type { OrdnerDatei } from "./ordner";

export const SALESFORCE_UNTERLAGE_ID = "salesforce";

/**
 * Stammdaten aus Salesforce als Unterlage mit einer Seite. So belegt die KI Werte mit einem
 * wörtlichen Zitat wie aus jeder anderen Unterlage, und die Prüfung bleibt dieselbe.
 */
export function salesforceUnterlage(
  felder: ExposeInhalt["felder"],
  mandatName: string,
): Unterlage | null {
  const zeilen = (Object.keys(felder) as FeldId[]).flatMap((id) => {
    const f = felder[id];
    return f?.wert ? [`${feldLabel(id)}: ${f.wert}`] : [];
  });
  if (!zeilen.length) return null;
  return {
    id: SALESFORCE_UNTERLAGE_ID,
    name: `Salesforce ${mandatName}`,
    seiten: 1,
    text: `<<<PAGE 1>>>\nStammdaten aus Salesforce (Mandat ${mandatName})\n${zeilen.join("\n")}`,
  };
}

const LESBAR = /\.(pdf|xlsx|xlsm|xls|csv|txt|docx)$/i;
const BILD = /\.(jpe?g|png|heic|webp|tiff?)$/i;

/** Reihenfolge für das Exposé: altes Exposé und Mieterliste tragen die meisten Angaben. */
const REIHENFOLGE = [
  "expose",
  "mieterliste",
  "energieausweis",
  "grundbuch",
  "plaene",
  "technik",
  "teilung",
  "kalkulation",
  "betriebskosten",
  "sonstiges",
] as const;

/** Bis zu `max` lesbare Unterlagen, je Kategorie höchstens zwei (neueste zuerst), bis 20 MB. */
export function unterlagenFuerExpose(
  dateien: OrdnerDatei[],
  max = 8,
): OrdnerDatei[] {
  const auswahl: OrdnerDatei[] = [];
  for (const kat of REIHENFOLGE) {
    auswahl.push(
      ...dateien
        .filter(
          (d) =>
            d.kategorie === kat &&
            LESBAR.test(d.name) &&
            d.groesse > 0 &&
            d.groesse <= 20 * 1024 * 1024,
        )
        .sort((a, b) =>
          (b.geaendertAm ?? "").localeCompare(a.geaendertAm ?? ""),
        )
        .slice(0, 2),
    );
    if (auswahl.length >= max) break;
  }
  return auswahl.slice(0, max);
}

/** Titelbild zuerst (Name wie „Titel“, „Fassade“, „Außen“), dann übrige Fotos, Grundrisse, Karten. */
function bildRang(name: string): number {
  const n = name.toLowerCase();
  if (/titel|cover|fassade|aussen|außen|front|strassen|straßen/.test(n))
    return 0;
  if (/grundriss|floor|plan|schnitt/.test(n)) return 2;
  if (/karte|lageplan|makro|mikro|map|luftbild/.test(n)) return 3;
  return 1;
}

/** Fotos, Grundrisse und Karten aus dem Ordner (höchstens `max`). */
export function fotosFuerExpose(
  dateien: OrdnerDatei[],
  max = 16,
): OrdnerDatei[] {
  return dateien
    .filter((d) => BILD.test(d.name) && d.groesse > 0)
    .sort(
      (a, b) =>
        bildRang(a.name) - bildRang(b.name) ||
        a.unterordner.localeCompare(b.unterordner) ||
        a.name.localeCompare(b.name, "de"),
    )
    .slice(0, max);
}

export type Pflichtpunkt = {
  label: string;
  ok: boolean;
  /** true: Freigabe gesperrt, solange der Punkt fehlt. */
  sperrt: boolean;
  hinweis?: string;
};

const hat = (a: { wert: unknown } | undefined) =>
  a?.wert != null && a.wert !== "";

/**
 * Pflichtangaben vor der Freigabe. Adresse, Kaufpreis und eine Fläche sperren; die Angaben aus
 * dem Energieausweis (§ 87 GEG) sind Pflicht in Immobilienanzeigen, wenn ein Ausweis vorliegt,
 * deshalb nur Warnung: fehlt der Ausweis, druckt die Vorlage den Hinweis „liegt nicht vor“.
 */
export function pflichtangaben(d: ExposeDaten): Pflichtpunkt[] {
  const flaeche =
    hat(d.flaecheGesamt) || hat(d.flaecheWohnen) || hat(d.flaecheGewerbe);
  const energie = [
    d.ausweistyp,
    d.energiekennwert,
    d.energietraeger,
    d.baujahr,
    d.effizienzklasse,
  ];
  const energieDa = energie.filter(hat).length;
  return [
    {
      label: "Adresse",
      ok: hat(d.objekt.strasse) && hat(d.objekt.ort),
      sperrt: true,
    },
    { label: "Kaufpreis", ok: hat(d.kaufpreis), sperrt: true },
    { label: "Fläche", ok: flaeche, sperrt: true },
    {
      label: "Jahresnettokaltmiete (IST)",
      ok: hat(d.mieteJahrIst) || d.mieter.some((m) => m.kaltmieteIst != null),
      sperrt: false,
    },
    {
      label: "Energieausweis (§ 87 GEG)",
      ok: energieDa === energie.length,
      sperrt: false,
      hinweis:
        energieDa === 0
          ? "Kein Energieausweis gefunden. Die Vorlage druckt „liegt nicht vor“; bitte nur so freigeben, wenn das stimmt."
          : energieDa < energie.length
            ? "Angaben aus dem Energieausweis unvollständig (Art, Kennwert, Energieträger, Baujahr, Klasse)."
            : undefined,
    },
  ];
}

export function freigabeGesperrt(punkte: Pflichtpunkt[]): string[] {
  return punkte.filter((p) => p.sperrt && !p.ok).map((p) => p.label);
}

export function exposeDateiname(
  ergebnis: ToolErgebnis<"expose"> | null,
  version: number,
  endung: "pdf" | "pptx",
): string {
  const strasse = ergebnis?.daten.objekt.strasse.wert ?? "Objekt";
  const sauber = strasse.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  return `GrenzCo_Expose_${sauber}_v${version}.${endung}`;
}
