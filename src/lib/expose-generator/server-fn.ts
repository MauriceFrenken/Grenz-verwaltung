/**
 * Server-Funktionen Exposé/Teaser-Generator (Masterplan 4.1).
 * Entwürfe liegen in dokument_entwuerfe. Freigabe nur durch Nutzer und nur bei bestandener
 * Pflichtangaben-Prüfung; die Ablage in Salesforce erfolgt erst nach Bestätigung in der UI.
 */

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
  type Aufrufer,
} from "@/lib/server/aufrufer";
import { mitSfZugangOderSitzung, sfSitzungAus } from "@/lib/sf-sync/zugang";
import type { DateiErgebnis, DateiFormat } from "@/lib/vorlagen/export";
import type { Quelle } from "@/lib/vorlagen/typen";

import {
  FELD_IDS,
  exposeDokument,
  leererInhalt,
  pruefePflichtangaben,
  vorbelegungAusSalesforce,
  zitatAufSeite,
  type Aussage,
  type ExposeInhalt,
  type ExposeTyp,
  type FeldId,
  type FeldWert,
  type Pruefung,
  type TextAbschnitt,
} from "./modell";

function text(wert: unknown, max = 2000): string {
  return typeof wert === "string" ? wert.slice(0, max) : "";
}

function typAus(wert: unknown): ExposeTyp {
  return wert === "teaser" ? "teaser" : "expose";
}

export type EntwurfZeile = {
  id: string;
  typ: ExposeTyp;
  titel: string;
  status:
    "entwurf" | "in_pruefung" | "freigegeben" | "versendet" | "archiviert";
  version: number;
  updatedAt: string;
  freigegebenAm: string | null;
  sfContentDocumentId: string | null;
};

export type EntwurfVoll = EntwurfZeile & {
  mandatSfId: string | null;
  /** Inhalt ohne Volltext der Unterlagen (nur Name und Seitenzahl). */
  inhalt: Omit<ExposeInhalt, "unterlagen"> & {
    unterlagen: { id: string; name: string; seiten: number }[];
  };
  pruefung: Pruefung;
};

const SPALTEN =
  "id, typ, titel, status, version, updated_at, freigegeben_am, sf_content_document_id";

function zeile(r: Record<string, unknown>): EntwurfZeile {
  return {
    id: String(r.id),
    typ: typAus(r.typ),
    titel: String(r.titel),
    status: r.status as EntwurfZeile["status"],
    version: Number(r.version ?? 1),
    updatedAt: String(r.updated_at),
    freigegebenAm: (r.freigegeben_am as string) ?? null,
    sfContentDocumentId: (r.sf_content_document_id as string) ?? null,
  };
}

function inhaltAus(roh: unknown): ExposeInhalt {
  const i = (roh ?? {}) as Partial<ExposeInhalt>;
  return {
    ...leererInhalt(),
    ...i,
    felder: i.felder ?? {},
    texte: i.texte ?? {},
    luecken: i.luecken ?? [],
    belege: i.belege ?? [],
    unterlagen: i.unterlagen ?? [],
  };
}

async function ladeRoh(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from("dokument_entwuerfe")
    .select(`${SPALTEN}, mandat_sf_id, inhalt`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Entwurf nicht gefunden.");
  return {
    ...zeile(data),
    mandatSfId: (data.mandat_sf_id as string) ?? null,
    inhalt: inhaltAus(data.inhalt),
  };
}

async function rechtstexte(admin: SupabaseClient, typ: ExposeTyp) {
  const { ladeVorlage } = await import("@/lib/vorlagen/laden");
  return (await ladeVorlage(admin, typ)).design;
}

async function ladeVoll(
  admin: SupabaseClient,
  id: string,
): Promise<EntwurfVoll> {
  const roh = await ladeRoh(admin, id);
  const pruefung = pruefePflichtangaben(
    roh.typ,
    roh.inhalt,
    await rechtstexte(admin, roh.typ),
  );
  return {
    ...roh,
    inhalt: {
      ...roh.inhalt,
      unterlagen: roh.inhalt.unterlagen.map((u) => ({
        id: u.id,
        name: u.name,
        seiten: u.seiten,
      })),
    },
    pruefung,
  };
}

async function nutzerName(
  admin: SupabaseClient,
  aufrufer: Aufrufer,
): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("name")
    .eq("id", aufrufer.userId)
    .maybeSingle();
  return (data?.name as string) || "Nutzer";
}

