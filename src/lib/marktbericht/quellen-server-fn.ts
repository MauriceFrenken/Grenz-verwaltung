/**
 * Server-Funktionen der Bibliothek: Quellen verwalten, sofort suchen lassen, Dokumente
 * erneut auslesen und Vergleichswerte in einen Berichtsentwurf übernehmen.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  bibliothekAuswahl,
  DOKUMENT_SPALTEN,
  dokumentAus,
  QUELLE_SPALTEN,
  quelleAus,
  sichereUrl,
  type MarktberichtDokument,
  type MarktberichtQuelle,
} from "./quellen";
import type { LaufErgebnis } from "./quellen-lauf";
import type { Benchmark, Periode } from "./typen";

export type Bibliothek = {
  quellen: MarktberichtQuelle[];
  dokumente: MarktberichtDokument[];
};

function uuidAus(wert: unknown, was: string): string {
  if (typeof wert !== "string" || !/^[0-9a-f-]{36}$/i.test(wert))
    throw new Error(`Ungültige ${was}.`);
  return wert;
}

function fehler(message: string): Error {
  return new Error(
    /marktbericht_(quellen|dokumente)/.test(message) &&
      /does not exist|schema cache/i.test(message)
      ? "Die Bibliothek ist noch nicht angelegt (Migration 20261025170000_marktbericht_quellen)."
      : message,
  );
}

export const marktberichtBibliothekFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<Bibliothek> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const [q, d] = await Promise.all([
      admin.from("marktbericht_quellen").select(QUELLE_SPALTEN).order("name"),
      admin
        .from("marktbericht_dokumente")
        .select(DOKUMENT_SPALTEN)
        .order("stichtag", { ascending: false, nullsFirst: false })
        .order("gefunden_am", { ascending: false })
        .limit(500),
    ]);
    if (q.error) throw fehler(q.error.message);
    if (d.error) throw fehler(d.error.message);
    return {
      quellen: (q.data ?? []).map(quelleAus),
      dokumente: (d.data ?? []).map(dokumentAus),
    };
  });

/** Eine Quelle sofort durchsuchen und ihre neuen Berichte auslesen (bis ca. 4,5 Minuten). */
export const marktberichtQuelleSuchenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    quelleId: uuidAus((data as { quelleId?: unknown })?.quelleId, "Quelle"),
  }))
  .handler(async ({ data }): Promise<LaufErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const { quellenLauf } = await import("./quellen-lauf");
    return quellenLauf(createServiceRoleClient(), {
      quelleId: data.quelleId,
      deadlineMs: Date.now() + 270_000,
    });
  });

export const marktberichtQuelleSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const name = typeof d.name === "string" ? d.name.trim().slice(0, 120) : "";
    const suchauftrag =
      typeof d.suchauftrag === "string"
        ? d.suchauftrag.trim().slice(0, 600)
        : "";
    return {
      supabaseAccessToken: tokenAus(data),
      id: d.id == null ? null : uuidAus(d.id, "Quelle"),
      name,
      suchauftrag,
      aktiv: d.aktiv !== false,
    };
  })
  .handler(async ({ data }): Promise<MarktberichtQuelle> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    if (data.id) {
      const felder: Record<string, unknown> = { aktiv: data.aktiv };
      if (data.name) felder.name = data.name;
      if (data.suchauftrag) felder.suchauftrag = data.suchauftrag;
      const { data: row, error } = await admin
        .from("marktbericht_quellen")
        .update(felder)
        .eq("id", data.id)
        .select(QUELLE_SPALTEN)
        .single();
      if (error) throw fehler(error.message);
      return quelleAus(row);
    }
    if (!data.name || !data.suchauftrag)
      throw new Error("Bitte Name und Suchauftrag angeben.");
    const kuerzel =
      data.name
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 32) || "quelle";
    const { data: row, error } = await admin
      .from("marktbericht_quellen")
      .insert({
        kuerzel: `${kuerzel}_${Math.random().toString(36).slice(2, 6)}`,
        name: data.name,
        suchauftrag: data.suchauftrag,
      })
      .select(QUELLE_SPALTEN)
      .single();
    if (error) throw fehler(error.message);
    return quelleAus(row);
  });

/** Bericht per Adresse hinzufügen (z. B. ein Link aus einem Newsletter). Wird beim nächsten Lauf ausgelesen. */
export const marktberichtDokumentHinzufuegenFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const url = typeof d.url === "string" ? sichereUrl(d.url) : null;
    if (!url) throw new Error("Bitte eine öffentliche https-Adresse angeben.");
    return {
      supabaseAccessToken: tokenAus(data),
      quelleId: uuidAus(d.quelleId, "Quelle"),
      url,
      titel:
        typeof d.titel === "string" && d.titel.trim()
          ? d.titel.trim().slice(0, 300)
          : url.split("/").pop() || url,
    };
  })
  .handler(async ({ data }): Promise<LaufErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const { error } = await admin.from("marktbericht_dokumente").upsert(
      {
        quelle_id: data.quelleId,
        url: data.url,
        titel: data.titel,
        art: /\.pdf($|\?)/i.test(data.url) ? "pdf" : "html",
        status: "neu",
        versuche: 0,
        fehler: null,
      },
      { onConflict: "url" },
    );
    if (error) throw fehler(error.message);
    const { quellenLauf } = await import("./quellen-lauf");
    // Nur auslesen, nicht die Quelle neu durchsuchen: Suche ist erst in 7 Tagen fällig.
    return quellenLauf(admin, {
      quelleId: data.quelleId,
      deadlineMs: Date.now() + 270_000,
      ohneSuche: true,
    });
  });

export const marktberichtDokumentErneutFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: uuidAus((data as { id?: unknown })?.id, "Dokument-Id"),
  }))
  .handler(async ({ data }): Promise<void> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const { error } = await createServiceRoleClient()
      .from("marktbericht_dokumente")
      .update({ status: "neu", versuche: 0, fehler: null })
      .eq("id", data.id);
    if (error) throw fehler(error.message);
  });

/** Automatisch belegte Vergleichswerte der Bibliothek für die Periode eines Berichts (ohne zu speichern). */
export const marktberichtBibliothekWerteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: uuidAus((data as { id?: unknown })?.id, "Bericht-Id"),
  }))
  .handler(async ({ data }): Promise<Benchmark[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const { data: b, error } = await admin
      .from("marktberichte")
      .select("kennzahlen")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw fehler(error.message);
    if (!b) throw new Error("Marktbericht nicht gefunden.");
    const periode = (b.kennzahlen as { periode: Periode }).periode;
    const [doks, quellen] = await Promise.all([
      admin
        .from("marktbericht_dokumente")
        .select(DOKUMENT_SPALTEN)
        .eq("status", "ausgelesen")
        .limit(1000),
      admin.from("marktbericht_quellen").select("id, name"),
    ]);
    if (doks.error) throw fehler(doks.error.message);
    return bibliothekAuswahl(
      (doks.data ?? []).map(dokumentAus),
      periode,
      new Map((quellen.data ?? []).map((q) => [String(q.id), String(q.name)])),
    );
  });
