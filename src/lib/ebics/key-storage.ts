/**
 * KeyStorage für ebics-client: speichert verschlüsselte Blobs in ebics_schluessel.
 */

import type { KeyStorage } from "ebics-client";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createDbKeyStorage(
  admin: SupabaseClient,
  ebicsKundeId: string,
): KeyStorage {
  return {
    async write(data: string) {
      const { error } = await admin.from("ebics_schluessel").upsert(
        {
          ebics_kunde_id: ebicsKundeId,
          encrypted_keys: data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ebics_kunde_id" },
      );
      if (error) throw new Error(`EBICS-Schlüssel speichern: ${error.message}`);
    },

    async read() {
      const { data, error } = await admin
        .from("ebics_schluessel")
        .select("encrypted_keys")
        .eq("ebics_kunde_id", ebicsKundeId)
        .maybeSingle();
      if (error) throw new Error(`EBICS-Schlüssel lesen: ${error.message}`);
      if (!data?.encrypted_keys) {
        throw new Error("Keine EBICS-Schlüssel vorhanden.");
      }
      return data.encrypted_keys as string;
    },
  };
}
