/** Server-Funktion für die Kennzahlen-Seite. */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";
import { kennzahlenAusDatenbank } from "./laden";
import type { KennzahlenDto } from "./types";

export type { KennzahlenDto };

type Eingabe = { supabaseAccessToken: string; jahr: number };

function heuteIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const kennzahlenLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown): Eingabe => {
    const d = (data ?? {}) as Partial<Eingabe>;
    const jahr = Number(d.jahr);
    return {
      supabaseAccessToken:
        typeof d.supabaseAccessToken === "string" ? d.supabaseAccessToken : "",
      jahr:
        Number.isInteger(jahr) && jahr > 2000 ? jahr : new Date().getFullYear(),
    };
  })
  .handler(async ({ data }): Promise<KennzahlenDto> => {
    await microsoftCallerAusJwt(data.supabaseAccessToken);
    return kennzahlenAusDatenbank(
      createServiceRoleClient(),
      data.jahr,
      heuteIso(),
    );
  });
