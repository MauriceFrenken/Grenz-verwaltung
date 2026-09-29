import { supabase } from "@/lib/supabase";
import type {
  Bankauszug,
  Bankbuchung,
  Paginated,
  SollstellungLauf,
  SollstellungPosition,
  SollstellungPositionStatus,
  SollstellungZuordnung,
} from "@/types";

function zahl(wert: unknown): number {
  const n = Number(wert);
  return Number.isFinite(n) ? n : 0;
}

function textOderNull(wert: string | null | undefined): string | null {
  const t = wert?.trim();
  return t ? t : null;
}

function mapLauf(row: Record<string, unknown>): SollstellungLauf {
  return {
    id: String(row.id),
    zeitraum: String(row.zeitraum),
    gesellschaftId: (row.gesellschaft_id as string | null) ?? null,
    gesellschaftName: (row.gesellschaft_name as string | null) ?? null,
    gesellschaftKuerzel: (row.gesellschaft_kuerzel as string | null) ?? null,
    status: row.status as SollstellungLauf["status"],
    bemerkung: (row.bemerkung as string | null) ?? null,
    createdAt: String(row.created_at),
    anzahlPositionen: zahl(row.anzahl_positionen),
    sollSumme: zahl(row.soll_summe),
    istSumme: zahl(row.ist_summe),
    differenzSumme: zahl(row.differenz_summe),
    anzahlFehlt: zahl(row.anzahl_fehlt),
    anzahlTeilweise: zahl(row.anzahl_teilweise),
    anzahlAusgeglichen: zahl(row.anzahl_ausgeglichen),
    anzahlUeberzahlung: zahl(row.anzahl_ueberzahlung),
    anzahlOhneIban: zahl(row.anzahl_ohne_iban),
    anzahlBankauszuege: zahl(row.anzahl_bankauszuege),
  };
}

function mapPosition(row: Record<string, unknown>): SollstellungPosition {
  return {
    id: String(row.id),
    laufId: String(row.lauf_id),
    mietverhaeltnisId: String(row.mietverhaeltnis_id),
    mieterName: String(row.mieter_name),
    iban: (row.iban as string | null) ?? null,
    einheitId: String(row.einheit_id),
    einheitLage: String(row.einheit_lage),
    objektId: String(row.objekt_id),
    objektBezeichnung: String(row.objekt_bezeichnung),
    gesellschaftId: String(row.gesellschaft_id),
    gesellschaftName: String(row.gesellschaft_name),
    kaltmiete: zahl(row.kaltmiete),
    nkVorauszahlung:
      row.nk_vorauszahlung === null || row.nk_vorauszahlung === undefined
        ? null
        : zahl(row.nk_vorauszahlung),
    sollBetrag: zahl(row.soll_betrag),
    istBetrag: zahl(row.ist_betrag),
    differenz: zahl(row.differenz),
    status: row.status as SollstellungPositionStatus,
  };
}

function mapBankauszug(row: Record<string, unknown>): Bankauszug {
  return {
    id: String(row.id),
    laufId: String(row.lauf_id),
    gesellschaftId: String(row.gesellschaft_id),
    gesellschaftName: String(row.gesellschaft_name),
    gesellschaftKuerzel: String(row.gesellschaft_kuerzel),
    dateiname: String(row.dateiname),
    zeitraumVon: (row.zeitraum_von as string | null) ?? null,
    zeitraumBis: (row.zeitraum_bis as string | null) ?? null,
    anzahlBuchungen: zahl(row.anzahl_buchungen),
    createdAt: String(row.created_at),
  };
}

function mapBuchung(row: Record<string, unknown>): Bankbuchung {
  return {
    id: String(row.id),
    bankauszugId: String(row.bankauszug_id),
    buchungsdatum: String(row.buchungsdatum),
    betrag: zahl(row.betrag),
    gegenkontoIban: (row.gegenkonto_iban as string | null) ?? null,
    auftraggeberName: (row.auftraggeber_name as string | null) ?? null,
    verwendungszweck: (row.verwendungszweck as string | null) ?? null,
  };
}

