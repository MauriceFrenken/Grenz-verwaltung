/**
 * Server-Funktionen der Deal-Pipeline: lesen die sf_*-Caches (Salesforce ist führend)
 * und speichern von Hand im Board verschobene Stufen (pipeline_stufen, nur in der App).
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";
import { istGeplant } from "@/lib/sf-sync/zaehlen";

import {
  berechnePipeline,
  type DealEingabe,
  type ManuelleStufe,
  type MandatEingabe,
  type ObjektEingabe,
  type PipelineDto,
  type StufeId,
  STUFEN,
} from "./berechnen";

export type { PipelineDto };

/** Manuelle Stufen; fehlt die Tabelle (Migration noch nicht eingespielt), null. */
async function ladeManuell(
  admin: Admin,
): Promise<Map<string, ManuelleStufe> | null> {
  const { data, error } = await admin
    .from("pipeline_stufen")
    .select("karte_id, stufe, auto_stufe, gesetzt_am, gesetzt_von");
  if (error) return null;
  const ids = [
    ...new Set(
      (data ?? []).map((r) => r.gesetzt_von as string | null).filter(Boolean),
    ),
  ] as string[];
  const namen = new Map<string, string>();
  if (ids.length) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id, name")
      .in("id", ids);
    for (const p of profile ?? []) namen.set(String(p.id), String(p.name));
  }
  return new Map(
    (data ?? []).map((r) => [
      String(r.karte_id),
      {
        stufe: r.stufe as StufeId,
        autoStufe: r.auto_stufe as StufeId,
        gesetztAm: String(r.gesetzt_am),
        gesetztVon: r.gesetzt_von
          ? (namen.get(String(r.gesetzt_von)) ?? null)
          : null,
      },
    ]),
  );
}

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
    const [mandate, objekte, deals, aktivitaeten, manuell] = await Promise.all([
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
      alle(
        admin,
        "sf_aktivitaeten",
        "sf_id, mandat_sf_id, datum, sf_typ, art, status",
        ["mandat_sf_id", "datum"],
      ),
      ladeManuell(admin),
    ]);

    const letzteAktivitaet = new Map<string, string>();
    const heute = new Date().toISOString().slice(0, 10);
    for (const a of aktivitaeten) {
      // Geplante (offene) Aufgaben sind keine Aktivität, sonst ruht kein Mandat.
      if (
        istGeplant({
          sfTyp: a.sf_typ as string | null,
          art: a.art as string | null,
          status: a.status as string | null,
        })
      )
        continue;
      const id = String(a.mandat_sf_id);
      const datum = String(a.datum).slice(0, 10);
      if (datum <= heute && datum > (letzteAktivitaet.get(id) ?? ""))
        letzteAktivitaet.set(id, datum);
    }

    const dto = berechnePipeline({
      heute,
      letzteAktivitaet,
      manuell: manuell ?? undefined,
      mandate: mandate.map(
        (m): MandatEingabe => ({
          sfId: String(m.sf_id),
          name: String(m.name),
          status: (m.status as string) ?? null,
          art: (m.art as string) ?? null,
          angebotspreis: zahl(m.angebotspreis),
          provisionProzent: zahl(m.provision_prozent),
          realEstateSfId: (m.real_estate_sf_id as string) ?? null,
          daten: daten(m.sf_daten),
        }),
      ),
      objekte: objekte.map(
        (o): ObjektEingabe => ({
          sfId: String(o.sf_id),
          name: String(o.name),
          ort: (o.ort as string) ?? null,
          daten: daten(o.sf_daten),
        }),
      ),
      deals: deals
        .filter((d) => !d.record_type || d.record_type === "Real_Estate_Broker")
        .map(
          (d): DealEingabe => ({
            sfId: String(d.sf_id),
            name: String(d.name),
            phase: (d.phase as string) ?? null,
            betrag: zahl(d.betrag),
            abschlussAm: (d.abschluss_am as string) ?? null,
            mandatSfId: (d.mandat_sf_id as string) ?? null,
            daten: daten(d.sf_daten),
          }),
        ),
    });
    return { ...dto, manuellMoeglich: manuell !== null };
  });

const STUFE_IDS = new Set<string>(STUFEN.map((s) => s.id));

function stufeAus(v: unknown): StufeId | null {
  return typeof v === "string" && STUFE_IDS.has(v) ? (v as StufeId) : null;
}

/**
 * Setzt die Stufe einer Karte von Hand oder hebt sie auf (stufe null oder gleich der automatischen).
 * Ändert nur die App, nicht Salesforce.
 */
export const pipelineStufeSetzenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const karteId = typeof d.karteId === "string" ? d.karteId.trim() : "";
    const autoStufe = stufeAus(d.autoStufe);
    if (!/^[a-zA-Z0-9]{15,18}$/.test(karteId) || !autoStufe)
      throw new Error("Ungültige Karte.");
    return {
      supabaseAccessToken: tokenAus(data),
      karteId,
      autoStufe,
      stufe: stufeAus(d.stufe),
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    if (!data.stufe || data.stufe === data.autoStufe) {
      const { error } = await admin
        .from("pipeline_stufen")
        .delete()
        .eq("karte_id", data.karteId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await admin.from("pipeline_stufen").upsert({
      karte_id: data.karteId,
      stufe: data.stufe,
      auto_stufe: data.autoStufe,
      gesetzt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
      gesetzt_am: new Date().toISOString(),
    });
    if (error)
      throw new Error(
        /pipeline_stufen/.test(error.message)
          ? "Verschieben ist noch nicht eingerichtet: Die Datenbank-Migration pipeline_stufen fehlt."
          : error.message,
      );
    return { ok: true };
  });
