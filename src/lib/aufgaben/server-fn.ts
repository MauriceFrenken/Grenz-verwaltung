/**
 * Server-Funktionen des Aufgabenboards. Lesen darf jeder angemeldete Benutzer, Schreiben
 * die schreibenden Rollen. Geschrieben wird per service_role (RLS erlaubt nur select).
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";
import { OFFENE_PHASEN, istTest } from "@/lib/uebersicht/berechnen";

import {
  PRIORITAETEN,
  type Aufgabe,
  type AufgabeFelder,
  type Board,
  type ChecklistenPunkt,
  type Prioritaet,
  type Spalte,
} from "./typen";

const AUFGABE_SPALTEN =
  "id, spalte_id, position, titel, beschreibung, verantwortlich_id, faellig_am, prioritaet, ruecksprache, ruecksprache_am, mandat_sf_id, checkliste, erledigt_am, erstellt_von, created_at, updated_at";

function fehler(message: string): Error {
  return new Error(
    /aufgaben/.test(message) && /does not exist|schema cache/i.test(message)
      ? "Die Datenbank-Tabellen für Aufgaben sind noch nicht angelegt (Migration 20261027100000_aufgaben)."
      : message,
  );
}

function spalteAus(r: Record<string, unknown>): Spalte {
  return {
    id: String(r.id),
    titel: String(r.titel),
    position: Number(r.position),
    erledigt: r.erledigt === true,
  };
}

function checklisteAus(roh: unknown): ChecklistenPunkt[] {
  if (!Array.isArray(roh)) return [];
  return roh
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      id:
        typeof p.id === "string" && p.id
          ? p.id.slice(0, 64)
          : crypto.randomUUID(),
      text: String(p.text ?? "")
        .trim()
        .slice(0, 300),
      erledigt: p.erledigt === true,
    }))
    .filter((p) => p.text.length > 0)
    .slice(0, 50);
}

function aufgabeAus(r: Record<string, unknown>): Aufgabe {
  return {
    id: String(r.id),
    spalteId: String(r.spalte_id),
    position: Number(r.position),
    titel: String(r.titel),
    beschreibung: String(r.beschreibung ?? ""),
    verantwortlichId: (r.verantwortlich_id as string) ?? null,
    faelligAm: (r.faellig_am as string) ?? null,
    prioritaet: r.prioritaet as Prioritaet,
    ruecksprache: String(r.ruecksprache ?? ""),
    ruecksprachAm: (r.ruecksprache_am as string) ?? null,
    mandatSfId: (r.mandat_sf_id as string) ?? null,
    checkliste: checklisteAus(r.checkliste),
    erledigtAm: (r.erledigt_am as string) ?? null,
    erstelltVon: (r.erstellt_von as string) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

// --- Eingaben prüfen -------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function uuid(wert: unknown, feld: string): string {
  if (typeof wert !== "string" || !UUID.test(wert))
    throw new Error(`Ungültige ${feld}.`);
  return wert;
}

function uuidOderNull(wert: unknown, feld: string): string | null {
  return wert === null || wert === undefined || wert === ""
    ? null
    : uuid(wert, feld);
}

function datumOderNull(wert: unknown): string | null {
  return typeof wert === "string" && DATUM.test(wert) ? wert : null;
}

function text(wert: unknown, max: number): string {
  return typeof wert === "string" ? wert.trim().slice(0, max) : "";
}

function titel(wert: unknown): string {
  const t = text(wert, 300);
  if (!t) throw new Error("Bitte einen Titel eingeben.");
  return t;
}

function zahl(wert: unknown): number {
  const n = Number(wert);
  if (!Number.isFinite(n)) throw new Error("Ungültige Position.");
  return n;
}

function felderAus(roh: unknown): AufgabeFelder {
  const d = (roh ?? {}) as Record<string, unknown>;
  const prio = PRIORITAETEN.some((p) => p.wert === d.prioritaet)
    ? (d.prioritaet as Prioritaet)
    : "normal";
  const mandat = text(d.mandatSfId, 40);
  return {
    titel: titel(d.titel),
    beschreibung: text(d.beschreibung, 10_000),
    verantwortlichId: uuidOderNull(d.verantwortlichId, "Person"),
    faelligAm: datumOderNull(d.faelligAm),
    prioritaet: prio,
    ruecksprache: text(d.ruecksprache, 200),
    ruecksprachAm: datumOderNull(d.ruecksprachAm),
    mandatSfId: mandat || null,
    checkliste: checklisteAus(d.checkliste),
  };
}

function zeileAus(f: AufgabeFelder) {
  return {
    titel: f.titel,
    beschreibung: f.beschreibung,
    verantwortlich_id: f.verantwortlichId,
    faellig_am: f.faelligAm,
    prioritaet: f.prioritaet,
    ruecksprache: f.ruecksprache,
    ruecksprache_am: f.ruecksprachAm,
    mandat_sf_id: f.mandatSfId,
    checkliste: f.checkliste,
  };
}

type Admin = ReturnType<typeof createServiceRoleClient>;

async function spalteLaden(admin: Admin, id: string): Promise<Spalte> {
  const { data, error } = await admin
    .from("aufgaben_spalten")
    .select("id, titel, position, erledigt")
    .eq("id", id)
    .maybeSingle();
  if (error) throw fehler(error.message);
  if (!data) throw new Error("Spalte nicht gefunden.");
  return spalteAus(data);
}

/** Ans Ende einer Spalte. */
async function letztePosition(admin: Admin, spalteId: string): Promise<number> {
  const { data } = await admin
    .from("aufgaben")
    .select("position")
    .eq("spalte_id", spalteId)
    .eq("archiviert", false)
    .order("position", { ascending: false })
    .limit(1);
  return (data?.[0] ? Number(data[0].position) : 0) + 1000;
}

