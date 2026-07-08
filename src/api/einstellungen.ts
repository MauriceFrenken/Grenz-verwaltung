import { NotImplementedError } from "@/lib/errors";
import {
  defaultMatrix,
  matrixAusDbRows,
  SYSTEM_KONFIGURIERBARE_ROLLEN,
  type KonfigurierbareRolle,
  type RolleBerechtigungenMap,
} from "@/lib/permissions";
import { rollenMitMandantZugriff } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type {
  Benutzer,
  BenutzerEinladungInput,
  BenutzerUpdateInput,
  Mandant,
  MandantZuweisung,
  Paginated,
  Rolle,
  RolleName,
  RollenDefinition,
} from "@/types";

const FALLBACK_ROLLEN: RollenDefinition[] = [
  {
    id: "administrator",
    bezeichnung: "Administrator",
    beschreibung: "Vollzugriff auf alle Mandanten und Konfiguration.",
    rang: 1,
    istSystem: true,
    mandantZuweisung: "alle",
  },
  {
    id: "manager",
    bezeichnung: "Manager",
    beschreibung: "Führungsverantwortung mit Zugriff auf Verwaltung und operative Module.",
    rang: 2,
    istSystem: true,
    mandantZuweisung: "alle",
  },
  {
    id: "mitarbeiter",
    bezeichnung: "Mitarbeiter",
    beschreibung: "Operativer Zugriff auf zugewiesene Aufgaben und Mandanten.",
    rang: 3,
    istSystem: true,
    mandantZuweisung: "alle",
  },
  {
    id: "leser",
    bezeichnung: "Leser",
    beschreibung: "Nur-Lesen-Zugriff auf zugewiesene Mandanten.",
    rang: 4,
    istSystem: true,
    mandantZuweisung: "einzeln",
  },
];

function mapRolleRow(row: {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  rang: number | string;
  ist_system: boolean;
  mandant_zuweisung?: MandantZuweisung | null;
}): RollenDefinition {
  return {
    id: row.id,
    bezeichnung: row.bezeichnung,
    beschreibung: row.beschreibung,
    rang: Number(row.rang),
    istSystem: row.ist_system,
    mandantZuweisung: row.mandant_zuweisung ?? "alle",
  };
}