export const entwuerfeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    mandatSfId: text((data as { mandatSfId?: unknown })?.mandatSfId, 18),
  }))
  .handler(async ({ data }): Promise<EntwurfZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const { data: rows, error } = await createServiceRoleClient()
      .from("dokument_entwuerfe")
      .select(SPALTEN)
      .eq("mandat_sf_id", data.mandatSfId)
      .in("typ", ["expose", "teaser"])
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(zeile);
  });

export const entwurfAnlegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      mandatSfId?: unknown;
      typ?: unknown;
      vorlageId?: unknown;
    };
    return {
      supabaseAccessToken: tokenAus(data),
      mandatSfId: text(d.mandatSfId, 18),
      typ: typAus(d.typ),
      vorlageId: text(d.vorlageId, 40),
    };
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    const { data: mandat, error } = await admin
      .from("sf_mandate")
      .select("*")
      .eq("sf_id", data.mandatSfId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!mandat) throw new Error("Mandat nicht gefunden.");
    const objekt = mandat.real_estate_sf_id
      ? ((
          await admin
            .from("sf_real_estate")
            .select("*")
            .eq("sf_id", mandat.real_estate_sf_id)
            .maybeSingle()
        ).data ?? null)
      : null;

    // Neue Version eines vorhandenen Entwurfs: Inhalt übernehmen, Version + 1.
    let inhalt: ExposeInhalt = {
      ...leererInhalt(),
      felder: vorbelegungAusSalesforce(mandat, objekt),
    };
    let version = 1;
    if (data.vorlageId) {
      const alt = await ladeRoh(admin, data.vorlageId);
      inhalt = alt.inhalt;
      version = alt.version + 1;
    }
    const titel =
      data.typ === "teaser"
        ? `Teaser ${[inhalt.felder.objektart?.wert, inhalt.felder.lage_ort?.wert].filter(Boolean).join(", ") || mandat.name}`
        : `Exposé ${inhalt.felder.objektname?.wert ?? mandat.name}`;
    const { data: neu, error: e } = await admin
      .from("dokument_entwuerfe")
      .insert({
        typ: data.typ,
        titel,
        mandat_sf_id: data.mandatSfId,
        inhalt,
        status: "entwurf",
        version,
        erstellt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
      })
      .select("id")
      .single();
    if (e) throw new Error(e.message);
    return { id: String(neu.id) };
  });

export const entwurfLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<EntwurfVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return ladeVoll(createServiceRoleClient(), data.id);
  });

type SpeichernEingabe = {
  supabaseAccessToken: string;
  id: string;
  titel: string;
  felder: Partial<Record<FeldId, { wert: string; quelle: Quelle | null }>>;
  texte: Partial<Record<TextAbschnitt, Aussage[]>>;
  luecken: string[];
  belege: Quelle[];
};

