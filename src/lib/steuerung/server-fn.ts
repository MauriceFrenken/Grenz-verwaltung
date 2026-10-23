/** Server-Funktion für die Steuerungs-Kennzahlen (Maklergeschäft). */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";
import { berechneMakler, type Datenstand } from "./berechnen";
import type { MaklerDto } from "./types";

export type { MaklerDto };

export const maklerKennzahlenLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { supabaseAccessToken?: unknown };
    return {
      supabaseAccessToken:
        typeof d.supabaseAccessToken === "string" ? d.supabaseAccessToken : "",
    };
  })
  .handler(async ({ data }): Promise<MaklerDto> => {
    await microsoftCallerAusJwt(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const { data: rows, error } = await admin
      .from("datenstaende")
      .select("schluessel, stand, quelle, daten")
      .order("stand", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const staende: Datenstand[] = (rows ?? []).map((r) => ({
      schluessel: String(r.schluessel),
      stand: String(r.stand),
      quelle: (r.quelle as string | null) ?? null,
      daten: Array.isArray(r.daten)
        ? (r.daten as Record<string, unknown>[])
        : [],
    }));
    return berechneMakler(staende, new Date().toISOString().slice(0, 10));
  });
