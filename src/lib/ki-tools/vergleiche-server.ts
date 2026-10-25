/**
 * Vergleichsdaten für die Marktpreisanalyse: Angebote aus Exposés und eigene Käufe
 * (v_vergleichsdaten) sowie gewonnene Grenz-Deals aus Salesforce. Nur serverseitig.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Vergleich } from "./vergleiche";

function zahlOderNull(wert: unknown): number | null {
  if (wert === "" || wert == null) return null;
  const n = Number(wert);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function vergleichsdaten(
  admin: SupabaseClient,
): Promise<Vergleich[]> {
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
  const exposeUndObjekte: Vergleich[] = zeilen.map((z) => ({
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
  return [...exposeUndObjekte, ...(await grenzDeals(admin))];
}

/**
 * Eigene Abschlüsse: gewonnene Grenz-Deals mit beurkundetem Kaufpreis (sonst Betrag),
 * Objektdaten über Mandat und Real Estate.
 */
async function grenzDeals(admin: SupabaseClient): Promise<Vergleich[]> {
  const { data: deals, error } = await admin
    .from("sf_deals")
    .select("sf_id, name, betrag, abschluss_am, mandat_sf_id, sf_daten")
    .not("mandat_sf_id", "is", null);
  if (error) throw new Error(error.message);
  const gewonnen = (deals ?? []).filter(
    (d) => (d.sf_daten as Record<string, unknown>)?.IsWon === true,
  );
  if (!gewonnen.length) return [];
  const mandatIds = [...new Set(gewonnen.map((d) => String(d.mandat_sf_id)))];
  const { data: mandate } = await admin
    .from("sf_mandate")
    .select("sf_id, real_estate_sf_id")
    .in("sf_id", mandatIds);
  const reIds = (mandate ?? [])
    .map((m) => m.real_estate_sf_id)
    .filter(Boolean) as string[];
  const { data: objekte } = reIds.length
    ? await admin.from("sf_real_estate").select("*").in("sf_id", reIds)
    : { data: [] };
  const reJeMandat = new Map(
    (mandate ?? []).map((m) => [String(m.sf_id), String(m.real_estate_sf_id)]),
  );
  const objektJeId = new Map(
    (objekte ?? []).map((o) => [String(o.sf_id), o as Record<string, unknown>]),
  );
  const n = (v: unknown) => zahlOderNull(v);
  return gewonnen.flatMap((d) => {
    const o = objektJeId.get(reJeMandat.get(String(d.mandat_sf_id)) ?? "");
    const preis =
      n(
        (d.sf_daten as Record<string, unknown>)?.Beurkundeter_Kaufpreis_in__c,
      ) ?? n(d.betrag);
    if (!preis) return [];
    return [
      {
        quelleId: String(d.sf_id),
        quelle: "salesforce_deal",
        preisart: "kauf" as const,
        stichtag: (d.abschluss_am as string) ?? null,
        adresse: (o?.strasse as string) ?? null,
        plz: (o?.plz as string) ?? null,
        ort: (o?.ort as string) ?? null,
        objektart: (o?.objektart as string) ?? null,
        baujahr: n(o?.baujahr),
        einheiten: n(o?.einheiten),
        flaeche:
          n(o?.mietflaeche_m2) ??
          ((n(o?.wohnflaeche_m2) ?? 0) + (n(o?.gewerbeflaeche_m2) ?? 0) ||
            null),
        kaufpreis: preis,
        jahresmiete: n(o?.jahresnettokaltmiete),
        lat: (o?.geo_lat as number) ?? null,
        lng: (o?.geo_lng as number) ?? null,
      },
    ];
  });
}
