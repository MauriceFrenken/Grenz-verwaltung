/**
 * Schreibpfad nach Salesforce (Masterplan 3.3): immer über die API, danach den
 * Datensatz sofort neu in den Cache holen. Kein optimistisches Schreiben in sf_*.
 * Aufrufer müssen den Schritt vorher in der UI bestätigen lassen.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { sfRest } from "./client";
import type { SfSyncObjekt } from "./config";
import { sfDatensaetzeNeuHolen, sfDatensatzNeuHolen } from "./sync";

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

export type SammelErgebnis = { ids: string[]; fehler: string[] };

/**
 * Mehrere Datensätze in einem Aufruf anlegen (Composite API, max. 200, nicht alles oder nichts).
 * Nur nach ausdrücklicher Bestätigung in der UI verwenden (Massenänderung).
 */
export async function sfCreateMehrere(
  admin: SupabaseClient,
  objekt: SfSyncObjekt,
  datensaetze: Record<string, unknown>[],
): Promise<SammelErgebnis> {
  if (datensaetze.length > 200) throw new Error("Höchstens 200 Datensätze je Vorgang.");
  if (!datensaetze.length) return { ids: [], fehler: [] };
  const res = await sfRest<{ id?: string; success: boolean; errors?: { message?: string }[] }[]>("/composite/sobjects", {
    method: "POST",
    body: JSON.stringify({ allOrNone: false, records: datensaetze.map((d) => ({ attributes: { type: objekt }, ...d })) }),
  });
  const ids = res.filter((r) => r.success && r.id).map((r) => r.id!);
  const fehler = res.filter((r) => !r.success).map((r) => r.errors?.map((e) => e.message).join("; ") || "Unbekannter Fehler");
  await sfDatensaetzeNeuHolen(admin, objekt, ids);
  return { ids, fehler };
}
