/** Client-Helfer für Postfach-Einträge (Browser-safe). */
import {
  EXPOSE_FELD_IDS,
  type ExposeFelder,
  type ExposeFeldId,
} from "@/lib/expose-ai";

import { base64ZuBytes } from "./base64";

export { base64ZuBytes };

export function base64ZuFile(
  base64: string,
  dateiname: string,
  mimeType = "application/pdf",
): File {
  const bytes = base64ZuBytes(base64);
  return new File([bytes], dateiname, { type: mimeType });
}

/** Gespeicherte KI-Felder auf die reinen Werte reduzieren (Salesforce-Draft). */
export function felderZuWerten(
  felder: ExposeFelder | null,
): Record<ExposeFeldId, string> {
  return Object.fromEntries(
    EXPOSE_FELD_IDS.map((id) => [id, felder?.[id]?.value ?? ""]),
  ) as Record<ExposeFeldId, string>;
}

export function hatWerte(felder: ExposeFelder | null): boolean {
  if (!felder) return false;
  return EXPOSE_FELD_IDS.some((id) => (felder[id]?.value ?? "").trim());
}
