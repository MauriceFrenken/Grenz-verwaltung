/** Ampel der Fachlogik: grün ok, gelb prüfen, rot überfällig/handeln, grau neutral/offen. */
export type Ampel = "gruen" | "gelb" | "rot" | "grau";

export const AMPEL_LABEL: Record<Ampel, string> = {
  gruen: "OK",
  gelb: "Prüfen",
  rot: "Überfällig",
  grau: "Offen",
};

export function schlechtesteAmpel(ampeln: Ampel[]): Ampel {
  if (ampeln.includes("rot")) return "rot";
  if (ampeln.includes("gelb")) return "gelb";
  if (ampeln.includes("gruen")) return "gruen";
  return "grau";
}
