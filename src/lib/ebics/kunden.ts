/**
 * EBICS-Kundendaten ohne ebics-client (SSR-sicher).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EbicsKundeRow = {
  id: string;
  gesellschaft_id: string;
  partner_id: string;
  user_id: string;
  host_id: string;
  url: string;
  bank_name: string;
  status: "nicht_initialisiert" | "wartet_auf_bank" | "bereit" | "fehler";
  letzter_fehler: string | null;
};

export async function loadEbicsKunden(
  admin: SupabaseClient,
  gesellschaftId?: string | null,
): Promise<EbicsKundeRow[]> {
  let q = admin.from("ebics_kunden").select(
    "id, gesellschaft_id, partner_id, user_id, host_id, url, bank_name, status, letzter_fehler",
  );
  if (gesellschaftId) q = q.eq("gesellschaft_id", gesellschaftId);
  const { data, error } = await q.order("gesellschaft_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as EbicsKundeRow[];
}
