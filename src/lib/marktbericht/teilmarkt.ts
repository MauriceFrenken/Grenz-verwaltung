/** Ordnet Objekte über Ort und PLZ einem Teilmarkt des Rheinlands zu. */

import type { Teilmarkt } from "./typen";

function normal(ort: string): string {
  return ort
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .trim();
}

/**
 * PLZ-Leitbereiche des Rheinlands (Regierungsbezirke Köln und Düsseldorf).
 * 40–42 Düsseldorf, Bergisches Land, Niederrhein; 45–47 westliches Ruhrgebiet und Niederrhein;
 * 50–53 Köln, Aachen, Bonn, Rhein-Sieg.
 */
const RHEINLAND_LEIT = new Set([
  "40",
  "41",
  "42",
  "45",
  "46",
  "47",
  "50",
  "51",
  "52",
  "53",
]);
/** Übrige NRW-Leitbereiche (Westfalen, Ruhrgebiet Ost, OWL, Sauerland, Siegerland). */
const NRW_LEIT = new Set([
  "32",
  "33",
  "34",
  "44",
  "48",
  "49",
  "57",
  "58",
  "59",
]);

const RHEINLAND_ORTE = [
  "aachen",
  "bergheim",
  "bergisch gladbach",
  "bornheim",
  "bruhl",
  "dormagen",
  "duisburg",
  "duren",
  "essen",
  "frechen",
  "grevenbroich",
  "hennef",
  "hilden",
  "hurth",
  "kaarst",
  "kerpen",
  "konigswinter",
  "krefeld",
  "langenfeld",
  "leichlingen",
  "leverkusen",
  "meerbusch",
  "mettmann",
  "moers",
  "monchengladbach",
  "monheim",
  "mulheim",
  "neuss",
  "oberhausen",
  "pulheim",
  "ratingen",
  "remscheid",
  "sankt augustin",
  "siegburg",
  "solingen",
  "troisdorf",
  "velbert",
  "viersen",
  "wesseling",
  "wuppertal",
  "bedburg",
];
const NRW_ORTE = [
  "bergkamen",
  "bielefeld",
  "bochum",
  "bottrop",
  "dortmund",
  "gelsenkirchen",
  "gutersloh",
  "hagen",
  "hamm",
  "herne",
  "iserlohn",
  "lunen",
  "marl",
  "minden",
  "munster",
  "paderborn",
  "recklinghausen",
  "siegen",
  "unna",
  "witten",
];

function plzZahl(plz: string | null | undefined): number | null {
  const m = /\b(\d{5})\b/.exec(plz ?? "");
  return m ? Number(m[1]) : null;
}

export function teilmarktAus(
  ort: string | null | undefined,
  plz: string | null | undefined,
): Teilmarkt {
  const o = ort ? normal(ort) : "";
  if (o.startsWith("koln") || o.startsWith("koeln") || o === "cologne")
    return "Köln";
  if (o.startsWith("dusseldorf") || o.startsWith("duesseldorf"))
    return "Düsseldorf";
  if (o === "bonn" || o.startsWith("bonn-") || o.startsWith("bonn "))
    return "Bonn";

  const z = plzZahl(plz);
  if (z != null) {
    if (z >= 50667 && z <= 51149) return "Köln";
    if (z >= 40210 && z <= 40629) return "Düsseldorf";
    if (z >= 53111 && z <= 53229) return "Bonn";
    const leit = String(z).padStart(5, "0").slice(0, 2);
    if (RHEINLAND_LEIT.has(leit)) return "Übriges Rheinland";
    if (NRW_LEIT.has(leit)) return "Übriges NRW";
    return "Sonstige";
  }
  // Ohne PLZ: größere Städte am Namen erkennen.
  if (RHEINLAND_ORTE.some((x) => o.startsWith(x))) return "Übriges Rheinland";
  if (NRW_ORTE.some((x) => o.startsWith(x))) return "Übriges NRW";
  return "Sonstige";
}
