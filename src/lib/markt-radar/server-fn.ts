/**
 * Server-Funktionen für Investoren und Verkäufer: Radar-Meldungen lesen, Status setzen,
 * Lauf manuell starten, Ankaufsprofile aus dem Salesforce-Cache.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import type { RadarLauf, RadarMeldung, RadarSeite, RadarStatus } from "./typen";

const STATUS: RadarStatus[] = ["neu", "gesehen", "verworfen", "in_salesforce"];

function seiteAus(wert: unknown): RadarSeite {
  return wert === "verkaeufer" ? "verkaeufer" : "kaeufer";
}

type MeldungZeile = {
  id: string;
  seite: RadarSeite;
  akteur: string;
  akteur_typ: string | null;
  ereignis: string;
  transaktion: string | null;
  objektart: string | null;
  ort: string | null;
  volumen_eur: number | string | null;
  ereignis_am: string | null;
  quelle_url: string;
  quelle_titel: string | null;
  quelle_medium: string | null;
  relevanz: number;
  begruendung: string | null;
  sf_kontakt_sf_id: string | null;
  sf_bekannt_als: string | null;
  status: RadarStatus;
  created_at: string;
};

function zuMeldung(z: MeldungZeile): RadarMeldung {
  return {
    id: z.id,
    seite: z.seite,
    akteur: z.akteur,
    akteurTyp: z.akteur_typ,
    ereignis: z.ereignis,
    transaktion: z.transaktion,
    objektart: z.objektart,
    ort: z.ort,
    volumenEur: z.volumen_eur == null ? null : Number(z.volumen_eur),
    ereignisAm: z.ereignis_am,
    quelleUrl: z.quelle_url,
    quelleTitel: z.quelle_titel,
    quelleMedium: z.quelle_medium,
    relevanz: z.relevanz,
    begruendung: z.begruendung ?? "",
    sfKontaktSfId: z.sf_kontakt_sf_id,
    sfBekanntAls: z.sf_bekannt_als,
    status: z.status,
    createdAt: z.created_at,
  };
}

export type RadarDto = {
  meldungen: RadarMeldung[];
  letzterLauf: RadarLauf | null;
};

export const radarLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { seite?: unknown; mitVerworfenen?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      seite: seiteAus(d.seite),
      mitVerworfenen: d.mitVerworfenen === true,
    };
  })
  .handler(async ({ data }): Promise<RadarDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    let abfrage = admin
      .from("markt_radar_meldungen")
      .select("*")
      .eq("seite", data.seite)
      .order("created_at", { ascending: false })
      .order("relevanz", { ascending: false })
      .limit(500);
    if (!data.mitVerworfenen) abfrage = abfrage.neq("status", "verworfen");
    const [{ data: zeilen, error }, { data: lauf }] = await Promise.all([
      abfrage,
      admin
        .from("markt_radar_laeufe")
        .select("*")
        .order("gestartet_am", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    return {
      meldungen: ((zeilen ?? []) as MeldungZeile[]).map(zuMeldung),
      letzterLauf: lauf
        ? {
            id: lauf.id,
            gestartetAm: lauf.gestartet_am,
            beendetAm: lauf.beendet_am,
            ausloeser: lauf.ausloeser,
            status: lauf.status,
            anzahlNeu: lauf.anzahl_neu,
            anzahlGesamt: lauf.anzahl_gesamt,
            fehler: lauf.fehler,
          }
        : null,
    };
  });

export const radarStatusSetzenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown; status?: unknown };
    const status = STATUS.find((s) => s === d.status);
    if (typeof d.id !== "string" || !status)
      throw new Error("Ungültige Eingabe.");
    return { supabaseAccessToken: tokenAus(data), id: d.id, status };
  })
  .handler(async ({ data }) => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const { error } = await createServiceRoleClient()
      .from("markt_radar_meldungen")
      .update({
        status: data.status,
        status_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
        status_am: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Startet einen Lauf sofort (beide Seiten). Dauert einige Minuten. */
export const radarJetztSuchenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }) => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const vor = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: laufend } = await admin
      .from("markt_radar_laeufe")
      .select("id")
      .eq("status", "laeuft")
      .gte("gestartet_am", vor)
      .limit(1);
    if (laufend?.length) throw new Error("Es läuft bereits eine Suche.");
    const { marktRadarAusfuehren } = await import("./lauf");
    return marktRadarAusfuehren(admin, "manuell");
  });

export type AnkaufsprofilZeile = {
  sfId: string;
  name: string | null;
  investor: string | null;
  investorTyp: string | null;
  assetklassen: string[];
  regionen: string[];
  volumenMin: number | null;
  volumenMax: number | null;
  faktorMax: number | null;
  geaendertAm: string | null;
};

export const ankaufsprofileLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<AnkaufsprofilZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const { data: profile, error } = await admin
      .from("sf_ankaufsprofile")
      .select(
        "sf_id, name, kontakt_sf_id, account_sf_id, investor_typ, assetklassen, regionen, volumen_min, volumen_max, faktor_max, sf_geaendert_am",
      )
      .order("sf_geaendert_am", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    const ids = [
      ...new Set(
        (profile ?? [])
          .flatMap((p) => [p.kontakt_sf_id, p.account_sf_id])
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const namen = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data: kontakte } = await admin
        .from("sf_kontakte")
        .select("sf_id, name, firma")
        .in("sf_id", ids.slice(i, i + 500));
      for (const k of kontakte ?? [])
        namen.set(k.sf_id, k.firma ? `${k.name} (${k.firma})` : k.name);
    }
    return (profile ?? []).map((p) => ({
      sfId: p.sf_id,
      name: p.name,
      investor:
        (p.kontakt_sf_id && namen.get(p.kontakt_sf_id)) ||
        (p.account_sf_id && namen.get(p.account_sf_id)) ||
        null,
      investorTyp: p.investor_typ,
      assetklassen: p.assetklassen ?? [],
      regionen: p.regionen ?? [],
      volumenMin: p.volumen_min == null ? null : Number(p.volumen_min),
      volumenMax: p.volumen_max == null ? null : Number(p.volumen_max),
      faktorMax: p.faktor_max == null ? null : Number(p.faktor_max),
      geaendertAm: p.sf_geaendert_am,
    }));
  });