// --- Lesen -------------------------------------------------------------------

export const aufgabenBoardFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<Board> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const [spalten, aufgaben, personen, mandate] = await Promise.all([
      admin
        .from("aufgaben_spalten")
        .select("id, titel, position, erledigt")
        .order("position"),
      admin
        .from("aufgaben")
        .select(AUFGABE_SPALTEN)
        .eq("archiviert", false)
        .order("position")
        .limit(2000),
      admin.from("profiles").select("id, name, initialen").order("name"),
      admin
        .from("sf_mandate")
        .select("sf_id, name")
        .in("status", [...OFFENE_PHASEN])
        .order("name")
        .limit(1000),
    ]);
    if (spalten.error) throw fehler(spalten.error.message);
    if (aufgaben.error) throw fehler(aufgaben.error.message);
    return {
      spalten: (spalten.data ?? []).map(spalteAus),
      aufgaben: (aufgaben.data ?? []).map(aufgabeAus),
      personen: (personen.data ?? []).map((p) => ({
        id: String(p.id),
        name: String(p.name || "Ohne Namen"),
        initialen: String(p.initialen || "–"),
      })),
      mandate: (mandate.data ?? [])
        .filter((m) => !istTest(String(m.name)))
        .map((m) => ({ sfId: String(m.sf_id), name: String(m.name) })),
    };
  });

// --- Karten ------------------------------------------------------------------

export const aufgabeAnlegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      supabaseAccessToken: tokenAus(data),
      spalteId: uuid(d.spalteId, "Spalte"),
      felder: felderAus(d.felder),
    };
  })
  .handler(async ({ data }): Promise<Aufgabe> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    const spalte = await spalteLaden(admin, data.spalteId);
    const { data: zeile, error } = await admin
      .from("aufgaben")
      .insert({
        ...zeileAus(data.felder),
        spalte_id: spalte.id,
        position: await letztePosition(admin, spalte.id),
        erledigt_am: spalte.erledigt ? new Date().toISOString() : null,
        erstellt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
      })
      .select(AUFGABE_SPALTEN)
      .single();
    if (error) throw fehler(error.message);
    return aufgabeAus(zeile);
  });

/** Mehrere Aufgaben aus einer Rücksprache auf einmal in die erste Spalte. */
export const ruecksprachErfassenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const titel = Array.isArray(d.titel)
      ? d.titel
          .map((t) => text(t, 300))
          .filter(Boolean)
          .slice(0, 100)
      : [];
    if (titel.length === 0) throw new Error("Keine Aufgaben erkannt.");
    return {
      supabaseAccessToken: tokenAus(data),
      spalteId: uuid(d.spalteId, "Spalte"),
      titel,
      ruecksprache: text(d.ruecksprache, 200),
      ruecksprachAm: datumOderNull(d.ruecksprachAm),
      verantwortlichId: uuidOderNull(d.verantwortlichId, "Person"),
      faelligAm: datumOderNull(d.faelligAm),
      mandatSfId: text(d.mandatSfId, 40) || null,
    };
  })
  .handler(async ({ data }): Promise<Aufgabe[]> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    const spalte = await spalteLaden(admin, data.spalteId);
    const start = await letztePosition(admin, spalte.id);
    const { data: zeilen, error } = await admin
      .from("aufgaben")
      .insert(
        data.titel.map((t, i) => ({
          titel: t,
          spalte_id: spalte.id,
          position: start + i * 1000,
          ruecksprache: data.ruecksprache,
          ruecksprache_am: data.ruecksprachAm,
          verantwortlich_id: data.verantwortlichId,
          faellig_am: data.faelligAm,
          mandat_sf_id: data.mandatSfId,
          erstellt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
        })),
      )
      .select(AUFGABE_SPALTEN);
    if (error) throw fehler(error.message);
    return (zeilen ?? []).map(aufgabeAus);
  });

