/** Server-Funktionen: Sync-Stand anzeigen und Sync von Hand starten. */

import { createServerFn } from "@tanstack/react-start";

import { createServiceRoleClient, pruefeAufrufer, tokenAus } from "@/lib/server/aufrufer";

import { jwtZugangKonfiguriert } from "./jwt";
import type { SyncErgebnis } from "./sync";
import { mitSfZugangOderSitzung, sfSitzungAus } from "./zugang";

export type SyncStandZeile = {
  sfObjekt: string;
  letzterAbrufAm: string | null;
  hoechsterSystemmodstamp: string | null;
  anzahl: number | null;
  letzterFehler: string | null;
};

export type SyncStatusDto = {
  zugang: "jwt" | "uebergang" | "fehlt";
  stand: SyncStandZeile[];
};

export const salesforceSyncStatusFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<SyncStatusDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const { data: rows, error } = await admin
      .from("sf_sync_stand")
      .select("sf_objekt, letzter_abruf_am, hoechster_systemmodstamp, anzahl, letzter_fehler")
      .order("sf_objekt");
    if (error) throw new Error(error.message);
    const uebergang = Boolean(process.env.SALESFORCE_REFRESH_TOKEN || process.env.SALESFORCE_ACCESS_TOKEN);
    return {
      zugang: jwtZugangKonfiguriert() ? "jwt" : uebergang ? "uebergang" : "fehlt",
      stand: (rows ?? []).map((r) => ({
        sfObjekt: String(r.sf_objekt),
        letzterAbrufAm: r.letzter_abruf_am ?? null,
        hoechsterSystemmodstamp: r.hoechster_systemmodstamp ?? null,
        anzahl: r.anzahl ?? null,
        letzterFehler: r.letzter_fehler ?? null,
      })),
    };
  });

export const salesforceSyncStartenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    voll: Boolean((data as { voll?: unknown } | null)?.voll),
    sfSitzung: sfSitzungAus(data),
  }))
  .handler(async ({ data }): Promise<SyncErgebnis[]> => {
    await pruefeAufrufer(data.supabaseAccessToken, "admin");
    const { salesforceSyncAusfuehren } = await import("./sync");
    const lauf = () => salesforceSyncAusfuehren(createServiceRoleClient(), { voll: data.voll });
    return mitSfZugangOderSitzung(data.sfSitzung, lauf);
  });
