/** Server-Funktionen: Sync-Stand anzeigen, Verbindung hinterlegen, Sync von Hand oder bei Bedarf starten. */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  hinterlegteVerbindungLesen,
  verbindungEntfernen,
  verbindungHinterlegen,
  type HinterlegteVerbindung,
} from "./hinterlegt";
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
  zugang: "jwt" | "hinterlegt" | "uebergang" | "fehlt";
  verbindung: HinterlegteVerbindung;
  stand: SyncStandZeile[];
};

/** Abstand, ab dem beim Öffnen der App automatisch neu abgerufen wird. */
const AUTO_ABRUF_MINUTEN = 15;

export const salesforceSyncStatusFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<SyncStatusDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const { data: rows, error } = await admin
      .from("sf_sync_stand")
      .select(
        "sf_objekt, letzter_abruf_am, hoechster_systemmodstamp, anzahl, letzter_fehler",
      )
      .order("sf_objekt");
    if (error) throw new Error(error.message);
    const uebergang = Boolean(
      process.env.SALESFORCE_REFRESH_TOKEN ||
      process.env.SALESFORCE_ACCESS_TOKEN,
    );
    const verbindung = await hinterlegteVerbindungLesen(admin);
    return {
      zugang: jwtZugangKonfiguriert()
        ? "jwt"
        : verbindung.status !== "getrennt"
          ? "hinterlegt"
          : uebergang
            ? "uebergang"
            : "fehlt",
      verbindung,
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
    const lauf = () =>
      salesforceSyncAusfuehren(createServiceRoleClient(), { voll: data.voll });
    return mitSfZugangOderSitzung(data.sfSitzung, lauf);
  });

/** Übernimmt die Salesforce-Anmeldung des Administrators für den automatischen Abruf. */
export const salesforceVerbindungHinterlegenFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    sfSitzung: sfSitzungAus(data),
  }))
  .handler(async ({ data }): Promise<HinterlegteVerbindung> => {
    const aufrufer = await pruefeAufrufer(data.supabaseAccessToken, "admin");
    return verbindungHinterlegen(
      createServiceRoleClient(),
      data.sfSitzung?.refreshToken ?? "",
      aufrufer.userId,
    );
  });

export const salesforceVerbindungEntfernenFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<void> => {
    await pruefeAufrufer(data.supabaseAccessToken, "admin");
    await verbindungEntfernen(createServiceRoleClient());
  });

/**
 * Beim Öffnen der App: inkrementeller Abruf, wenn der letzte länger als 15 Minuten her ist und
 * ein Server-Zugang besteht. Ergänzt den täglichen Cron (Vercel Hobby erlaubt nur einen Lauf pro Tag).
 */
export const salesforceSyncWennFaelligFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<{ gestartet: boolean }> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    if (
      !jwtZugangKonfiguriert() &&
      (await hinterlegteVerbindungLesen(admin)).status !== "verbunden"
    ) {
      return { gestartet: false };
    }
    const { data: zuletzt, error } = await admin
      .from("sf_sync_stand")
      .select("letzter_abruf_am")
      .order("letzter_abruf_am", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const letzter = zuletzt?.letzter_abruf_am
      ? new Date(zuletzt.letzter_abruf_am).getTime()
      : 0;
    if (Date.now() - letzter < AUTO_ABRUF_MINUTEN * 60 * 1000)
      return { gestartet: false };

    const { salesforceSyncAusfuehren } = await import("./sync");
    await salesforceSyncAusfuehren(admin);
    return { gestartet: true };
  });
