/** Zähler für die Badges der Seitenleiste. Liest nur Caches und Radar-Tabellen. */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";
import { OFFENE_PHASEN, istTest } from "@/lib/uebersicht/berechnen";

export type NavZaehler = {
  mandate: number;
  angebotseingang: number;
  investoren: number;
  verkaeufer: number;
  urlaubsantraege: number;
};

export const navZaehlerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<NavZaehler> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const radar = (seite: "kaeufer" | "verkaeufer") =>
      admin
        .from("markt_radar_meldungen")
        .select("id", { count: "exact", head: true })
        .eq("seite", seite)
        .eq("status", "neu");
    const [mandate, exposes, kaeufer, verkaeufer, antraege] = await Promise.all(
      [
        admin
          .from("sf_mandate")
          .select("name")
          .in("status", [...OFFENE_PHASEN])
          .limit(5000),
        admin
          .from("postfach_exposes")
          .select("id", { count: "exact", head: true })
          .in("status", ["neu", "analysiert"]),
        radar("kaeufer"),
        radar("verkaeufer"),
        admin
          .from("personal_abwesenheiten")
          .select("id", { count: "exact", head: true })
          .eq("status", "beantragt"),
      ],
    );
    return {
      mandate: (mandate.data ?? []).filter((m) => !istTest(m.name)).length,
      angebotseingang: exposes.count ?? 0,
      // Vor der Migration gibt es die Radar-Tabelle noch nicht: dann kein Badge.
      investoren: kaeufer.count ?? 0,
      verkaeufer: verkaeufer.count ?? 0,
      urlaubsantraege: antraege.count ?? 0,
    };
  });
