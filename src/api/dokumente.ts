import { OUTLOOK_MESSAGES_SINCE } from "@/features/dokumente/outlook/config";
import { supabase } from "@/lib/supabase";
import type {
  AuditEintrag,
  Dokument,
  DokumentKategorie,
  DokumentMetadatenKorrektur,
  Filter,
  Paginated,
  PruefAufgabe,
  PruefEntscheidung,
} from "@/types";
import type { PosteingangAnalyseStatus } from "@/features/dokumente/outlook/types";

type DbKategorie = {
  id: string;
  name: string;
  beschreibung: string;
};

type DbPosteingang = {
  id: string;
  nachricht_id: string;
  outlook_account_id: string;
  graph_nachricht_id: string;
  betreff: string | null;
  absender: string | null;
  absender_mail: string | null;
  eingegangen_am: string | null;
  anhang_name: string | null;
  anhang_content_type: string | null;
  email_text: string | null;
  kategorie_id: string | null;
  mandant_id: string | null;
  objekt_id: string | null;
  dateiname: string | null;
  konfidenz: number | string | null;
  status: "neu" | "analysiert" | "abgelegt" | "in_pruefung" | "abgelehnt";
  dokument_kategorien?: { name: string } | null;
};

function mapKategorie(row: DbKategorie): DokumentKategorie {
  return {
    id: row.id,
    name: row.name,
    beschreibung: row.beschreibung,
  };
}

function numKonfidenz(value: number | string | null): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function ablageortAusEintrag(row: DbPosteingang): string {
  const parts = [row.mandant_id, row.objekt_id].filter(Boolean);
  return parts.length ? `OneDrive/${parts.join("/")}` : "OneDrive (ausstehend)";
}

function mapDokumentStatus(
  status: DbPosteingang["status"],
): Dokument["status"] {
  if (status === "analysiert") return "analysiert";
  if (status === "in_pruefung") return "in_pruefung";
  if (status === "abgelehnt") return "abgelehnt";
  return "abgelegt";
}

function mapDokument(row: DbPosteingang): Dokument {
  return {
    id: row.id,
    dateiname: row.dateiname ?? row.anhang_name ?? "Unbenannt",
    mandantId: row.mandant_id,
    objektId: row.objekt_id,
    kategorieId: row.kategorie_id,
    transaktionId: null,
    typ: "sonstiges",
    datum: row.eingegangen_am ?? row.id,
    ablageort: ablageortAusEintrag(row),
    status: mapDokumentStatus(row.status),
    kategorieName: row.dokument_kategorien?.name ?? null,
    betreff: row.betreff,
    absender: row.absender ?? row.absender_mail,
    anhangName: row.anhang_name,
    emailText: row.email_text,
  };
}

function mapPruefAufgabe(row: DbPosteingang): PruefAufgabe {
  return {
    id: row.id,
    dokumentId: row.id,
    dateiname: row.dateiname ?? row.anhang_name ?? "Unbenannt",
    absender: row.absender ?? row.absender_mail ?? "Unbekannt",
    betreff: row.betreff ?? "(Kein Betreff)",
    emailText: row.email_text,
    anhangName: row.anhang_name,
    vorschlag: {
      mandantId: row.mandant_id,
      objektId: row.objekt_id,
      typ: "sonstiges",
      kategorieId: row.kategorie_id,
      kategorieName: row.dokument_kategorien?.name ?? null,
    },
    konfidenz: numKonfidenz(row.konfidenz),
    entscheidung: "offen",
    eingegangenAm: row.eingegangen_am ?? new Date().toISOString(),
  };
}

function mapAnalyseStatus(row: DbPosteingang): PosteingangAnalyseStatus {
  return {
    nachrichtId: row.nachricht_id,
    status: row.status,
    kategorieName: row.dokument_kategorien?.name ?? null,
    mandantId: row.mandant_id,
    objektId: row.objekt_id,
    dateiname: row.dateiname,
    konfidenz: row.konfidenz !== null ? numKonfidenz(row.konfidenz) : null,
  };
}

const POSTEINGANG_SELECT =
  "id, nachricht_id, outlook_account_id, graph_nachricht_id, betreff, absender, absender_mail, eingegangen_am, anhang_name, anhang_content_type, email_text, kategorie_id, mandant_id, objekt_id, dateiname, konfidenz, status, dokument_kategorien(name)";

