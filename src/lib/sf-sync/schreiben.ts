/**
 * Schreibpfad nach Salesforce (Masterplan 3.3): immer über die API, danach den
 * Datensatz sofort neu in den Cache holen. Kein optimistisches Schreiben in sf_*.
 * Aufrufer müssen den Schritt vorher in der UI bestätigen lassen.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { sfRest } from "./client";
import type { SfSyncObjekt } from "./config";
import { sfDatensatzNeuHolen } from "./sync";

export async function sfCreate(
  admin: SupabaseClient,
  objekt: SfSyncObjekt | "ContentVersion" | "ContentDocumentLink",
  felder: Record<string, unknown>,
): Promise<string> {
  const res = await sfRest<{ id: string; success: boolean; errors?: unknown[] }>(`/sobjects/${objekt}`, {
    method: "POST",
    body: JSON.stringify(felder),
  });
  if (!res?.id) throw new Error(`Salesforce hat keinen ${objekt}-Datensatz angelegt.`);
  if (objekt !== "ContentVersion" && objekt !== "ContentDocumentLink") {
    await sfDatensatzNeuHolen(admin, objekt, res.id);
  }
  return res.id;
}

export async function sfUpdate(
  admin: SupabaseClient,
  objekt: SfSyncObjekt,
  sfId: string,
  felder: Record<string, unknown>,
): Promise<void> {
  await sfRest<void>(`/sobjects/${objekt}/${encodeURIComponent(sfId)}`, {
    method: "PATCH",
    body: JSON.stringify(felder),
  });
  await sfDatensatzNeuHolen(admin, objekt, sfId);
}
