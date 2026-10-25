/**
 * Server-Funktion für die Akquise-Seiten: liest live aus Salesforce und wertet aus.
 * Ergebnis bleibt 10 Minuten je Server-Instanz im Speicher; „Neu laden“ umgeht das.
 */

import { createServerFn } from "@tanstack/react-start";

import { pruefeAufrufer, tokenAus } from "@/lib/server/aufrufer";

import type { AkquiseDto } from "./typen";

export type { AkquiseDto };

const GUELTIG_MS = 10 * 60_000;
let zwischenspeicher: { am: number; daten: AkquiseDto } | null = null;

export const akquiseLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { neu?: unknown };
    return { supabaseAccessToken: tokenAus(data), neu: d.neu === true };
  })
  .handler(async ({ data }): Promise<AkquiseDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    if (
      !data.neu &&
      zwischenspeicher &&
      Date.now() - zwischenspeicher.am < GUELTIG_MS
    )
      return zwischenspeicher.daten;
    const [{ akquiseRohdatenLaden }, { akquiseBerechnen }] = await Promise.all([
      import("./abfragen"),
      import("./berechnen"),
    ]);
    const roh = await akquiseRohdatenLaden();
    const daten = akquiseBerechnen(roh, new Date().toISOString().slice(0, 10));
    zwischenspeicher = { am: Date.now(), daten };
    return daten;
  });
