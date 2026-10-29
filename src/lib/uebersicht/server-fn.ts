/** Server-Funktion für die Business-Übersicht (Startseite). Liest nur die sf_*-Caches. */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import { alleSeiten } from "@/lib/server/alle-seiten";
import { testEigentuemer } from "@/lib/server/test-eigentuemer";

import { berechneUebersicht, type UebersichtDto } from "./berechnen";

export type { UebersichtDto };

function zahl(wert: unknown): number | null {
  if (wert == null || wert === "") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

function text(wert: unknown): string | null {
  return typeof wert === "string" && wert ? wert : null;
}

export const uebersichtLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<UebersichtDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const heute = new Date().toISOString().slice(0, 10);
    const ab = new Date(Date.now() - 120 * 86_400_000).toISOString();

    const [mandate, objekte, deals, aktivitaeten, exposes, stand] =
      await Promise.all([
        admin
          .from("sf_mandate")
          .select(
            "sf_id, name, status, art, angebotspreis, provision_prozent, real_estate_sf_id, eigentuemer_account_sf_id, prognose:sf_daten->Prognostizierte_Provision__c, erstellt:sf_daten->>CreatedDate",
          )
          .limit(5000),
        admin.from("sf_real_estate").select("sf_id, name").limit(5000),
        admin
          .from("sf_deals")
          .select(
            "sf_id, name, phase, betrag, abschluss_am, mandat_sf_id, geschlossen:sf_daten->IsClosed, gewonnen:sf_daten->IsWon, provision:sf_daten->Provision_in__c, kaufpreis:sf_daten->Beurkundeter_Kaufpreis_in__c, erstellt:sf_daten->>CreatedDate",
          )
          .limit(5000),
        alleSeiten<Record<string, unknown>>((a, b) =>
          admin
            .from("sf_aktivitaeten")
            .select("datum, sf_typ, status, art, betreff, mandat_sf_id")
            .gte("datum", ab)
            .order("sf_id")
            .range(a, b),
        ),
        alleSeiten<Record<string, unknown>>((a, b) =>
          admin
            .from("postfach_exposes")
            .select("status, eingegangen_am")
            .order("id")
            .range(a, b),
        ),
        admin
          .from("sf_sync_stand")
          .select("letzter_abruf_am")
          .not("letzter_abruf_am", "is", null),
      ]);
    for (const r of [mandate, objekte, deals, stand])
      if (r.error) throw new Error(r.error.message);

    const testIds = await testEigentuemer(
      admin,
      (mandate.data ?? []).map(
        (m) => m.eigentuemer_account_sf_id as string | null,
      ),
    );
    const objektName = new Map(
      (objekte.data ?? []).map((o) => [String(o.sf_id), String(o.name)]),
    );
    const abrufe = (stand.data ?? [])
      .map((s) => String(s.letzter_abruf_am))
      .sort();

    return berechneUebersicht({
      heute,
      letzterAbruf: abrufe.at(-1) ?? null,
      mandate: (mandate.data ?? []).map((m) => ({
        sfId: String(m.sf_id),
        test: testIds.has(String(m.eigentuemer_account_sf_id ?? "")),
        name: String(m.name),
        status: text(m.status),
        art: text(m.art),
        angebotspreis: zahl(m.angebotspreis),
        provisionProzent: zahl(m.provision_prozent),
        provisionPrognose: zahl(m.prognose),
        erstelltAm: text(m.erstellt),
        objekt: m.real_estate_sf_id
          ? (objektName.get(String(m.real_estate_sf_id)) ?? null)
          : null,
      })),
      deals: (deals.data ?? []).map((d) => ({
        sfId: String(d.sf_id),
        name: String(d.name),
        phase: text(d.phase),
        betrag: zahl(d.betrag),
        abschlussAm: text(d.abschluss_am),
        mandatSfId: text(d.mandat_sf_id),
        geschlossen: d.geschlossen === true,
        gewonnen: d.gewonnen === true,
        provision: zahl(d.provision),
        kaufpreis: zahl(d.kaufpreis),
        erstelltAm: text(d.erstellt),
      })),
      aktivitaeten: aktivitaeten.map((a) => ({
        datum: String(a.datum),
        sfTyp: text(a.sf_typ),
        status: text(a.status),
        art: text(a.art),
        betreff: text(a.betreff),
        mandatSfId: text(a.mandat_sf_id),
      })),
      exposes: exposes.map((x) => ({
        status: text(x.status),
        eingegangenAm: text(x.eingegangen_am),
      })),
    });
  });
