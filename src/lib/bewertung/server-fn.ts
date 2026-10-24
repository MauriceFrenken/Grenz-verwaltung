/**
 * Server-Funktionen indikative Bewertung (Masterplan 4.4).
 * Vergleichsdaten aus v_vergleichsdaten (Angebote aus Exposés, eigene Käufe).
 * Einen Abschlag auf Angebotspreise dürfen nur Administratoren setzen (Sebastian Grenz).
 */

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";
import type { DateiErgebnis, DateiFormat } from "@/lib/vorlagen/export";

import { bewertungDokument } from "./dokument";
import {
  STANDARD_PARAMETER,
  bewerte,
  type BewertungsErgebnis,
  type BewertungsObjekt,
  type BewertungsParameter,
  type Vergleich,
} from "./rechnen";

const ADMIN = new Set(["op_admin", "administrator"]);

function text(wert: unknown, max = 200): string {
  return typeof wert === "string" ? wert.slice(0, max) : "";
}

function zahlOderNull(wert: unknown): number | null {
  if (wert === "" || wert == null) return null;
  const n = Number(wert);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type BewertungsObjektVoll = BewertungsObjekt & {
  adresse: string | null;
  plz: string | null;
  ort: string | null;
};

export type BewertungVorschau = {
  objekt: BewertungsObjektVoll;
  parameter: BewertungsParameter;
  ergebnis: BewertungsErgebnis;
  darfAbschlag: boolean;
};

async function objektAusMandat(
  admin: SupabaseClient,
  mandatSfId: string,
): Promise<BewertungsObjektVoll> {
  const { data: m } = await admin
    .from("sf_mandate")
    .select("name, real_estate_sf_id")
    .eq("sf_id", mandatSfId)
    .maybeSingle();
  if (!m) throw new Error("Mandat nicht gefunden.");
  const o = m.real_estate_sf_id
    ? ((
        await admin
          .from("sf_real_estate")
          .select("*")
          .eq("sf_id", m.real_estate_sf_id)
          .maybeSingle()
      ).data ?? null)
    : null;
  const n = (v: unknown) => zahlOderNull(v);
  const flaeche =
    n(o?.mietflaeche_m2) ??
    ((n(o?.wohnflaeche_m2) ?? 0) + (n(o?.gewerbeflaeche_m2) ?? 0) || null);
  return {
    bezeichnung: (o?.name as string) ?? (m.name as string),
    objektart: (o?.objektart as string) ?? null,
    flaeche,
    jahresmiete: n(o?.jahresnettokaltmiete),
    baujahr: n(o?.baujahr),
    einheiten: n(o?.einheiten),
    lat: (o?.geo_lat as number) ?? null,
    lng: (o?.geo_lng as number) ?? null,
    adresse: (o?.strasse as string) ?? null,
    plz: (o?.plz as string) ?? null,
    ort: (o?.ort as string) ?? null,
  };
}

async function vergleichsdaten(admin: SupabaseClient): Promise<Vergleich[]> {
  const zeilen: Record<string, unknown>[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await admin
      .from("v_vergleichsdaten")
      .select("*")
      .range(von, von + 999);
    if (error) throw new Error(error.message);
    zeilen.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const n = (v: unknown) => zahlOderNull(v);
  return zeilen.map((z) => ({
    quelleId: String(z.quelle_id),
    quelle: String(z.quelle),
    preisart: z.preisart === "kauf" ? "kauf" : "angebot",
    stichtag: (z.stichtag as string) ?? null,
    adresse: (z.adresse as string) ?? null,
    plz: (z.plz as string) ?? null,
    ort: (z.ort as string) ?? null,
    objektart: (z.objektart as string) ?? null,
    baujahr: n(z.baujahr),
    einheiten: n(z.einheiten),
    flaeche:
      n(z.mietflaeche_m2) ??
      ((n(z.wohnflaeche_m2) ?? 0) + (n(z.gewerbeflaeche_m2) ?? 0) || null),
    kaufpreis: n(z.kaufpreis),
    jahresmiete: n(z.jahresnettokaltmiete),
    lat: (z.geo_lat as number) ?? null,
    lng: (z.geo_lng as number) ?? null,
  }));
}

type Eingabe = {
  supabaseAccessToken: string;
  mandatSfId: string;
  objekt: Partial<BewertungsObjektVoll>;
  parameter: Partial<BewertungsParameter>;
};

function eingabeAus(data: unknown): Eingabe {
  const d = (data ?? {}) as {
    mandatSfId?: unknown;
    objekt?: Record<string, unknown>;
    parameter?: Record<string, unknown>;
  };
  const o = d.objekt ?? {};
  const p = d.parameter ?? {};
  return {
    supabaseAccessToken: tokenAus(data),
    mandatSfId: text(d.mandatSfId, 18),
    objekt: {
      objektart:
        o.objektart === undefined ? undefined : text(o.objektart, 80) || null,
      flaeche: o.flaeche === undefined ? undefined : zahlOderNull(o.flaeche),
      jahresmiete:
        o.jahresmiete === undefined ? undefined : zahlOderNull(o.jahresmiete),
      baujahr: o.baujahr === undefined ? undefined : zahlOderNull(o.baujahr),
      einheiten:
        o.einheiten === undefined ? undefined : zahlOderNull(o.einheiten),
    },
    parameter: {
      radiusKm: Math.min(
        100,
        zahlOderNull(p.radiusKm) ?? STANDARD_PARAMETER.radiusKm,
      ),
      maxAlterMonate: Math.min(
        120,
        zahlOderNull(p.maxAlterMonate) ?? STANDARD_PARAMETER.maxAlterMonate,
      ),
      abschlagProzent:
        zahlOderNull(p.abschlagProzent) != null
          ? Math.min(50, zahlOderNull(p.abschlagProzent)!)
          : null,
    },
  };
}

async function berechne(
  data: Eingabe,
): Promise<BewertungVorschau & { nutzerName: string; userId: string }> {
  const aufrufer = await pruefeAufrufer(data.supabaseAccessToken);
  const admin = createServiceRoleClient();
  const basis = await objektAusMandat(admin, data.mandatSfId);
  const objekt: BewertungsObjektVoll = { ...basis };
  for (const [k, v] of Object.entries(data.objekt))
    if (v !== undefined) (objekt as Record<string, unknown>)[k] = v;

  if (objekt.lat == null || objekt.lng == null) {
    const { geocodeExpose } = await import("@/lib/expose-karte/geocode");
    const g = await geocodeExpose({
      adresse: objekt.adresse,
      plz: objekt.plz,
      stadt: objekt.ort,
    }).catch(() => null);
    if (g) {
      objekt.lat = g.lat;
      objekt.lng = g.lng;
    }
  }

  const darfAbschlag = ADMIN.has(aufrufer.rolle);
  if (data.parameter.abschlagProzent != null && !darfAbschlag) {
    throw new Error(
      "Einen Abschlag auf Angebotspreise setzt nur ein Administrator.",
    );
  }
  const { data: profil } = await admin
    .from("profiles")
    .select("name")
    .eq("id", aufrufer.userId)
    .maybeSingle();
  const nutzerName = (profil?.name as string) || "Nutzer";
  const parameter: BewertungsParameter = {
    radiusKm: data.parameter.radiusKm ?? STANDARD_PARAMETER.radiusKm,
    maxAlterMonate:
      data.parameter.maxAlterMonate ?? STANDARD_PARAMETER.maxAlterMonate,
    abschlagProzent: data.parameter.abschlagProzent ?? null,
    abschlagGesetztVon:
      data.parameter.abschlagProzent != null ? nutzerName : null,
  };
  const ergebnis = bewerte(objekt, await vergleichsdaten(admin), parameter);
  return {
    objekt,
    parameter,
    ergebnis,
    darfAbschlag,
    nutzerName,
    userId: aufrufer.userId,
  };
}

export const bewertungVorschauFn = createServerFn({ method: "POST" })
  .validator(eingabeAus)
  .handler(async ({ data }): Promise<BewertungVorschau> => {
    const { objekt, parameter, ergebnis, darfAbschlag } = await berechne(data);
    return { objekt, parameter, ergebnis, darfAbschlag };
  });

export type BewertungZeile = {
  id: string;
  bezeichnung: string;
  status: "entwurf" | "freigegeben" | "verworfen";
  wertMin: number | null;
  wertMittel: number | null;
  wertMax: number | null;
  createdAt: string;
};

export const bewertungenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    mandatSfId: text((data as { mandatSfId?: unknown })?.mandatSfId, 18),
  }))
  .handler(async ({ data }): Promise<BewertungZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const { data: rows, error } = await createServiceRoleClient()
      .from("bewertungen")
      .select(
        "id, bezeichnung, status, wert_min, wert_mittel, wert_max, created_at",
      )
      .eq("mandat_sf_id", data.mandatSfId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      bezeichnung: String(r.bezeichnung),
      status: r.status as BewertungZeile["status"],
      wertMin: r.wert_min == null ? null : Number(r.wert_min),
      wertMittel: r.wert_mittel == null ? null : Number(r.wert_mittel),
      wertMax: r.wert_max == null ? null : Number(r.wert_max),
      createdAt: String(r.created_at),
    }));
  });

