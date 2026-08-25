import { supabase } from "@/lib/supabase";
import type {
  Einheit,
  EinheitEingabe,
  Gesellschaft,
  GesellschaftEingabe,
  Mietverhaeltnis,
  MietverhaeltnisEingabe,
  Objekt,
  ObjektEingabe,
  Paginated,
} from "@/types";

/** PostgREST liefert numeric als String — hier einheitlich zu number. */
function zahl(wert: unknown): number {
  const n = Number(wert);
  return Number.isFinite(n) ? n : 0;
}

function zahlOderNull(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

/** Leere Eingaben werden als NULL gespeichert, nicht als Leerstring. */
function textOderNull(wert: string | null | undefined): string | null {
  const t = wert?.trim();
  return t ? t : null;
}

// ------------------------------------------------------------------ Mapping

type GesellschaftRow = Record<string, unknown>;

function mapGesellschaft(row: GesellschaftRow): Gesellschaft {
  return {
    id: String(row.id),
    name: String(row.name),
    kuerzel: String(row.kuerzel),
    datevPostfach: (row.datev_postfach as string | null) ?? null,
    datevPostfachBezeichnung:
      (row.datev_postfach_bezeichnung as string | null) ?? null,
    bemerkung: (row.bemerkung as string | null) ?? null,
    objekteListe: (row.objekte_liste as string | null) ?? "",
    anzahlObjekte: zahl(row.anzahl_objekte),
    anzahlEinheiten: zahl(row.anzahl_einheiten),
    kaltmiete: zahl(row.kaltmiete),
    kaltmieteJahr: zahl(row.kaltmiete_jahr),
  };
}

function mapObjekt(row: Record<string, unknown>): Objekt {
  return {
    id: String(row.id),
    gesellschaftId: String(row.gesellschaft_id),
    gesellschaftName: (row.gesellschaft_name as string | null) ?? "",
    bezeichnung: String(row.bezeichnung),
    adresse: {
      strasse: (row.strasse as string | null) ?? "",
      plz: (row.plz as string | null) ?? "",
      ort: (row.ort as string | null) ?? "",
      land: (row.land as string | null) ?? "DE",
    },
    status: row.status as Objekt["status"],
    quelldatei: (row.quelldatei as string | null) ?? null,
    bemerkung: (row.bemerkung as string | null) ?? null,
    einheitenGesamt: zahl(row.einheiten_gesamt),
    einheitenWohnen: zahl(row.einheiten_wohnen),
    einheitenStellplatz: zahl(row.einheiten_stellplatz),
    einheitenVermietet: zahl(row.einheiten_vermietet),
    einheitenLeer: zahl(row.einheiten_leer),
    wohnflaecheM2: zahl(row.wohnflaeche_m2),
    kaltmiete: zahl(row.kaltmiete),
    kaltmieteJahr: zahl(row.kaltmiete_jahr),
    mieteProM2Wohnen: zahlOderNull(row.miete_pro_m2_wohnen),
  };
}

function mapEinheit(row: Record<string, unknown>): Einheit {
  return {
    id: String(row.id),
    objektId: String(row.objekt_id),
    objektBezeichnung: (row.objekt_bezeichnung as string | null) ?? "",
    gesellschaftId: String(row.gesellschaft_id ?? ""),
    gesellschaftName: (row.gesellschaft_name as string | null) ?? "",
    hausteil: (row.hausteil as string | null) ?? null,
    lage: String(row.lage),
    nutzungsart: row.nutzungsart as Einheit["nutzungsart"],
    status: row.status as Einheit["status"],
    flaecheM2: zahlOderNull(row.flaeche_m2),
    flaecheAufmassM2: zahlOderNull(row.flaeche_aufmass_m2),
    bemerkung: (row.bemerkung as string | null) ?? null,
    mietverhaeltnisId: (row.mietverhaeltnis_id as string | null) ?? null,
    mieterName: (row.mieter_name as string | null) ?? null,
    vertragsbeginn: (row.vertragsbeginn as string | null) ?? null,
    letzteMieterhoehung: (row.letzte_mieterhoehung as string | null) ?? null,
    kaltmiete: zahl(row.kaltmiete),
    nkVorauszahlung: zahlOderNull(row.nk_vorauszahlung),
    mieteProM2: zahlOderNull(row.miete_pro_m2),
    kaltmieteJahr: zahl(row.kaltmiete_jahr),
  };
}

function mapMietverhaeltnis(row: Record<string, unknown>): Mietverhaeltnis {
  return {
    id: String(row.id),
    einheitId: String(row.einheit_id),
    einheitLage: (row.einheit_lage as string | null) ?? "",
    hausteil: (row.hausteil as string | null) ?? null,
    nutzungsart: row.nutzungsart as Mietverhaeltnis["nutzungsart"],
    flaecheM2: zahlOderNull(row.flaeche_m2),
    objektId: String(row.objekt_id ?? ""),
    objektBezeichnung: (row.objekt_bezeichnung as string | null) ?? "",
    gesellschaftId: String(row.gesellschaft_id ?? ""),
    gesellschaftName: (row.gesellschaft_name as string | null) ?? "",
    mieterName: String(row.mieter_name),
    iban: (row.iban as string | null) ?? null,
    beginn: (row.beginn as string | null) ?? null,
    ende: (row.ende as string | null) ?? null,
    letzteMieterhoehung: (row.letzte_mieterhoehung as string | null) ?? null,
    kaltmiete: zahl(row.kaltmiete),
    nkVorauszahlung: zahlOderNull(row.nk_vorauszahlung),
    kaltmieteJahr: zahl(row.kaltmiete_jahr),
    mieteProM2: zahlOderNull(row.miete_pro_m2),
    status: row.status as Mietverhaeltnis["status"],
    bemerkung: (row.bemerkung as string | null) ?? null,
  };
}

// ------------------------------------------------------------------- API

export const verwaltungApi = {
  // -------------------------------------------------------- Gesellschaften
  async listGesellschaften(): Promise<Paginated<Gesellschaft>> {
    const { data, error, count } = await supabase
      .from("v_gesellschaften")
      .select("*", { count: "exact" })
      .order("id", { ascending: true });

    if (error) throw error;
    const items = (data ?? []).map(mapGesellschaft);
    return { items, gesamt: count ?? items.length };
  },

  async saveGesellschaft(input: GesellschaftEingabe): Promise<void> {
    const { error } = await supabase.from("gesellschaften").upsert(
      {
        id: input.id.trim(),
        name: input.name.trim(),
        kuerzel: input.kuerzel.trim(),
        datev_postfach: textOderNull(input.datevPostfach),
        datev_postfach_bezeichnung: textOderNull(
          input.datevPostfachBezeichnung,
        ),
        bemerkung: textOderNull(input.bemerkung),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  },

  async deleteGesellschaft(id: string): Promise<void> {
    const { error } = await supabase
      .from("gesellschaften")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  // ---------------------------------------------------------------- Objekte
  async listObjekte(
    gesellschaftId?: string | null,
  ): Promise<Paginated<Objekt>> {
    let query = supabase.from("v_objekte").select("*", { count: "exact" });
    if (gesellschaftId) query = query.eq("gesellschaft_id", gesellschaftId);

    const { data, error, count } = await query.order("id", { ascending: true });
    if (error) throw error;
    const items = (data ?? []).map(mapObjekt);
    return { items, gesamt: count ?? items.length };
  },

  async getObjekt(id: string): Promise<Objekt | null> {
    const { data, error } = await supabase
      .from("v_objekte")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapObjekt(data) : null;
  },

  async saveObjekt(input: ObjektEingabe): Promise<void> {
    const { error } = await supabase.from("objekte").upsert(
      {
        id: input.id.trim(),
        gesellschaft_id: input.gesellschaftId,
        bezeichnung: input.bezeichnung.trim(),
        strasse: input.adresse.strasse.trim(),
        plz: input.adresse.plz.trim(),
        ort: input.adresse.ort.trim(),
        land: input.adresse.land.trim() || "DE",
        status: input.status,
        bemerkung: textOderNull(input.bemerkung),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  },

  async deleteObjekt(id: string): Promise<void> {
    const { error } = await supabase.from("objekte").delete().eq("id", id);
    if (error) throw error;
  },

  // -------------------------------------------------------------- Einheiten
  async listEinheiten(filter?: {
    gesellschaftId?: string | null;
    objektId?: string | null;
  }): Promise<Paginated<Einheit>> {
    let query = supabase.from("v_einheiten").select("*", { count: "exact" });
    if (filter?.gesellschaftId)
      query = query.eq("gesellschaft_id", filter.gesellschaftId);
    if (filter?.objektId) query = query.eq("objekt_id", filter.objektId);

    const { data, error, count } = await query
      .order("objekt_id", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    const items = (data ?? []).map(mapEinheit);
    return { items, gesamt: count ?? items.length };
  },

  async saveEinheit(input: EinheitEingabe): Promise<void> {
    const { error } = await supabase.from("einheiten").upsert(
      {
        id: input.id.trim(),
        objekt_id: input.objektId,
        hausteil: textOderNull(input.hausteil),
        lage: input.lage.trim(),
        nutzungsart: input.nutzungsart,
        status: input.status,
        flaeche_m2: input.flaecheM2,
        flaeche_aufmass_m2: input.flaecheAufmassM2,
        bemerkung: textOderNull(input.bemerkung),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  },

  async deleteEinheit(id: string): Promise<void> {
    const { error } = await supabase.from("einheiten").delete().eq("id", id);
    if (error) throw error;
  },

  // ------------------------------------------------------- Mietverhältnisse
  async listMietverhaeltnisse(filter?: {
    gesellschaftId?: string | null;
    objektId?: string | null;
    einheitId?: string | null;
  }): Promise<Paginated<Mietverhaeltnis>> {
    let query = supabase
      .from("v_mietverhaeltnisse")
      .select("*", { count: "exact" });
    if (filter?.gesellschaftId)
      query = query.eq("gesellschaft_id", filter.gesellschaftId);
    if (filter?.objektId) query = query.eq("objekt_id", filter.objektId);
    if (filter?.einheitId) query = query.eq("einheit_id", filter.einheitId);

    const { data, error, count } = await query
      .order("objekt_id", { ascending: true })
      .order("einheit_id", { ascending: true });
    if (error) throw error;
    const items = (data ?? []).map(mapMietverhaeltnis);
    return { items, gesamt: count ?? items.length };
  },

  async saveMietverhaeltnis(input: MietverhaeltnisEingabe): Promise<void> {
    const werte = {
      einheit_id: input.einheitId,
      mieter_name: input.mieterName.trim(),
      iban: textOderNull(input.iban?.replace(/\s+/g, "").toUpperCase()),
      beginn: input.beginn || null,
      ende: input.ende || null,
      letzte_mieterhoehung: input.letzteMieterhoehung || null,
      kaltmiete: input.kaltmiete,
      nk_vorauszahlung: input.nkVorauszahlung,
      status: input.status,
      bemerkung: textOderNull(input.bemerkung),
    };

    const { error } = input.id
      ? await supabase
          .from("mietverhaeltnisse")
          .update(werte)
          .eq("id", input.id)
      : await supabase.from("mietverhaeltnisse").insert(werte);
    if (error) throw error;
  },

  async deleteMietverhaeltnis(id: string): Promise<void> {
    const { error } = await supabase
      .from("mietverhaeltnisse")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },
};

export type VerwaltungApi = typeof verwaltungApi;
