/** Server-Funktion der Deal-Pipeline: liest die sf_*-Caches (nur lesen, Salesforce ist führend). */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  berechnePipeline,
  type DealEingabe,
  type MandatEingabe,
  type ObjektEingabe,
  type PipelineDto,
} from "./berechnen";

export type { PipelineDto };

type Roh = Record<string, unknown>;
type Admin = ReturnType<typeof createServiceRoleClient>;

const SEITE = 1000;

async function alle(
  admin: Admin,
  tabelle: string,
  spalten: string,
  /** Nur Zeilen, in denen diese Spalten gefüllt sind. */
  gefuellt: string[] = [],
): Promise<Roh[]> {
  const zeilen: Roh[] = [];
  for (let von = 0; ; von += SEITE) {
    let q = admin
      .from(tabelle)
      .select(spalten)
      .order("sf_id")
      .range(von, von + SEITE - 1);
    for (const spalte of gefuellt) q = q.not(spalte, "is", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    zeilen.push(...((data ?? []) as unknown as Roh[]));
    if (!data || data.length < SEITE) return zeilen;
  }
}

function zahl(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function daten(v: unknown): Roh {
  return v && typeof v === "object" ? (v as Roh) : {};
}

export const pipelineLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<PipelineDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const [mandate, objekte, deals, aktivitaeten] = await Promise.all([
      alle(
        admin,
        "sf_mandate",
        "sf_id, name, status, art, angebotspreis, provision_prozent, real_estate_sf_id, sf_daten",
      ),
      alle(admin, "sf_real_estate", "sf_id, name, ort, sf_daten"),
      alle(
        admin,
        "sf_deals",
        "sf_id, name, phase, betrag, abschluss_am, mandat_sf_id, record_type, sf_daten",
      ),
      alle(admin, "sf_aktivitaeten", "sf_id, mandat_sf_id, datum", [
        "mandat_sf_id",
        "datum",
      ]),
    ]);

    const letzteAktivitaet = new Map<string, string>();
    const heute = new Date().toISOString().slice(0, 10);
    for (const a of aktivitaeten) {
      const id = String(a.mandat_sf_id);
      const datum = String(a.datum).slice(0, 10);
      if (datum <= heute && datum > (letzteAktivitaet.get(id) ?? ""))
        letzteAktivitaet.set(id, datum);
    }

    return berechnePipeline({
      heute,
      letzteAktivitaet,
      mandate: mandate.map((m): MandatEingabe => ({
        sfId: String(m.sf_id),
        name: String(m.name),
        status: (m.status as string) ?? null,
        art: (m.art as string) ?? null,
        angebotspreis: zahl(m.angebotspreis),
        provisionProzent: zahl(m.provision_prozent),
        realEstateSfId: (m.real_estate_sf_id as string) ?? null,
        daten: daten(m.sf_daten),
      })),
      objekte: objekte.map((o): ObjektEingabe => ({
        sfId: String(o.sf_id),
        name: String(o.name),
        ort: (o.ort as string) ?? null,
        daten: daten(o.sf_daten),
      })),
      deals: deals
        .filter((d) => !d.record_type || d.record_type === "Real_Estate_Broker")
        .map((d): DealEingabe => ({
          sfId: String(d.sf_id),
          name: String(d.name),
          phase: (d.phase as string) ?? null,
          betrag: zahl(d.betrag),
          abschlussAm: (d.abschluss_am as string) ?? null,
          mandatSfId: (d.mandat_sf_id as string) ?? null,
          daten: daten(d.sf_daten),
        })),
    });
  });
