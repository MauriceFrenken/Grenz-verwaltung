/**
 * Die Original-Vorlagen von Grenz & Co. als Data-URL im Server-Bundle (nur über kiVorlageFn
 * nach Anmeldung erreichbar, nicht als öffentliche Datei).
 */

import einschaetzung from "./einschaetzung.pptx?inline";
import expose from "./expose.pptx?inline";
import kaufpreistool from "./kaufpreistool.xlsx?inline";
import mietaufstellung from "./mietaufstellung.xlsx?inline";

const VORLAGEN: Record<string, string> = {
  "expose.pptx": expose,
  "einschaetzung.pptx": einschaetzung,
  "mietaufstellung.xlsx": mietaufstellung,
  "kaufpreistool.xlsx": kaufpreistool,
};

export function vorlageDataUrl(name: string): string {
  const url = VORLAGEN[name];
  if (!url) throw new Error("Unbekannte Vorlage.");
  return url;
}