/** Speichert den aktuellen Stand als Entwurf (Vergleichsobjekte als Snapshot). */
export const bewertungSpeichernFn = createServerFn({ method: "POST" })
  .validator(eingabeAus)
  .handler(async ({ data }): Promise<{ id: string }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const r = await berechne(data);
    const faktor = r.ergebnis.verfahren.find((v) => v.verfahren === "faktor");
    const vergleich = r.ergebnis.verfahren.find(
      (v) => v.verfahren === "vergleich",
    );
    const { data: neu, error } = await createServiceRoleClient()
      .from("bewertungen")
      .insert({
        mandat_sf_id: data.mandatSfId,
        bezeichnung: r.objekt.bezeichnung,
        strasse: r.objekt.adresse,
        plz: r.objekt.plz,
        ort: r.objekt.ort,
        objektart: r.objekt.objektart,
        methode: "kombiniert",
        eingaben: {
          objekt: r.objekt,
          parameter: r.parameter,
          verfahren: r.ergebnis.verfahren,
          hinweise: r.ergebnis.hinweise,
        },
        wert_min: r.ergebnis.ergebnis?.min ?? null,
        wert_mittel: r.ergebnis.ergebnis?.mittel ?? null,
        wert_max: r.ergebnis.ergebnis?.max ?? null,
        faktor: faktor?.kennwert.mittel ?? null,
        preis_m2: vergleich?.kennwert.mittel ?? null,
        vergleichsobjekte: r.ergebnis.vergleiche,
        begruendung: r.ergebnis.hinweise.join("\n"),
        status: "entwurf",
        erstellt_von: r.userId === "cron" ? null : r.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(neu.id) };
  });

