/** Server-Funktionen für die Jahresziele der Übersicht. */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  istZielKennzahl,
  wirksameZiele,
  ZIEL_KENNZAHLEN,
  type ZielKennzahl,
  type ZieleDto,
} from "./typen";

export type { ZieleDto };

function fehlt(message: string): boolean {
  return (
    /unternehmensziele/.test(message) &&
    /does not exist|schema cache|could not find/i.test(message)
  );
}

function jahrAus(wert: unknown): number {
  const j = Number(wert);
  return Number.isInteger(j) && j > 2000 && j < 2100
    ? j
    : new Date().getFullYear();
}

export const zieleLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    jahr: jahrAus((data as { jahr?: unknown } | null)?.jahr),
  }))
  .handler(async ({ data }): Promise<ZieleDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const [ziele, personal] = await Promise.all([
      admin
        .from("unternehmensziele")
        .select("kennzahl, zielwert")
        .eq("jahr", data.jahr),
      admin
        .from("personal_jahreswerte")
        .select("provisionsziel_eur")
        .eq("jahr", data.jahr),
    ]);
    if (ziele.error && !fehlt(ziele.error.message))
      throw new Error(ziele.error.message);

    const werte = Object.fromEntries(
      ZIEL_KENNZAHLEN.map((k) => [k.wert, null]),
    ) as Record<ZielKennzahl, number | null>;
    for (const z of ziele.data ?? []) {
      const n = Number(z.zielwert);
      if (istZielKennzahl(z.kennzahl) && Number.isFinite(n))
        werte[z.kennzahl] = n;
    }
    // Personal-Tabelle kann fehlen; dann gibt es eben keinen Ersatzwert.
    const summe = (personal.data ?? []).reduce(
      (s, p) => s + (Number(p.provisionsziel_eur) || 0),
      0,
    );
    const mitarbeiterProvisionsziel = summe > 0 ? summe : null;
    return {
      jahr: data.jahr,
      tabelle: !ziele.error,
      ...wirksameZiele(data.jahr, werte, mitarbeiterProvisionsziel),
      eingetragen: werte,
      mitarbeiterProvisionsziel,
    };
  });

type SpeichernEingabe = {
  supabaseAccessToken: string;
  jahr: number;
  ziele: Partial<Record<ZielKennzahl, number | null>>;
};

export const zieleSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown): SpeichernEingabe => {
    const d = (data ?? {}) as { jahr?: unknown; ziele?: unknown };
    const roh = (d.ziele ?? {}) as Record<string, unknown>;
    const ziele: SpeichernEingabe["ziele"] = {};
    for (const [k, v] of Object.entries(roh)) {
      if (!istZielKennzahl(k)) continue;
      if (v === null || v === "") ziele[k] = null;
      else {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0)
          throw new Error("Ziele müssen Zahlen ab 0 sein.");
        ziele[k] = n;
      }
    }
    return {
      supabaseAccessToken: tokenAus(data),
      jahr: jahrAus(d.jahr),
      ziele,
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    const eintraege = Object.entries(data.ziele) as Array<
      [ZielKennzahl, number | null]
    >;
    const setzen = eintraege
      .filter(([, v]) => v !== null)
      .map(([kennzahl, zielwert]) => ({
        jahr: data.jahr,
        kennzahl,
        zielwert,
        gesetzt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
        gesetzt_am: new Date().toISOString(),
      }));
    const loeschen = eintraege.filter(([, v]) => v === null).map(([k]) => k);
    if (setzen.length) {
      const r = await admin.from("unternehmensziele").upsert(setzen);
      if (r.error)
        throw new Error(
          fehlt(r.error.message)
            ? "Die Tabelle für Jahresziele ist noch nicht angelegt (Migration 20261029100000_unternehmensziele)."
            : r.error.message,
        );
    }
    if (loeschen.length) {
      const r = await admin
        .from("unternehmensziele")
        .delete()
        .eq("jahr", data.jahr)
        .in("kennzahl", loeschen);
      if (r.error && !fehlt(r.error.message)) throw new Error(r.error.message);
    }
    return { ok: true };
  });
