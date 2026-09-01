/**
 * TradeAnyMachine-Workflow — Platzhalter, Implementierung folgt.
 */
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";
import { istTamAusFeldern } from "@/lib/trade-any-machine";

import { leseEintrag } from "./store";

export async function dokumentPosteingangZuTam(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<{ platzhalter: true }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  if (row.status !== "analysiert") {
    throw new Error("Nur analysierte Einträge können zu TAM weitergeleitet werden.");
  }

  if (!istTamAusFeldern(row.felder)) {
    throw new Error("Dieser Eintrag ist nicht der TradeAnyMachine GmbH zugeordnet.");
  }

  return { platzhalter: true };
}