async function ladeGespeichert(admin: SupabaseClient, id: string) {
  const { data: r, error } = await admin
    .from("bewertungen")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) throw new Error("Bewertung nicht gefunden.");
  const eingaben = (r.eingaben ?? {}) as {
    objekt?: BewertungsObjektVoll;
    verfahren?: BewertungsErgebnis["verfahren"];
    hinweise?: string[];
  };
  const ergebnis: BewertungsErgebnis = {
    vergleiche: (r.vergleichsobjekte ?? []) as BewertungsErgebnis["vergleiche"],
    verfahren: eingaben.verfahren ?? [],
    ergebnis:
      r.wert_mittel == null
        ? null
        : {
            min: Number(r.wert_min),
            mittel: Number(r.wert_mittel),
            max: Number(r.wert_max),
          },
    hinweise: eingaben.hinweise ?? [],
  };
  return { zeile: r, objekt: eingaben.objekt!, ergebnis };
}

export const bewertungFreigebenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<void> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    if (aufrufer.userId === "cron")
      throw new Error("Freigeben kann nur ein Nutzer.");
    const { error } = await createServiceRoleClient()
      .from("bewertungen")
      .update({ status: "freigegeben", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "entwurf");
    if (error) throw new Error(error.message);
  });

export const bewertungDateiFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
    format: ((data as { format?: unknown })?.format === "pptx"
      ? "pptx"
      : "pdf") as DateiFormat,
  }))
  .handler(async ({ data }): Promise<DateiErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const g = await ladeGespeichert(admin, data.id);
    const { dokumentAlsDownload } = await import("@/lib/vorlagen/export");
    const inhalt = bewertungDokument(g.objekt, g.ergebnis, {
      freigegeben: g.zeile.status === "freigegeben",
      datum: String(g.zeile.created_at),
    });
    return dokumentAlsDownload(admin, inhalt, data.format);
  });