export const aufgabeSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      supabaseAccessToken: tokenAus(data),
      id: uuid(d.id, "Aufgabe"),
      felder: felderAus(d.felder),
    };
  })
  .handler(async ({ data }): Promise<Aufgabe> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const { data: zeile, error } = await createServiceRoleClient()
      .from("aufgaben")
      .update(zeileAus(data.felder))
      .eq("id", data.id)
      .select(AUFGABE_SPALTEN)
      .single();
    if (error) throw fehler(error.message);
    return aufgabeAus(zeile);
  });

/** Drag & Drop: neue Spalte und Position. Wechsel in eine Erledigt-Spalte setzt erledigt_am. */
export const aufgabeVerschiebenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      supabaseAccessToken: tokenAus(data),
      id: uuid(d.id, "Aufgabe"),
      spalteId: uuid(d.spalteId, "Spalte"),
      position: zahl(d.position),
    };
  })
  .handler(async ({ data }): Promise<Aufgabe> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const spalte = await spalteLaden(admin, data.spalteId);
    const { data: alt, error: e1 } = await admin
      .from("aufgaben")
      .select("erledigt_am")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw fehler(e1.message);
    if (!alt) throw new Error("Aufgabe nicht gefunden.");
    const { data: zeile, error } = await admin
      .from("aufgaben")
      .update({
        spalte_id: spalte.id,
        position: data.position,
        erledigt_am: spalte.erledigt
          ? (alt.erledigt_am ?? new Date().toISOString())
          : null,
      })
      .eq("id", data.id)
      .select(AUFGABE_SPALTEN)
      .single();
    if (error) throw fehler(error.message);
    return aufgabeAus(zeile);
  });

export const aufgabeLoeschenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return { supabaseAccessToken: tokenAus(data), id: uuid(d.id, "Aufgabe") };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const { error } = await createServiceRoleClient()
      .from("aufgaben")
      .delete()
      .eq("id", data.id);
    if (error) throw fehler(error.message);
    return { ok: true };
  });

/** Erledigte Karten einer Spalte archivieren (aus dem Board nehmen, bleiben in der Datenbank). */
export const spalteArchivierenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      supabaseAccessToken: tokenAus(data),
      spalteId: uuid(d.spalteId, "Spalte"),
    };
  })
  .handler(async ({ data }): Promise<{ anzahl: number }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const { data: zeilen, error } = await createServiceRoleClient()
      .from("aufgaben")
      .update({ archiviert: true })
      .eq("spalte_id", data.spalteId)
      .eq("archiviert", false)
      .select("id");
    if (error) throw fehler(error.message);
    return { anzahl: zeilen?.length ?? 0 };
  });

// --- Spalten -----------------------------------------------------------------

export const spalteSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      supabaseAccessToken: tokenAus(data),
      id: uuidOderNull(d.id, "Spalte"),
      titel: titel(d.titel).slice(0, 80),
      erledigt: d.erledigt === true,
      position: d.position === undefined ? null : zahl(d.position),
    };
  })
  .handler(async ({ data }): Promise<Spalte> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    if (data.id) {
      const { data: zeile, error } = await admin
        .from("aufgaben_spalten")
        .update({
          titel: data.titel,
          erledigt: data.erledigt,
          ...(data.position === null ? {} : { position: data.position }),
        })
        .eq("id", data.id)
        .select("id, titel, position, erledigt")
        .single();
      if (error) throw fehler(error.message);
      return spalteAus(zeile);
    }
    const { data: letzte } = await admin
      .from("aufgaben_spalten")
      .select("position")
      .order("position", { ascending: false })
      .limit(1);
    const { data: zeile, error } = await admin
      .from("aufgaben_spalten")
      .insert({
        titel: data.titel,
        erledigt: data.erledigt,
        position:
          data.position ??
          (letzte?.[0] ? Number(letzte[0].position) : 0) + 1000,
      })
      .select("id, titel, position, erledigt")
      .single();
    if (error) throw fehler(error.message);
    return spalteAus(zeile);
  });

/** Nur leere Spalten (auch ohne archivierte Karten) lassen sich löschen. */
export const spalteLoeschenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return { supabaseAccessToken: tokenAus(data), id: uuid(d.id, "Spalte") };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const { count } = await admin
      .from("aufgaben")
      .select("id", { count: "exact", head: true })
      .eq("spalte_id", data.id)
      .eq("archiviert", false);
    if ((count ?? 0) > 0) throw new Error("Die Spalte enthält noch Aufgaben.");
    // Archivierte Karten wandern in die erste andere Spalte, damit sie erhalten bleiben.
    const { data: andere } = await admin
      .from("aufgaben_spalten")
      .select("id")
      .neq("id", data.id)
      .order("position")
      .limit(1);
    if (!andere?.[0])
      throw new Error("Die letzte Spalte kann nicht gelöscht werden.");
    await admin
      .from("aufgaben")
      .update({ spalte_id: andere[0].id })
      .eq("spalte_id", data.id);
    const { error } = await admin
      .from("aufgaben_spalten")
      .delete()
      .eq("id", data.id);
    if (error) throw fehler(error.message);
    return { ok: true };
  });