export const entwurfSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown): SpeichernEingabe => {
    const d = (data ?? {}) as Record<string, unknown>;
    const felder: SpeichernEingabe["felder"] = {};
    const rohFelder = (d.felder ?? {}) as Record<
      string,
      { wert?: unknown; quelle?: unknown }
    >;
    for (const id of FELD_IDS) {
      const f = rohFelder[id];
      if (f && typeof f.wert === "string")
        felder[id] = {
          wert: f.wert.slice(0, 300),
          quelle: (f.quelle as Quelle) ?? null,
        };
    }
    const rohTexte = (d.texte ?? {}) as Record<string, unknown>;
    const texte: SpeichernEingabe["texte"] = {};
    for (const a of ["objekt", "lage", "investment"] as TextAbschnitt[]) {
      const liste = rohTexte[a];
      if (Array.isArray(liste)) {
        texte[a] = liste
          .map((x: { text?: unknown; quellen?: unknown }) => ({
            text: text(x?.text, 1200),
            quellen: Array.isArray(x?.quellen)
              ? x.quellen.map((q) => text(q, 120)).filter(Boolean)
              : [],
          }))
          .slice(0, 12);
      }
    }
    return {
      supabaseAccessToken: tokenAus(data),
      id: text(d.id, 40),
      titel: text(d.titel, 200),
      felder,
      texte,
      luecken: Array.isArray(d.luecken)
        ? d.luecken
            .map((l) => text(l, 600))
            .filter(Boolean)
            .slice(0, 30)
        : [],
      belege: Array.isArray(d.belege)
        ? (d.belege as Quelle[]).slice(0, 200)
        : [],
    };
  })
  .handler(async ({ data }): Promise<EntwurfVoll> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    const alt = await ladeRoh(admin, data.id);
    if (alt.status === "versendet" || alt.status === "archiviert")
      throw new Error(
        "Dieser Entwurf ist abgeschlossen. Bitte eine neue Version anlegen.",
      );
    const name = await nutzerName(admin, aufrufer);

    // Quellen serverseitig absichern: geänderte Werte gelten als Eingabe des Nutzers,
    // Dokument-Belege nur mit Zitat auf der genannten Seite.
    const felder: Partial<Record<FeldId, FeldWert>> = {};
    for (const id of FELD_IDS) {
      const neu = data.felder[id];
      if (!neu || !neu.wert.trim()) continue;
      const vorher = alt.inhalt.felder[id];
      let quelle: Quelle | null = null;
      if (
        vorher &&
        vorher.wert === neu.wert &&
        JSON.stringify(vorher.quelle) === JSON.stringify(neu.quelle)
      ) {
        quelle = vorher.quelle;
      } else if (neu.quelle?.art === "dokument") {
        const u = alt.inhalt.unterlagen.find(
          (x) => x.id === neu.quelle!.verweis,
        );
        if (
          u &&
          neu.quelle.seite &&
          neu.quelle.zitat &&
          zitatAufSeite(u.text, neu.quelle.seite, neu.quelle.zitat)
        )
          quelle = neu.quelle;
      }
      if (!quelle) {
        quelle = {
          id: `eingabe:${id}:${Date.now()}`,
          art: "eingabe",
          bezeichnung: `Eingabe ${name}, ${new Date().toLocaleDateString("de-DE")}`,
        };
      }
      felder[id] = { wert: neu.wert.trim(), quelle };
    }
    const belege = data.belege.filter((b) => {
      if (b.art !== "dokument") return false;
      const u = alt.inhalt.unterlagen.find((x) => x.id === b.verweis);
      return Boolean(
        u && b.seite && b.zitat && zitatAufSeite(u.text, b.seite, b.zitat),
      );
    });
    const inhalt: ExposeInhalt = {
      ...alt.inhalt,
      felder,
      texte: data.texte,
      luecken: data.luecken,
      belege,
    };
    const pruefung = pruefePflichtangaben(
      alt.typ,
      inhalt,
      await rechtstexte(admin, alt.typ),
    );
    const { error } = await admin
      .from("dokument_entwuerfe")
      .update({
        titel: data.titel || alt.titel,
        inhalt,
        pruefung,
        status: "entwurf",
        freigegeben_von: null,
        freigegeben_am: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return ladeVoll(admin, data.id);
  });

export const unterlageHinzufuegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      id?: unknown;
      name?: unknown;
      text?: unknown;
      seiten?: unknown;
    };
    return {
      supabaseAccessToken: tokenAus(data),
      id: text(d.id, 40),
      name: text(d.name, 200) || "Unterlage",
      text: text(d.text, 400_000),
      seiten: Number(d.seiten) || 0,
    };
  })
  .handler(async ({ data }) => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    if (!data.text.includes("<<<PAGE"))
      throw new Error("Die Unterlage enthält keinen lesbaren Text.");
    const admin = createServiceRoleClient();
    const alt = await ladeRoh(admin, data.id);
    if (alt.status !== "entwurf")
      throw new Error("Unterlagen nur im Entwurf hinzufügen.");
    const unterlage = {
      id: `u${Date.now().toString(36)}`,
      name: data.name,
      seiten: data.seiten,
      text: data.text,
    };
    const inhalt: ExposeInhalt = {
      ...alt.inhalt,
      unterlagen: [...alt.inhalt.unterlagen, unterlage],
    };
    const { error } = await admin
      .from("dokument_entwuerfe")
      .update({ inhalt, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { unterlageAuswerten } = await import("./ki");
    const ergebnis = await unterlageAuswerten(unterlage);
    return {
      unterlage: {
        id: unterlage.id,
        name: unterlage.name,
        seiten: unterlage.seiten,
      },
      ...ergebnis,
    };
  });

export const texteEntwerfenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }) => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const roh = await ladeRoh(createServiceRoleClient(), data.id);
    const { texteEntwerfen } = await import("./ki");
    return texteEntwerfen(roh.typ, roh.inhalt);
  });