export const dokumenteApi = {
  async listKategorien(): Promise<Paginated<DokumentKategorie>> {
    const { data, error, count } = await supabase
      .from("dokument_kategorien")
      .select("id, name, beschreibung", { count: "exact" })
      .order("name", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return { items: [], gesamt: 0 };
      }
      throw error;
    }

    const items = (data ?? []).map((row) => mapKategorie(row as DbKategorie));
    return { items, gesamt: count ?? items.length };
  },

  async saveKategorie(input: { id?: string; name: string; beschreibung: string }): Promise<DokumentKategorie> {
    const payload = {
      name: input.name.trim(),
      beschreibung: input.beschreibung.trim(),
    };

    if (input.id) {
      const { data, error } = await supabase
        .from("dokument_kategorien")
        .update(payload)
        .eq("id", input.id)
        .select("id, name, beschreibung")
        .single();
      if (error) throw error;
      return mapKategorie(data as DbKategorie);
    }

    const { data, error } = await supabase
      .from("dokument_kategorien")
      .insert(payload)
      .select("id, name, beschreibung")
      .single();
    if (error) throw error;
    return mapKategorie(data as DbKategorie);
  },

  async deleteKategorie(id: string): Promise<void> {
    const { error } = await supabase.from("dokument_kategorien").delete().eq("id", id);
    if (error) throw error;
  },

  async listDokumente(filter: Filter & { typ?: string } = {}): Promise<Paginated<Dokument>> {
    let query = supabase
      .from("posteingang_dokumente")
      .select(POSTEINGANG_SELECT, { count: "exact" })
      .in("status", ["abgelegt", "analysiert"])
      .gte("eingegangen_am", OUTLOOK_MESSAGES_SINCE)
      .order("eingegangen_am", { ascending: false });

    if (filter.mandantId) {
      query = query.eq("mandant_id", filter.mandantId);
    }
    if (filter.suche?.trim()) {
      const term = `%${filter.suche.trim()}%`;
      query = query.or(`dateiname.ilike.${term},betreff.ilike.${term},absender.ilike.${term}`);
    }

    const { data, error, count } = await query;
    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return { items: [], gesamt: 0 };
      }
      throw error;
    }

    const items = (data ?? []).map((row) => mapDokument(row as DbPosteingang));
    return { items, gesamt: count ?? items.length };
  },

  async getDokument(id: string): Promise<Dokument | null> {
    const { data, error } = await supabase
      .from("posteingang_dokumente")
      .select(POSTEINGANG_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") return null;
      throw error;
    }
    return data ? mapDokument(data as DbPosteingang) : null;
  },

  async getDokumentByNachrichtId(nachrichtId: string): Promise<Dokument | null> {
    const { data, error } = await supabase
      .from("posteingang_dokumente")
      .select(POSTEINGANG_SELECT)
      .eq("nachricht_id", nachrichtId)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") return null;
      throw error;
    }
    return data ? mapDokument(data as DbPosteingang) : null;
  },

  async updateDokumentMetadaten(id: string, korrektur: DokumentMetadatenKorrektur): Promise<void> {
    const { error } = await supabase
      .from("posteingang_dokumente")
      .update({
        mandant_id: korrektur.mandantId,
        objekt_id: korrektur.objektId,
        kategorie_id: korrektur.kategorieId,
        dateiname: korrektur.dateiname.trim(),
        status: "abgelegt",
      })
      .eq("id", id);

    if (error) throw error;
  },

  async listPruefAufgaben(filter: Filter = {}): Promise<Paginated<PruefAufgabe>> {
    let query = supabase
      .from("posteingang_dokumente")
      .select(POSTEINGANG_SELECT, { count: "exact" })
      .eq("status", "in_pruefung")
      .order("eingegangen_am", { ascending: false });

    if (filter.mandantId) {
      query = query.or(`mandant_id.eq.${filter.mandantId},mandant_id.is.null`);
    }

    const { data, error, count } = await query;
    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return { items: [], gesamt: 0 };
      }
      throw error;
    }

    const items = (data ?? []).map((row) => mapPruefAufgabe(row as DbPosteingang));
    return { items, gesamt: count ?? items.length };
  },

  async getPosteingangStatus(nachrichtId: string): Promise<PosteingangAnalyseStatus | null> {
    const { data, error } = await supabase
      .from("posteingang_dokumente")
      .select(POSTEINGANG_SELECT)
      .eq("nachricht_id", nachrichtId)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") return null;
      throw error;
    }
    return data ? mapAnalyseStatus(data as DbPosteingang) : null;
  },

  async listPosteingangStatuses(nachrichtIds: string[]): Promise<Record<string, PosteingangAnalyseStatus>> {
    if (nachrichtIds.length === 0) return {};

    const { data, error } = await supabase
      .from("posteingang_dokumente")
      .select(POSTEINGANG_SELECT)
      .in("nachricht_id", nachrichtIds);

    if (error) {
      if (error.code === "42P01") return {};
      throw error;
    }

    const result: Record<string, PosteingangAnalyseStatus> = {};
    for (const row of data ?? []) {
      const mapped = mapAnalyseStatus(row as DbPosteingang);
      result[mapped.nachrichtId] = mapped;
    }
    return result;
  },

  async savePosteingangAnalyse(input: {
    nachrichtId: string;
    outlookAccountId: string;
    graphNachrichtId: string;
    betreff: string;
    absender: string;
    absenderMail: string;
    eingegangenAm: string;
    anhangName: string | null;
    anhangContentType: string | null;
    emailText: string;
    kategorieId: string | null;
    mandantId: string | null;
    objektId: string | null;
    dateiname: string | null;
    konfidenz: number;
  }): Promise<PosteingangAnalyseStatus> {
    const vollstaendig =
      Boolean(input.kategorieId) && Boolean(input.mandantId) && Boolean(input.objektId);
    const payload = {
      nachricht_id: input.nachrichtId,
      outlook_account_id: input.outlookAccountId,
      graph_nachricht_id: input.graphNachrichtId,
      betreff: input.betreff,
      absender: input.absender,
      absender_mail: input.absenderMail,
      eingegangen_am: input.eingegangenAm || null,
      anhang_name: input.anhangName,
      anhang_content_type: input.anhangContentType,
      email_text: input.emailText,
      kategorie_id: input.kategorieId,
      mandant_id: input.mandantId,
      objekt_id: input.objektId,
      dateiname: input.dateiname,
      konfidenz: input.konfidenz,
      status: vollstaendig ? "abgelegt" : "in_pruefung",
    };

    const { data, error } = await supabase
      .from("posteingang_dokumente")
      .upsert(payload, { onConflict: "nachricht_id" })
      .select(POSTEINGANG_SELECT)
      .single();

    if (error) throw error;
    return mapAnalyseStatus(data as DbPosteingang);
  },

  async entscheidePruefAufgabe(
    id: string,
    entscheidung: PruefEntscheidung,
    korrektur?: {
      mandantId?: string;
      objektId?: string;
      kategorieId?: string;
      dateiname?: string;
    },
  ): Promise<void> {
    if (entscheidung === "abgelehnt") {
      const { error } = await supabase
        .from("posteingang_dokumente")
        .update({ status: "abgelehnt" })
        .eq("id", id);
      if (error) throw error;
      return;
    }

    const update: Record<string, unknown> = {
      status: entscheidung === "bestaetigt" ? "abgelegt" : "abgelegt",
    };

    if (korrektur?.mandantId) update.mandant_id = korrektur.mandantId;
    if (korrektur?.objektId) update.objekt_id = korrektur.objektId;
    if (korrektur?.kategorieId) update.kategorie_id = korrektur.kategorieId;
    if (korrektur?.dateiname) update.dateiname = korrektur.dateiname;

    const { error } = await supabase.from("posteingang_dokumente").update(update).eq("id", id);
    if (error) throw error;
  },

  async listAuditEintraege(_filter: Filter = {}): Promise<Paginated<AuditEintrag>> {
    return { items: [], gesamt: 0 };
  },

  /** DEMO ONLY — vor Produktion entfernen */
  async resetPosteingangAnalysen(): Promise<number> {
    const { data, error } = await supabase
      .from("posteingang_dokumente")
      .delete()
      .not("nachricht_id", "is", null)
      .select("id");

    if (error) throw error;
    return data?.length ?? 0;
  },
};

export type DokumenteApi = typeof dokumenteApi;
