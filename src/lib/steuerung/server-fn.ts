/** Server-Funktion für die Steuerungs-Kennzahlen (Maklergeschäft). */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";
import { alleSeiten } from "@/lib/server/alle-seiten";

import { berechneMakler, type Datenstand } from "./berechnen";
import { berechneMaklerLive } from "./live";
import type { MaklerDto } from "./types";

export type { MaklerDto };

/** Bekannte Salesforce-User für die Spalte „Betreuer“. */
const SF_USER_NAMEN: Record<string, string> = {
  "005J5000001Uue4IAC": "Sebastian Grenz",
  "005Jy00000CzIcDIAV": "Business Development SG",
  "0052o00000DYsemAAD": "Maurice Frenken",
};

function zahl(wert: unknown): number | null {
  if (wert == null || wert === "") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

function text(wert: unknown): string | null {
  return typeof wert === "string" && wert.trim() ? wert.trim() : null;
}

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
    const heute = new Date().toISOString().slice(0, 10);
    const ab = `${Number(heute.slice(0, 4)) - 2}-01-01`;

    const [
      { data: rows, error },
      mandate,
      objekte,
      deals,
      kampagnen,
      mitglieder,
      aktivitaeten,
      stand,
    ] = await Promise.all([
      admin
        .from("datenstaende")
        .select("schluessel, stand, quelle, daten")
        .order("stand", { ascending: false })
        .order("created_at", { ascending: false }),
      admin
        .from("sf_mandate")
        .select(
          "sf_id, name, status, art, angebotspreis, provision_prozent, real_estate_sf_id, verantwortlich_sf_user_id, fee:sf_daten->>Fee_Model__c, prognose:sf_daten->Prognostizierte_Provision__c, erstellt:sf_daten->>CreatedDate",
        )
        .limit(5000),
      admin.from("sf_real_estate").select("sf_id, name").limit(5000),
      admin
        .from("sf_deals")
        .select(
          "name, phase, betrag, abschluss_am, geschlossen:sf_daten->IsClosed, gewonnen:sf_daten->IsWon, provision:sf_daten->Provision_in__c, kaufpreis:sf_daten->Beurkundeter_Kaufpreis_in__c",
        )
        .limit(5000),
      admin
        .from("sf_kampagnen")
        .select("sf_id, name, status, start_am")
        .limit(5000),
      alleSeiten<Record<string, unknown>>((a, b) =>
        admin
          .from("sf_kampagnen_mitglieder")
          .select("kampagne_sf_id, status")
          .order("sf_id")
          .range(a, b),
      ),
      alleSeiten<Record<string, unknown>>((a, b) =>
        admin
          .from("sf_aktivitaeten")
          .select("datum, sf_typ, art, betreff, status")
          .gte("datum", ab)
          .order("sf_id")
          .range(a, b),
      ),
      admin
        .from("sf_sync_stand")
        .select("letzter_abruf_am")
        .not("letzter_abruf_am", "is", null),
    ]);
    if (error) throw new Error(error.message);
    const staende: Datenstand[] = (rows ?? []).map((r) => ({
      schluessel: String(r.schluessel),
      stand: String(r.stand),
      quelle: (r.quelle as string | null) ?? null,
      daten: Array.isArray(r.daten)
        ? (r.daten as Record<string, unknown>[])
        : [],
    }));
    const statisch = berechneMakler(staende, heute);

    for (const r of [mandate, objekte, deals, kampagnen, stand])
      if (r.error) throw new Error(r.error.message);
    if (!(mandate.data ?? []).length) return statisch;

    const objektName = new Map(
      (objekte.data ?? []).map((o) => [String(o.sf_id), String(o.name)]),
    );
    const live = berechneMaklerLive({
      heute,
      mandate: (mandate.data ?? []).map((m) => ({
        sfId: String(m.sf_id),
        name: String(m.name),
        status: text(m.status),
        art: text(m.art),
        feeModel: text(m.fee),
        angebotspreis: zahl(m.angebotspreis),
        provisionProzent: zahl(m.provision_prozent),
        provisionPrognose: zahl(m.prognose),
        erstelltAm: text(m.erstellt),
        objekt: m.real_estate_sf_id
          ? (objektName.get(String(m.real_estate_sf_id)) ?? null)
          : null,
        betreuer:
          SF_USER_NAMEN[String(m.verantwortlich_sf_user_id ?? "")] ?? null,
      })),
      deals: (deals.data ?? []).map((d) => ({
        name: String(d.name),
        phase: text(d.phase),
        geschlossen: d.geschlossen === true,
        gewonnen: d.gewonnen === true,
        abschlussAm: text(d.abschluss_am),
        kaufpreis: zahl(d.kaufpreis),
        betrag: zahl(d.betrag),
        provision: zahl(d.provision),
      })),
      kampagnen: (kampagnen.data ?? []).map((k) => ({
        sfId: String(k.sf_id),
        name: String(k.name),
        status: text(k.status),
        startAm: text(k.start_am),
      })),
      mitglieder: mitglieder.map((m) => ({
        kampagneSfId: String(m.kampagne_sf_id),
        status: text(m.status),
      })),
      aktivitaeten: aktivitaeten.map((a) => ({
        datum: String(a.datum),
        sfTyp: text(a.sf_typ),
        art: text(a.art),
        betreff: text(a.betreff),
        status: text(a.status),
      })),
    });
    const abrufe = (stand.data ?? [])
      .map((s) => String(s.letzter_abruf_am))
      .sort();
    return {
      ...statisch,
      ...live,
      salesforceLive: { letzterAbruf: abrufe.at(-1) ?? null },
    };
  });