async function dokumentFuer(
  admin: SupabaseClient,
  roh: Awaited<ReturnType<typeof ladeRoh>>,
  freigegeben: boolean,
) {
  return exposeDokument(
    roh.typ,
    roh.inhalt,
    await rechtstexte(admin, roh.typ),
    { titel: roh.titel, freigegeben },
  );
}

export const entwurfFreigebenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<EntwurfVoll> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    if (aufrufer.userId === "cron")
      throw new Error("Freigeben kann nur ein Nutzer.");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    if (roh.status !== "entwurf") return ladeVoll(admin, data.id);
    const pruefung = pruefePflichtangaben(
      roh.typ,
      roh.inhalt,
      await rechtstexte(admin, roh.typ),
    );
    if (!pruefung.ok) {
      const offen = pruefung.punkte
        .filter((p) => p.status !== "ok")
        .map((p) => p.label);
      throw new Error(`Freigabe gesperrt. Offen: ${offen.join(", ")}.`);
    }
    const { dokumentErzeugen } = await import("@/lib/vorlagen/export");
    const { datei, dateiname, mime } = await dokumentErzeugen(
      admin,
      await dokumentFuer(admin, roh, true),
      "pdf",
    );
    const pfad = `exposes/${roh.mandatSfId ?? "ohne-mandat"}/${roh.id}/v${roh.version}_${dateiname}`;
    const { error: e1 } = await admin.storage
      .from("dokumente")
      .upload(pfad, datei, { contentType: mime, upsert: true });
    if (e1) throw new Error(e1.message);
    const { error } = await admin
      .from("dokument_entwuerfe")
      .update({
        status: "freigegeben",
        freigegeben_von: aufrufer.userId,
        freigegeben_am: new Date().toISOString(),
        datei_pfad: pfad,
        pruefung,
        quellen: (await dokumentFuer(admin, roh, true)).quellen,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return ladeVoll(admin, data.id);
  });

export const entwurfDateiFn = createServerFn({ method: "POST" })
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
    const roh = await ladeRoh(admin, data.id);
    const { dokumentAlsDownload } = await import("@/lib/vorlagen/export");
    return dokumentAlsDownload(
      admin,
      await dokumentFuer(
        admin,
        roh,
        roh.status === "freigegeben" || roh.status === "versendet",
      ),
      data.format,
    );
  });

/** Freigegebenes PDF als Datei am Mandat in Salesforce ablegen (nach Bestätigung in der UI). */
export const entwurfInSalesforceAblegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
    bestaetigt: (data as { bestaetigt?: unknown })?.bestaetigt === true,
    sfSitzung: sfSitzungAus(data),
  }))
  .handler(async ({ data }): Promise<EntwurfVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    if (!data.bestaetigt)
      throw new Error("Der Schritt muss in der App bestätigt werden.");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    if (roh.status !== "freigegeben")
      throw new Error(
        "Nur freigegebene Dokumente werden in Salesforce abgelegt.",
      );
    if (!roh.mandatSfId) throw new Error("Kein Mandat verknüpft.");
    const { data: zeileDb } = await admin
      .from("dokument_entwuerfe")
      .select("datei_pfad")
      .eq("id", data.id)
      .single();
    const { data: blob, error: e1 } = await admin.storage
      .from("dokumente")
      .download(String(zeileDb?.datei_pfad));
    if (e1 || !blob) throw new Error(e1?.message ?? "PDF nicht gefunden.");
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const dateiname =
      String(zeileDb?.datei_pfad).split("/").pop() ?? "Expose.pdf";
    const { sfCreate } = await import("@/lib/sf-sync/schreiben");
    const { sfAbfrage } = await import("@/lib/sf-sync/client");
    const dokumentId = await mitSfZugangOderSitzung(
      data.sfSitzung,
      async () => {
        const versionId = await sfCreate(admin, "ContentVersion", {
          Title: roh.titel,
          PathOnClient: dateiname,
          VersionData: base64,
          FirstPublishLocationId: roh.mandatSfId,
        });
        if (!/^[A-Za-z0-9]{15,18}$/.test(versionId))
          throw new Error("Unerwartete Antwort von Salesforce.");
        const [v] = await sfAbfrage(
          `SELECT ContentDocumentId FROM ContentVersion WHERE Id = '${versionId}'`,
        );
        return String(v?.ContentDocumentId ?? "");
      },
    );
    const { error } = await admin
      .from("dokument_entwuerfe")
      .update({
        sf_content_document_id: dokumentId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return ladeVoll(admin, data.id);
  });
