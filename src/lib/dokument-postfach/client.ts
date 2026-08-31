/** Client-Helfer für Dokument-Posteingang (Browser-safe). */
import {
  DOKUMENT_KI_FELD_IDS,
  hatAnalyseWerte,
  type DokumentAnalyseFelder,
  type DokumentKiFeldId,
} from "@/lib/dokument-ai";

export { hatAnalyseWerte };

export function felderZuWerten(
  felder: DokumentAnalyseFelder | null,
): Record<DokumentKiFeldId, string> {
  return Object.fromEntries(
    DOKUMENT_KI_FELD_IDS.map((id) => [id, felder?.[id]?.value ?? ""]),
  ) as Record<DokumentKiFeldId, string>;
}

export function werteZuFelder(
  werte: Partial<Record<DokumentKiFeldId, string>>,
  bestehend: DokumentAnalyseFelder | null,
): DokumentAnalyseFelder {
  const basis = bestehend ?? (Object.fromEntries(
    DOKUMENT_KI_FELD_IDS.map((id) => [
      id,
      { value: null, verbatimQuote: null, page: null, konfidenz: 0 },
    ]),
  ) as DokumentAnalyseFelder);

  const out = { ...basis };
  for (const id of DOKUMENT_KI_FELD_IDS) {
    if (id in werte) {
      out[id] = {
        ...basis[id],
        value: werte[id]?.trim() || null,
      };
    }
  }
  return out;
}
