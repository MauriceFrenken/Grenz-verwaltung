/**
 * Einzelner Postfach-Eintrag inklusive PDF — Grundlage für „Check“ (Anzeige im
 * Exposé-Import) und „Export“ (Anhang für Salesforce). Server-only.
 */
import { graphAnhangInhalt } from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { leseEintrag, zuEintrag } from "./store";
import type { PostfachEintragMitPdf } from "./typen";

export async function postfachEintragLaden(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<PostfachEintragMitPdf> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  if (!row.anhang_id) {
    throw new Error("Zu dieser Mail ist kein PDF-Anhang gespeichert.");
  }

  const { accessToken } = await microsoftAccessToken();
  const anhang = await graphAnhangInhalt(
    accessToken,
    row.postfach,
    row.graph_nachricht_id,
    row.anhang_id,
  );

  return {
    eintrag: zuEintrag(row),
    pdf: {
      dateiname: anhang.name || row.anhang_name || "Expose.pdf",
      mimeType: anhang.contentType || "application/pdf",
      base64: anhang.contentBytes ?? "",
    },
  };
}
