/**
 * EBICS-Kundendaten ohne ebics-client (SSR-sicher).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { GRENZ_GESELLSCHAFT_ID } from "@/lib/grenz";

export type EbicsKundeRow = {
  id: string;
  gesellschaft_id: string;
  partner_id: string;
  user_id: string;
  host_id: string;
  url: string;
  bank_name: string;
  /** Natürliche Person, die den INI-Brief für die Bank unterschreibt. */
  teilnehmer_name: string;
  status: "nicht_initialisiert" | "wartet_auf_bank" | "bereit" | "fehler";
  letzter_fehler: string | null;
};

/** EBICS-Zugänge — ausschließlich die der Gesellschaft Grenz & Co. */
export async function loadEbicsKunden(
  admin: SupabaseClient,
): Promise<EbicsKundeRow[]> {
  const { data, error } = await admin
    .from("ebics_kunden")
    .select(
      "id, gesellschaft_id, partner_id, user_id, host_id, url, bank_name, teilnehmer_name, status, letzter_fehler",
    )
    .eq("gesellschaft_id", GRENZ_GESELLSCHAFT_ID)
    .order("partner_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as EbicsKundeRow[];
}
