import { NotImplementedError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type {
  Einheit,
  Filter,
  Kostenposition,
  Mietverhaeltnis,
  NkAbrechnung,
  Objekt,
  Paginated,
  Rueckstand,
  Sollstellung,
  Zahlung,
} from "@/types";

type DbObjekt = {
  id: string;
  bezeichnung: string;
  mandant_id: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  status: Objekt["status"];
  einheiten?: Array<{ count: number }>;
};

type DbEinheit = {
  id: string;
  objekt_id: string;
  lage: string;
  flaeche_m2: number | string;
  aktuelles_mietverhaeltnis_id: string | null;
  status: Einheit["status"];
  objekte?: { mandant_id: string };
  aktuelles_mietverhaeltnis?: { mieter_name: string } | null;
};

type DbMietverhaeltnis = {
  id: string;
  mieter_name: string;
  einheit_id: string;
  objekt_id: string;
  kaltmiete: number | string;
  nk_vorauszahlung: number | string;
  beginn: string;
  ende: string | null;
  status: Mietverhaeltnis["status"];
  umlagefaehige_kostenarten: string[];
  objekte?: { mandant_id: string };
};

function num(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function mapObjekt(row: DbObjekt): Objekt {
  return {
    id: row.id,
    bezeichnung: row.bezeichnung,
    adresse: {
      strasse: row.strasse,
      plz: row.plz,
      ort: row.ort,
      land: row.land,
    },
    mandantId: row.mandant_id,
    anzahlEinheiten: row.einheiten?.[0]?.count ?? 0,
    status: row.status,
  };
}

function mapEinheit(row: DbEinheit): Einheit {
  return {
    id: row.id,
    objektId: row.objekt_id,
    lage: row.lage,
    flaecheM2: num(row.flaeche_m2),
    aktuellesMietverhaeltnisId: row.aktuelles_mietverhaeltnis_id,
    aktuellesMietverhaeltnisMieterName: row.aktuelles_mietverhaeltnis?.mieter_name ?? null,
    status: row.status,
  };
}

function mapMietverhaeltnis(row: DbMietverhaeltnis): Mietverhaeltnis {
  return {
    id: row.id,
    mieterName: row.mieter_name,
    einheitId: row.einheit_id,
    objektId: row.objekt_id,
    kaltmiete: num(row.kaltmiete),
    nkVorauszahlung: num(row.nk_vorauszahlung),
    beginn: row.beginn,
    ende: row.ende,
    status: row.status,
    umlagefaehigeKostenarten: row.umlagefaehige_kostenarten ?? [],
  };
}

export const verwaltungApi = {
  async listObjekte(filter: Filter = {}): Promise<Paginated<Objekt>> {
    let query = supabase
      .from("objekte")
      .select("id, bezeichnung, mandant_id, strasse, plz, ort, land, status, einheiten(count)", {
        count: "exact",
      })
      .order("bezeichnung", { ascending: true });

    if (filter.mandantId) {
      query = query.eq("mandant_id", filter.mandantId);
    }
    if (filter.suche?.trim()) {
      const term = `%${filter.suche.trim()}%`;
      query = query.or(
        `bezeichnung.ilike.${term},strasse.ilike.${term},ort.ilike.${term},id.ilike.${term}`,
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data ?? []).map((row) => mapObjekt(row as DbObjekt));
    return { items, gesamt: count ?? items.length };
  },

  async getObjekt(id: string): Promise<Objekt | null> {
    const { data, error } = await supabase
      .from("objekte")
      .select("id, bezeichnung, mandant_id, strasse, plz, ort, land, status, einheiten(count)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? mapObjekt(data as DbObjekt) : null;
  },

  async createObjekt(input: Omit<Objekt, "anzahlEinheiten"> & { id?: string }): Promise<Objekt> {
    const id =
      input.id ??
      `${input.bezeichnung.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now()}`;

    const { data, error } = await supabase
      .from("objekte")
      .insert({
        id,
        bezeichnung: input.bezeichnung,
        mandant_id: input.mandantId,
        strasse: input.adresse.strasse,
        plz: input.adresse.plz,
        ort: input.adresse.ort,
        land: input.adresse.land,
        status: input.status,
      })
      .select("id, bezeichnung, mandant_id, strasse, plz, ort, land, status, einheiten(count)")
      .single();

    if (error) throw error;
    return mapObjekt(data as DbObjekt);
  },

  async updateObjekt(
    id: string,
    input: Omit<Objekt, "id" | "anzahlEinheiten">,
  ): Promise<Objekt> {
    const { data, error } = await supabase
      .from("objekte")
      .update({
        bezeichnung: input.bezeichnung,
        mandant_id: input.mandantId,
        strasse: input.adresse.strasse,
        plz: input.adresse.plz,
        ort: input.adresse.ort,
        land: input.adresse.land,
        status: input.status,
      })
      .eq("id", id)
      .select("id, bezeichnung, mandant_id, strasse, plz, ort, land, status, einheiten(count)")
      .single();

    if (error) throw error;
    return mapObjekt(data as DbObjekt);
  },

  async deleteObjekt(id: string): Promise<void> {
    const { error } = await supabase.from("objekte").delete().eq("id", id);
    if (error) throw error;
  },

  async createEinheit(
    input: Omit<Einheit, "aktuellesMietverhaeltnisId" | "aktuellesMietverhaeltnisMieterName"> & { id?: string },
  ): Promise<Einheit> {
    const id = input.id ?? `${input.objektId}-e${Date.now()}`;

    const { data, error } = await supabase
      .from("einheiten")
      .insert({
        id,
        objekt_id: input.objektId,
        lage: input.lage,
        flaeche_m2: input.flaecheM2,
        status: input.status,
      })
      .select("id, objekt_id, lage, flaeche_m2, aktuelles_mietverhaeltnis_id, status")
      .single();

    if (error) throw error;
    return mapEinheit(data as DbEinheit);
  },

  async updateEinheit(
    id: string,
    input: Omit<Einheit, "id" | "objektId" | "aktuellesMietverhaeltnisId" | "aktuellesMietverhaeltnisMieterName">,
  ): Promise<Einheit> {
    const { data, error } = await supabase
      .from("einheiten")
      .update({
        lage: input.lage,
        flaeche_m2: input.flaecheM2,
        status: input.status,
      })
      .eq("id", id)
      .select("id, objekt_id, lage, flaeche_m2, aktuelles_mietverhaeltnis_id, status")
      .single();

    if (error) throw error;
    return mapEinheit(data as DbEinheit);
  },

  async deleteEinheit(id: string): Promise<void> {
    const { error } = await supabase.from("einheiten").delete().eq("id", id);
    if (error) throw error;
  },

  async createObjektEinheitMietverhaeltnis(input: {
    objekt: Omit<Objekt, "id" | "anzahlEinheiten"> & { id?: string };
    einheiten: Array<
      Omit<Einheit, "id" | "objektId" | "aktuellesMietverhaeltnisId" | "aktuellesMietverhaeltnisMieterName"> & {
        id?: string;
      }
    >;
    mietverhaeltnis?: Omit<Mietverhaeltnis, "id" | "objektId" | "einheitId">;
  }): Promise<{ objektId: string }> {
    const objektId =
      input.objekt.id ??
      `${input.objekt.bezeichnung.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now()}`;

    const { data, error } = await supabase.rpc("create_objekt_mit_einheiten", {
      p_objekt: {
        id: objektId,
        bezeichnung: input.objekt.bezeichnung,
        mandant_id: input.objekt.mandantId,
        strasse: input.objekt.adresse.strasse,
        plz: input.objekt.adresse.plz,
        ort: input.objekt.adresse.ort,
        land: input.objekt.adresse.land,
        status: input.objekt.status,
      },
      p_einheiten: input.einheiten.map((e, i) => ({
        id: e.id ?? `${objektId}-e${i + 1}`,
        lage: e.lage,
        flaeche_m2: e.flaecheM2,
        status: e.status,
      })),
      p_mietverhaeltnis: input.mietverhaeltnis
        ? {
            mieter_name: input.mietverhaeltnis.mieterName,
            einheit_id: input.einheiten[0]?.id ?? `${objektId}-e1`,
            kaltmiete: input.mietverhaeltnis.kaltmiete,
            nk_vorauszahlung: input.mietverhaeltnis.nkVorauszahlung,
            beginn: input.mietverhaeltnis.beginn,
            ende: input.mietverhaeltnis.ende,
            status: input.mietverhaeltnis.status,
            umlagefaehige_kostenarten: input.mietverhaeltnis.umlagefaehigeKostenarten,
          }
        : null,
    });

    if (error) throw error;
    const result = data as { objekt_id?: string };
    return { objektId: result.objekt_id ?? objektId };
  },

  async listEinheiten(filter: Filter = {}): Promise<Paginated<Einheit>> {
    let query = supabase
      .from("einheiten")
      .select(
        "id, objekt_id, lage, flaeche_m2, aktuelles_mietverhaeltnis_id, status, objekte!inner(mandant_id), aktuelles_mietverhaeltnis:mietverhaeltnisse!einheiten_aktuelles_mv_fkey(mieter_name)",
        { count: "exact" },
      )
      .order("id", { ascending: true });

    if (filter.mandantId) {
      query = query.eq("objekte.mandant_id", filter.mandantId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data ?? []).map((row) => mapEinheit(row as DbEinheit));
    return { items, gesamt: count ?? items.length };
  },

  async listMietverhaeltnisse(filter: Filter = {}): Promise<Paginated<Mietverhaeltnis>> {
    let query = supabase
      .from("mietverhaeltnisse")
      .select(
        "id, mieter_name, einheit_id, objekt_id, kaltmiete, nk_vorauszahlung, beginn, ende, status, umlagefaehige_kostenarten, objekte!inner(mandant_id)",
        { count: "exact" },
      )
      .order("beginn", { ascending: false });

    if (filter.mandantId) {
      query = query.eq("objekte.mandant_id", filter.mandantId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data ?? []).map((row) => mapMietverhaeltnis(row as DbMietverhaeltnis));
    return { items, gesamt: count ?? items.length };
  },

  async createMietverhaeltnis(input: Omit<Mietverhaeltnis, "id">): Promise<Mietverhaeltnis> {
    const { data, error } = await supabase.rpc("create_mietverhaeltnis", {
      p_mieter_name: input.mieterName,
      p_einheit_id: input.einheitId,
      p_kaltmiete: input.kaltmiete,
      p_nk_vorauszahlung: input.nkVorauszahlung,
      p_beginn: input.beginn,
      p_ende: input.ende,
      p_status: input.status,
      p_umlagefaehige_kostenarten: input.umlagefaehigeKostenarten,
    });

    if (error) throw error;
    return mapMietverhaeltnis(data as DbMietverhaeltnis);
  },

  async updateMietverhaeltnis(
    id: string,
    input: Omit<Mietverhaeltnis, "id" | "einheitId" | "objektId">,
  ): Promise<Mietverhaeltnis> {
    const { data, error } = await supabase
      .from("mietverhaeltnisse")
      .update({
        mieter_name: input.mieterName,
        kaltmiete: input.kaltmiete,
        nk_vorauszahlung: input.nkVorauszahlung,
        beginn: input.beginn,
        ende: input.ende,
        status: input.status,
        umlagefaehige_kostenarten: input.umlagefaehigeKostenarten,
      })
      .eq("id", id)
      .select(
        "id, mieter_name, einheit_id, objekt_id, kaltmiete, nk_vorauszahlung, beginn, ende, status, umlagefaehige_kostenarten",
      )
      .single();

    if (error) throw error;
    return mapMietverhaeltnis(data as DbMietverhaeltnis);
  },

  async deleteMietverhaeltnis(id: string): Promise<void> {
    const { error } = await supabase.from("mietverhaeltnisse").delete().eq("id", id);
    if (error) throw error;
  },

  async listSollstellungen(_filter: Filter = {}): Promise<Paginated<Sollstellung>> {
    return { items: [], gesamt: 0 };
  },

  async erzeugeSollstellungLauf(_input: { zeitraum: string; mandantId?: string }): Promise<{
    lauf: string;
    anzahl: number;
  }> {
    throw new NotImplementedError("verwaltung.erzeugeSollstellungLauf");
  },

  async listZahlungen(_filter: Filter = {}): Promise<Paginated<Zahlung>> {
    return { items: [], gesamt: 0 };
  },

  async listRueckstaende(_filter: Filter = {}): Promise<Paginated<Rueckstand>> {
    return { items: [], gesamt: 0 };
  },

  async bucheZahlung(_input: Omit<Zahlung, "id">): Promise<Zahlung> {
    throw new NotImplementedError("verwaltung.bucheZahlung");
  },

  async importBankauszugCamt(_file: File): Promise<{ importiert: number; unzugeordnet: number }> {
    throw new NotImplementedError("verwaltung.importBankauszugCamt");
  },

  async listKostenpositionen(_filter: Filter & { objektId?: string } = {}): Promise<Paginated<Kostenposition>> {
    return { items: [], gesamt: 0 };
  },

  async createKostenposition(_input: Omit<Kostenposition, "id">): Promise<Kostenposition> {
    throw new NotImplementedError("verwaltung.createKostenposition");
  },

  async listNkAbrechnungen(_filter: Filter & { objektId?: string } = {}): Promise<Paginated<NkAbrechnung>> {
    return { items: [], gesamt: 0 };
  },

  async erstelleNkAbrechnung(_input: {
    objektId: string;
    zeitraumVon: string;
    zeitraumBis: string;
  }): Promise<NkAbrechnung> {
    throw new NotImplementedError("verwaltung.erstelleNkAbrechnung");
  },
};

export type VerwaltungApi = typeof verwaltungApi;
