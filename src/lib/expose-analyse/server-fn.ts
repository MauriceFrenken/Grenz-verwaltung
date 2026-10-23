/** Server-Funktion für die Exposé-Analyse. */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";
import { berechneExposeAnalyse, type RohExpose } from "./berechnen";
import type { ExposeAnalyseDto } from "./types";

export type { ExposeAnalyseDto };

/** Alle Exposés aller Postfächer, auch abgelegte und exportierte. */
export const exposeAnalyseLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { supabaseAccessToken?: unknown };
    return {
      supabaseAccessToken:
        typeof d.supabaseAccessToken === "string" ? d.supabaseAccessToken : "",
    };
  })
  .handler(async ({ data }): Promise<ExposeAnalyseDto> => {
    await microsoftCallerAusJwt(data.supabaseAccessToken);
    const admin = createServiceRoleClient();

    const exposes: RohExpose[] = [];
    const SEITE = 1000;
    for (let von = 0; ; von += SEITE) {
      const { data: rows, error } = await admin
        .from("postfach_exposes")
        .select(
          "id, eingegangen_am, status, absender_name, betreff, exportiert_am, felder",
        )
        .order("eingegangen_am", { ascending: true, nullsFirst: false })
        .order("id")
        .range(von, von + SEITE - 1);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        exposes.push({
          id: String(r.id),
          eingegangenAm: (r.eingegangen_am as string | null) ?? null,
          status: String(r.status),
          absenderName: (r.absender_name as string | null) ?? null,
          betreff: (r.betreff as string | null) ?? null,
          exportiertAm: (r.exportiert_am as string | null) ?? null,
          felder: (r.felder as RohExpose["felder"]) ?? null,
        });
      }
      if (!rows || rows.length < SEITE) break;
    }

    return berechneExposeAnalyse(exposes);
  });
