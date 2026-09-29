/**
 * Server-Funktionen für EBICS (Init, HPB, Umsätze, Status).
 * Schwere EBICS-Abhängigkeiten nur lazy in den Handlern laden.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";
import { loadEbicsKunden } from "@/lib/ebics/kunden";
import type { EbicsKundeStatusDto } from "@/lib/ebics/types";

export type { EbicsKundeStatusDto };

function asToken(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const token = (data as { supabaseAccessToken?: unknown }).supabaseAccessToken;
  return typeof token === "string" ? token : "";
}

export const ebicsStatusFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();
    const { data: rows, error } = await admin
      .from("v_ebics_kunden")
      .select("*")
      .order("gesellschaft_id");
    if (error) throw new Error(error.message);
    const items: EbicsKundeStatusDto[] = (rows ?? []).map((r) => ({
      id: String(r.id),
      gesellschaftId: String(r.gesellschaft_id),
      gesellschaftName: String(r.gesellschaft_name),
      gesellschaftKuerzel: String(r.gesellschaft_kuerzel),
      status: String(r.status),
      anzahlKonten: Number(r.anzahl_konten) || 0,
      hatSchluessel: Boolean(r.hat_schluessel),
      letzterFehler: (r.letzter_fehler as string | null) ?? null,
      initialisiertAm: (r.initialisiert_am as string | null) ?? null,
      bereitAm: (r.bereit_am as string | null) ?? null,
    }));
    return { items };
  });

export const ebicsInitialisierenFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        gesellschaftId?: string | null;
      },
  )
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();
    const { ebicsInitialisiereKunde } = await import("@/lib/ebics/client");
    const kunden = await loadEbicsKunden(
      admin,
      data.gesellschaftId?.trim() || null,
    );
    const briefe: Array<{
      gesellschaftId: string;
      gesellschaftName: string;
      iniLetterHtml: string;
    }> = [];

    for (const kunde of kunden) {
      if (kunde.status === "bereit") continue;
      const { iniLetterHtml } = await ebicsInitialisiereKunde(admin, kunde);
      const { data: g } = await admin
        .from("gesellschaften")
        .select("name")
        .eq("id", kunde.gesellschaft_id)
        .maybeSingle();
      briefe.push({
        gesellschaftId: kunde.gesellschaft_id,
        gesellschaftName: (g?.name as string) ?? kunde.gesellschaft_id,
        iniLetterHtml,
      });
    }

    return {
      anzahl: briefe.length,
      briefe,
      hinweis:
        "INI-Briefe ausdrucken, unterschreiben und an die Bank senden. Danach „Bank-Freischaltung prüfen“.",
    };
  });

export const ebicsBankFreischaltungPruefenFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        gesellschaftId?: string | null;
      },
  )
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();
    const { ebicsBankSchluesselHolen } = await import("@/lib/ebics/client");
    const kunden = await loadEbicsKunden(
      admin,
      data.gesellschaftId?.trim() || null,
    );
    const ergebnisse: Array<{
      gesellschaftId: string;
      status: "bereit" | "fehler";
      meldung?: string;
    }> = [];

    for (const kunde of kunden) {
      if (kunde.status === "bereit") {
        ergebnisse.push({
          gesellschaftId: kunde.gesellschaft_id,
          status: "bereit",
        });
        continue;
      }
      try {
        await ebicsBankSchluesselHolen(admin, kunde);
        ergebnisse.push({
          gesellschaftId: kunde.gesellschaft_id,
          status: "bereit",
        });
      } catch (err) {
        ergebnisse.push({
          gesellschaftId: kunde.gesellschaft_id,
          status: "fehler",
          meldung: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { ergebnisse };
  });

export const ebicsUmstaetzeHolenFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        laufId: string;
      },
  )
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const laufId = data.laufId?.trim();
    if (!laufId) throw new Error("laufId fehlt");
    const admin = createServiceRoleClient();
    const { syncEbicsFuerLauf } = await import("@/lib/ebics/sync");
    return syncEbicsFuerLauf(admin, laufId);
  });