export const einstellungenApi = {
  async listMandanten(): Promise<Paginated<Mandant>> {
    const { data, error, count } = await supabase
      .from("mandanten")
      .select("id, name, kuerzel, objekte(count)", { count: "exact" })
      .order("name", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return { items: [], gesamt: 0 };
      }
      throw error;
    }

    const items: Mandant[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      kuerzel: row.kuerzel,
      anzahlObjekte: (row.objekte as Array<{ count: number }> | undefined)?.[0]?.count ?? 0,
    }));

    return { items, gesamt: count ?? items.length };
  },
  async saveMandant(input: Omit<Mandant, "anzahlObjekte">): Promise<Mandant> {
    const { data, error } = await supabase
      .from("mandanten")
      .upsert(
        { id: input.id, name: input.name, kuerzel: input.kuerzel },
        { onConflict: "id" },
      )
      .select("id, name, kuerzel, objekte(count)")
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      kuerzel: data.kuerzel,
      anzahlObjekte: (data.objekte as Array<{ count: number }> | undefined)?.[0]?.count ?? 0,
    };
  },
  async deleteMandant(id: string): Promise<void> {
    const { error } = await supabase.from("mandanten").delete().eq("id", id);
    if (error) throw error;
  },
  async listRollen(): Promise<RollenDefinition[]> {
    const { data, error } = await supabase
      .from("rollen")
      .select("id, bezeichnung, beschreibung, rang, ist_system, mandant_zuweisung")
      .order("rang", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return FALLBACK_ROLLEN;
      }
      throw error;
    }

    if (!data || data.length === 0) {
      return FALLBACK_ROLLEN;
    }

    return data.map(mapRolleRow);
  },
  async createRolle(input: {
    id: string;
    bezeichnung: string;
    beschreibung: string;
    unterhalbVon: string;
  }): Promise<RollenDefinition> {
    const { data, error } = await supabase.rpc("create_rolle", {
      p_id: input.id,
      p_bezeichnung: input.bezeichnung,
      p_beschreibung: input.beschreibung,
      p_unterhalb_von: input.unterhalbVon,
    });

    if (error) throw error;

    const row = data as {
      id: string;
      bezeichnung: string;
      beschreibung: string;
      rang: number | string;
      ist_system: boolean;
    };

    return mapRolleRow(row);
  },
  async updateRolleBeschreibung(
    rolle: KonfigurierbareRolle,
    beschreibung: string,
  ): Promise<RollenDefinition> {
    const { data, error } = await supabase.rpc("update_rolle_beschreibung", {
      p_rolle: rolle,
      p_beschreibung: beschreibung,
    });

    if (error) throw error;

    return mapRolleRow(
      data as {
        id: string;
        bezeichnung: string;
        beschreibung: string;
        rang: number | string;
        ist_system: boolean;
        mandant_zuweisung?: MandantZuweisung | null;
      },
    );
  },
  async updateRolleMandantZuweisung(
    rolle: KonfigurierbareRolle,
    mandantZuweisung: MandantZuweisung,
  ): Promise<RollenDefinition> {
    const { data, error } = await supabase.rpc("update_rolle_mandant_zuweisung", {
      p_rolle: rolle,
      p_mandant_zuweisung: mandantZuweisung,
    });

    if (error) throw error;

    return mapRolleRow(
      data as {
        id: string;
        bezeichnung: string;
        beschreibung: string;
        rang: number | string;
        ist_system: boolean;
        mandant_zuweisung: MandantZuweisung;
      },
    );
  },
  async listRollenBerechtigungen(rollenIds?: KonfigurierbareRolle[]): Promise<RolleBerechtigungenMap> {
    const ids = rollenIds ?? [...SYSTEM_KONFIGURIERBARE_ROLLEN];

    const { data, error } = await supabase
      .from("rolle_berechtigungen")
      .select("rolle, berechtigung_id, aktiv");

    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return defaultMatrix(ids);
      }
      throw error;
    }

    if (!data || data.length === 0) {
      return defaultMatrix(ids);
    }

    return matrixAusDbRows(data, ids);
  },
  async saveRollenBerechtigungen(
    rolle: KonfigurierbareRolle,
    matrix: RolleBerechtigungenMap,
  ): Promise<void> {
    const eintraege = Object.entries(matrix[rolle] ?? {}).map(([berechtigung_id, aktiv]) => ({
      berechtigung_id,
      aktiv,
    }));

    const { error: rpcError } = await supabase.rpc("save_rolle_berechtigungen", {
      p_rolle: rolle,
      p_berechtigungen: eintraege,
    });

    if (rpcError) {
      if (rpcError.message.includes("save_rolle_berechtigungen")) {
        const { error: deleteError } = await supabase
          .from("rolle_berechtigungen")
          .delete()
          .eq("rolle", rolle);
        if (deleteError) throw deleteError;

        const rows = eintraege.map((e) => ({
          rolle,
          berechtigung_id: e.berechtigung_id,
          aktiv: e.aktiv,
        }));
        const { error: insertError } = await supabase.from("rolle_berechtigungen").insert(rows);
        if (insertError) throw insertError;
        return;
      }
      throw rpcError;
    }
  },
  async listBenutzer(): Promise<Paginated<Benutzer>> {
    const mitMandanten = await supabase
      .from("profiles")
      .select("id, email, name, initialen, rolle, stellenbezeichnung, alle_mandanten, benutzer_mandanten(mandant_id)")
      .order("name", { ascending: true });

    if (!mitMandanten.error) {
      const items: Benutzer[] = (mitMandanten.data ?? []).map((row) => {
        const rolle = row.rolle as RolleName;
        const zuordnungen = row.benutzer_mandanten as Array<{ mandant_id: string }> | null;
        const mandantZugriff =
          row.alle_mandanten || !zuordnungen?.length
            ? ("*" as const)
            : zuordnungen.map((z) => z.mandant_id);

        return {
          id: row.id,
          email: row.email,
          name: row.name,
          initialen: row.initialen,
          stellenbezeichnung: row.stellenbezeichnung ?? "",
          rollen: rollenMitMandantZugriff(rolle, mandantZugriff),
        };
      });

      return { items, gesamt: items.length };
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, name, initialen, rolle, stellenbezeichnung")
      .order("name", { ascending: true });

    if (error) throw error;

    const items: Benutzer[] = (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      initialen: row.initialen,
      stellenbezeichnung: row.stellenbezeichnung ?? "",
      rollen: rollenMitMandantZugriff(row.rolle as RolleName, "*"),
    }));

    return { items, gesamt: items.length };
  },
  async inviteBenutzer(input: BenutzerEinladungInput): Promise<{ id: string }> {
    const redirectTo = `${window.location.origin}/einladung`;
    const { data, error } = await supabase.functions.invoke("invite-benutzer", {
      body: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        stellenbezeichnung: input.stellenbezeichnung.trim(),
        rolle: input.rolle,
        mandantZugriff: input.mandantZugriff,
        redirectTo,
      },
    });

    return parseInviteAntwort(data, error);
  },
  async resendEinladung(email: string): Promise<{ id: string }> {
    const redirectTo = `${window.location.origin}/einladung`;
    const { data, error } = await supabase.functions.invoke("invite-benutzer", {
      body: {
        resend: true,
        email: email.trim().toLowerCase(),
        redirectTo,
      },
    });

    return parseInviteAntwort(data, error);
  },
  async updateBenutzer(input: BenutzerUpdateInput): Promise<void> {
    const { data, error } = await supabase.functions.invoke("update-benutzer", {
      body: {
        id: input.id,
        name: input.name.trim(),
        stellenbezeichnung: input.stellenbezeichnung.trim(),
        rolle: input.rolle,
        mandantZugriff: input.mandantZugriff,
      },
    });

    if (error) {
      const message = await edgeFunctionErrorMessage(error, data);
      throw new Error(message);
    }

    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new Error(String(data.error));
    }
  },
  async deleteBenutzer(id: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke("delete-benutzer", {
      body: { id },
    });

    if (error) {
      const message = await edgeFunctionErrorMessage(error, data);
      throw new Error(message);
    }

    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new Error(String(data.error));
    }
  },
};

async function parseInviteAntwort(
  data: unknown,
  error: { message: string; context?: Response } | null,
): Promise<{ id: string }> {
  if (error) {
    const message = await edgeFunctionErrorMessage(error, data);
    throw new Error(message);
  }

  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }

  const id =
    data && typeof data === "object" && "id" in data && typeof data.id === "string"
      ? data.id
      : "";
  if (!id) throw new Error("Einladung konnte nicht erstellt werden");
  return { id };
}

async function edgeFunctionErrorMessage(error: { message: string }, data: unknown): Promise<string> {
  if (data && typeof data === "object" && "error" in data && data.error) {
    return String(data.error);
  }
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // fall through
    }
  }
  return error.message || "Einladung fehlgeschlagen";
}

export type EinstellungenApi = typeof einstellungenApi;