export const buchhaltungApi = {
  async listSollstellungLaeufe(): Promise<Paginated<SollstellungLauf>> {
    const { data, error } = await supabase
      .from("v_sollstellung_laeufe")
      .select("*")
      .order("zeitraum", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return {
      items: (data ?? []).map((r) => mapLauf(r as Record<string, unknown>)),
      gesamt: (data ?? []).length,
    };
  },

  async getSollstellungLauf(id: string): Promise<SollstellungLauf> {
    const { data, error } = await supabase
      .from("v_sollstellung_laeufe")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Sollstellung nicht gefunden");
    return mapLauf(data as Record<string, unknown>);
  },

  async erzeugeSollstellungLauf(input: {
    zeitraum: string;
    gesellschaftId?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc("erzeuge_sollstellung_lauf", {
      p_zeitraum: input.zeitraum,
      p_gesellschaft_id: textOderNull(input.gesellschaftId ?? null),
    });
    if (error) throw error;
    return String(data);
  },

  async deleteSollstellungLauf(id: string): Promise<void> {
    const { error } = await supabase
      .from("sollstellung_laeufe")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async listPositionen(
    laufId: string,
    filter?: {
      gesellschaftId?: string | null;
      objektId?: string | null;
      status?: SollstellungPositionStatus | null;
    },
  ): Promise<Paginated<SollstellungPosition>> {
    let q = supabase
      .from("sollstellung_positionen")
      .select("*")
      .eq("lauf_id", laufId);

    if (filter?.gesellschaftId) q = q.eq("gesellschaft_id", filter.gesellschaftId);
    if (filter?.objektId) q = q.eq("objekt_id", filter.objektId);
    if (filter?.status) q = q.eq("status", filter.status);

    const { data, error } = await q
      .order("status", { ascending: true })
      .order("differenz", { ascending: false })
      .order("mieter_name", { ascending: true });
    if (error) throw error;
    return {
      items: (data ?? []).map((r) => mapPosition(r as Record<string, unknown>)),
      gesamt: (data ?? []).length,
    };
  },

  async listBankauszuege(laufId: string): Promise<Paginated<Bankauszug>> {
    const { data, error } = await supabase
      .from("v_bankauszuege")
      .select("*")
      .eq("lauf_id", laufId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return {
      items: (data ?? []).map((r) => mapBankauszug(r as Record<string, unknown>)),
      gesamt: (data ?? []).length,
    };
  },

  async deleteBankauszug(id: string, laufId: string): Promise<void> {
    const { error } = await supabase.from("bankauszuege").delete().eq("id", id);
    if (error) throw error;
    const { error: matchErr } = await supabase.rpc("gleiche_sollstellung_ab", {
      p_lauf_id: laufId,
    });
    if (matchErr) throw matchErr;
  },

  async gleicheAb(laufId: string): Promise<void> {
    const { error } = await supabase.rpc("gleiche_sollstellung_ab", {
      p_lauf_id: laufId,
    });
    if (error) throw error;
  },

  async listZuordnungen(
    positionId: string,
  ): Promise<Paginated<SollstellungZuordnung>> {
    const { data, error } = await supabase
      .from("sollstellung_zuordnungen")
      .select(
        "id, position_id, bankbuchung_id, betrag, bankbuchungen ( id, bankauszug_id, buchungsdatum, betrag, gegenkonto_iban, auftraggeber_name, verwendungszweck )",
      )
      .eq("position_id", positionId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const items: SollstellungZuordnung[] = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const b = r.bankbuchungen as Record<string, unknown> | null;
      return {
        id: String(r.id),
        positionId: String(r.position_id),
        bankbuchungId: String(r.bankbuchung_id),
        betrag: zahl(r.betrag),
        buchung: b
          ? mapBuchung(b)
          : {
              id: String(r.bankbuchung_id),
              bankauszugId: "",
              buchungsdatum: "",
              betrag: zahl(r.betrag),
              gegenkontoIban: null,
              auftraggeberName: null,
              verwendungszweck: null,
            },
      };
    });
    return { items, gesamt: items.length };
  },
};
