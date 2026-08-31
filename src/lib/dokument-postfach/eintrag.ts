/**
 * Einzelner Dokument-Posteingang-Eintrag inkl. Anhang. Server-only.
 */
import { graphAnhangInhalt } from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { leseEintrag, zuEintrag } from "./store";
import type { DokumentPosteingangMitAnhang } from "./typen";

export async function dokumentPosteingangEintragLaden(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<DokumentPosteingangMitAnhang> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  if (!row.anhang_id) {
    throw new Error("Zu dieser Mail ist kein Anhang gespeichert.");
  }

  const { accessToken } = await microsoftAccessToken();
  const anhang = await graphAnhangInhalt(
    accessToken,
    row.postfach,
    row.graph_nachricht_id,
    row.anhang_id,
  );

  const mimeType =
    anhang.contentType || row.anhang_content_type || "application/octet-stream";

  return {
    eintrag: zuEintrag(row),
    anhang: {
      dateiname: anhang.name || row.anhang_name || "Dokument",
      mimeType,
      base64: anhang.contentBytes ?? "",
    },
  };
}
