/**
 * Serverseitig: Transaktionen live aus Salesforce (Transaktion__c ist nicht im sf_*-Cache),
 * Mandate und Grenz-Deals aus den sf_*-Caches, Koordinaten über den Geo-Cache.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { alleSeiten } from "@/lib/server/alle-seiten";
import { testEigentuemer } from "@/lib/server/test-eigentuemer";
import { sfAbfrage, type SfRoh } from "@/lib/sf-sync/client";

import { ergaenzeKoordinaten } from "./geo-cache";
import type { KartenObjekt } from "./server-fn";
import {
  grenzAbschluesse,
  type GrenzDeal,
  type MandatKurz,
  TRANSAKTION_FELDER,
  transaktionZuObjekt,
} from "./transaktionen";

/** Salesforce-Abfrage höchstens alle 10 Minuten. */
const CACHE_MS = 10 * 60 * 1000;
let sfCache: { zeit: number; zeilen: SfRoh[] } | null = null;

async function transaktionenAusSalesforce(): Promise<SfRoh[]> {
  if (sfCache && Date.now() - sfCache.zeit < CACHE_MS) return sfCache.zeilen;
  const zeilen = await sfAbfrage(
    `SELECT ${TRANSAKTION_FELDER} FROM Transaktion__c WHERE IsDeleted = false ORDER BY Id`,
  );
  sfCache = { zeit: Date.now(), zeilen };
  return zeilen;
}

type Roh = Record<string, unknown>;

function daten(v: unknown): Roh {
  return v && typeof v === "object" ? (v as Roh) : {};
}

export async function ladeTransaktionen(
  admin: SupabaseClient,
  geocodeBudget: number,
): Promise<{ objekte: KartenObjekt[]; offen: number }> {
  const [roh, mandate, objekte, deals] = await Promise.all([
    transaktionenAusSalesforce(),
    alleSeiten<Roh>((a, b) =>
      admin
        .from("sf_mandate")
        .select(
          "sf_id, name, status, real_estate_sf_id, eigentuemer_account_sf_id",
        )
        .order("sf_id")
        .range(a, b),
    ),
    alleSeiten<Roh>((a, b) =>
      admin
        .from("sf_real_estate")
        .select("sf_id, sf_daten")
        .order("sf_id")
        .range(a, b),
    ),
    alleSeiten<Roh>((a, b) =>
      admin
        .from("sf_deals")
        .select(
          "sf_id, name, phase, betrag, abschluss_am, mandat_sf_id, record_type, sf_daten",
        )
        .not("mandat_sf_id", "is", null)
        .order("sf_id")
        .range(a, b),
    ),
  ]);

  // Testmandate (Eigentümer „Test…“) ausblenden; je Objekt das aktuellste Mandat, verlorene zuletzt.
  const testIds = await testEigentuemer(
    admin,
    mandate.map((m) => m.eigentuemer_account_sf_id as string | null),
  );
  const mandatJeId = new Map<
    string,
    MandatKurz & { realEstateSfId: string | null }
  >();
  const mandatJeObjekt = new Map<string, MandatKurz>();
  for (const m of mandate) {
    if (testIds.has(String(m.eigentuemer_account_sf_id ?? ""))) continue;
    const kurz = {
      sfId: String(m.sf_id),
      name: String(m.name),
      phase: (m.status as string) ?? null,
      realEstateSfId: (m.real_estate_sf_id as string) ?? null,
    };
    mandatJeId.set(kurz.sfId, kurz);
    if (!kurz.realEstateSfId) continue;
    const bisher = mandatJeObjekt.get(kurz.realEstateSfId);
    if (!bisher || bisher.phase === "Verloren")
      mandatJeObjekt.set(kurz.realEstateSfId, {
        sfId: kurz.sfId,
        name: kurz.name,
        phase: kurz.phase,
      });
  }

  const transaktionen = roh.flatMap((r) => {
    const o = transaktionZuObjekt(r, mandatJeObjekt);
    return o ? [o] : [];
  });
  const eigene = grenzAbschluesse(
    deals
      .filter((d) => !d.record_type || d.record_type === "Real_Estate_Broker")
      .map(
        (d): GrenzDeal => ({
          sfId: String(d.sf_id),
          name: String(d.name),
          phase: (d.phase as string) ?? null,
          betrag: d.betrag == null ? null : Number(d.betrag),
          abschlussAm: (d.abschluss_am as string) ?? null,
          mandatSfId: (d.mandat_sf_id as string) ?? null,
          daten: daten(d.sf_daten),
        }),
      ),
    mandatJeId,
    new Map(objekte.map((o) => [String(o.sf_id), daten(o.sf_daten)])),
    transaktionen,
  );
  const alle = [...eigene, ...transaktionen];

  // Verkäufe zuerst nachschlagen, damit sie als Erstes auf der Karte stehen.
  const reihenfolge = [...alle].sort(
    (a, b) =>
      Number(b.status === "verkauft") - Number(a.status === "verkauft") ||
      (b.eingegangenAm ?? "").localeCompare(a.eingegangenAm ?? ""),
  );
  const offen = await ergaenzeKoordinaten(admin, reihenfolge, geocodeBudget);
  return { objekte: alle, offen };
}
