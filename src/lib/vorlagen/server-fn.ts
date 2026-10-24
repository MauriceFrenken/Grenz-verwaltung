/** Server-Funktionen der Design-Vorlagen (Einstellungen › Vorlagen). */

import { createServerFn } from "@tanstack/react-start";

import { createServiceRoleClient, pruefeAufrufer, tokenAus } from "@/lib/server/aufrufer";

import { dokumentAlsDownload, type DateiErgebnis, type DateiFormat } from "./export";
import { ladeVorlage } from "./laden";
import { musterInhalt } from "./muster";
import { STANDARD_ABSCHNITTE } from "./standard";
import type { AbschnittDefinition, DesignDefinition, DesignVorlage, DokumentTyp } from "./typen";

const TYPEN: DokumentTyp[] = ["allgemein", "expose", "teaser", "eigentuemer_report", "bewertung"];

function typAus(wert: unknown): DokumentTyp {
  return TYPEN.includes(wert as DokumentTyp) ? (wert as DokumentTyp) : "allgemein";
}

export const vorlageLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data), typ: typAus((data as { typ?: unknown })?.typ) }))
  .handler(async ({ data }): Promise<DesignVorlage> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return ladeVorlage(createServiceRoleClient(), data.typ);
  });

type SpeichernEingabe = {
  supabaseAccessToken: string;
  typ: DokumentTyp;
  design: DesignDefinition | null;
  abschnitte: AbschnittDefinition[];
};

/**
 * Speichert die Standardvorlage eines Typs. Das Design gilt über „allgemein“ für alle Typen;
 * je Typ werden nur die Abschnitte gespeichert. Jede Änderung erhöht die Version.
 */
export const vorlageSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown): SpeichernEingabe => {
    const d = (data ?? {}) as Partial<SpeichernEingabe>;
    return {
      supabaseAccessToken: tokenAus(data),
      typ: typAus(d.typ),
      design: d.design && typeof d.design === "object" ? d.design : null,
      abschnitte: Array.isArray(d.abschnitte)
        ? d.abschnitte
            .filter((a) => a && typeof a.id === "string")
            .map((a) => ({ id: a.id, titel: String(a.titel ?? "").slice(0, 80), sichtbar: Boolean(a.sichtbar) }))
        : [],
    };
  })
  .handler(async ({ data }): Promise<DesignVorlage> => {
    const aufrufer = await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();

    const speichere = async (typ: DokumentTyp, felder: Record<string, unknown>) => {
      const { data: vorhanden, error } = await admin
        .from("design_vorlagen")
        .select("id, version")
        .eq("typ", typ)
        .eq("ist_standard", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (vorhanden) {
        const { error: e } = await admin
          .from("design_vorlagen")
          .update({ ...felder, version: Number(vorhanden.version ?? 1) + 1 })
          .eq("id", vorhanden.id);
        if (e) throw new Error(e.message);
      } else {
        const { error: e } = await admin.from("design_vorlagen").insert({
          name: "Grenz Standard",
          typ,
          ist_standard: true,
          erstellt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
          ...felder,
        });
        if (e) throw new Error(e.message);
      }
    };

    if (data.design) await speichere("allgemein", { design: data.design });
    if (data.typ !== "allgemein" && STANDARD_ABSCHNITTE[data.typ].length) {
      await speichere(data.typ, { abschnitte: data.abschnitte });
    }
    return ladeVorlage(admin, data.typ);
  });

export const vorlageLogoHochladenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { base64?: unknown; dateiname?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      base64: typeof d.base64 === "string" ? d.base64 : "",
      dateiname: typeof d.dateiname === "string" ? d.dateiname : "logo.png",
    };
  })
  .handler(async ({ data }): Promise<{ pfad: string }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const endung = /\.jpe?g$/i.test(data.dateiname) ? "jpg" : "png";
    const datei = Buffer.from(data.base64, "base64");
    if (!datei.length || datei.length > 3 * 1024 * 1024) throw new Error("Logo fehlt oder ist größer als 3 MB.");
    const pfad = `logo/${Date.now()}.${endung}`;
    const { error } = await createServiceRoleClient()
      .storage.from("vorlagen")
      .upload(pfad, datei, { contentType: endung === "jpg" ? "image/jpeg" : "image/png" });
    if (error) throw new Error(error.message);
    return { pfad };
  });

export const vorlageMusterFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    typ: typAus((data as { typ?: unknown })?.typ),
    format: ((data as { format?: unknown })?.format === "pptx" ? "pptx" : "pdf") as DateiFormat,
  }))
  .handler(async ({ data }): Promise<DateiErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return dokumentAlsDownload(createServiceRoleClient(), { ...musterInhalt(), typ: data.typ }, data.format);
  });
