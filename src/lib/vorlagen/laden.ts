/** Serverseitig: Design-Vorlage aus design_vorlagen laden (Standard je Typ, sonst „allgemein“, sonst Code-Standard). */

import type { SupabaseClient } from "@supabase/supabase-js";

import { vorlageZusammenfuehren } from "./standard";
import type { DesignVorlage, DokumentTyp } from "./typen";

export async function ladeVorlage(
  admin: SupabaseClient,
  typ: DokumentTyp,
): Promise<DesignVorlage> {
  const { data, error } = await admin
    .from("design_vorlagen")
    .select("id, name, typ, design, abschnitte, version")
    .in("typ", typ === "allgemein" ? ["allgemein"] : [typ, "allgemein"])
    .eq("ist_standard", true)
    .eq("aktiv", true);
  if (error) throw new Error(error.message);
  const eigene = (data ?? []).find((v) => v.typ === typ) ?? null;
  const allgemein = (data ?? []).find((v) => v.typ === "allgemein") ?? null;
  return vorlageZusammenfuehren(typ, eigene, allgemein);
}

/** Logo aus dem Bucket „vorlagen“ als Data-URI für PDF/PPTX, sonst null (eingebautes Logo). */
export async function ladeLogo(
  admin: SupabaseClient,
  vorlage: DesignVorlage,
): Promise<string | null> {
  const pfad = vorlage.design.logoPfad;
  if (!pfad) return null;
  const { data, error } = await admin.storage.from("vorlagen").download(pfad);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const typ =
    pfad.toLowerCase().endsWith(".jpg") || pfad.toLowerCase().endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
  return `data:${typ};base64,${buf.toString("base64")}`;
}
