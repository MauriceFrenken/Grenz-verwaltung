import { rollenMitGesellschaftZugriff } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type {
  Benutzer,
  BenutzerEinladungInput,
  BenutzerUpdateInput,
  GesellschaftZuweisung,
  Paginated,
  RolleName,
  RollenDefinition,
} from "@/types";

const FALLBACK_ROLLEN: RollenDefinition[] = [
  {
    id: "administrator",
    bezeichnung: "Administrator",
    beschreibung: "Vollzugriff auf alle Gesellschaften und Konfiguration.",
    rang: 1,
    istSystem: true,
    gesellschaftZuweisung: "alle",
  },
  {
    id: "manager",
    bezeichnung: "Manager",
    beschreibung: "Führungsverantwortung mit Zugriff auf Verwaltung und operative Module.",
    rang: 2,
    istSystem: true,
    gesellschaftZuweisung: "alle",
  },
  {
    id: "mitarbeiter",
    bezeichnung: "Mitarbeiter",
    beschreibung: "Operativer Zugriff auf zugewiesene Aufgaben und Gesellschaften.",
    rang: 3,
    istSystem: true,
    gesellschaftZuweisung: "alle",
  },
  {
    id: "leser",
    bezeichnung: "Leser",
    beschreibung: "Nur-Lesen-Zugriff auf zugewiesene Gesellschaften.",
    rang: 4,
    istSystem: true,
    gesellschaftZuweisung: "einzeln",
  },
];

function mapRolleRow(row: {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  rang: number | string;
  ist_system: boolean;
  gesellschaft_zuweisung?: GesellschaftZuweisung | null;
}): RollenDefinition {
  return {
    id: row.id,
    bezeichnung: row.bezeichnung,
    beschreibung: row.beschreibung,
    rang: Number(row.rang),
    istSystem: row.ist_system,
    gesellschaftZuweisung: row.gesellschaft_zuweisung ?? "alle",
  };
}

export const einstellungenApi = {
  async listRollen(): Promise<RollenDefinition[]> {
    const { data, error } = await supabase
      .from("rollen")
      .select("id, bezeichnung, beschreibung, rang, ist_system, gesellschaft_zuweisung")
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
  async listBenutzer(): Promise<Paginated<Benutzer>> {
    const mitGesellschaften = await supabase
      .from("profiles")
      .select("id, email, name, initialen, rolle, stellenbezeichnung, alle_gesellschaften, benutzer_gesellschaften(gesellschaft_id)")
      .order("name", { ascending: true });

    if (!mitGesellschaften.error) {
      const items: Benutzer[] = (mitGesellschaften.data ?? []).map((row) => {
        const rolle = row.rolle as RolleName;
        const zuordnungen = row.benutzer_gesellschaften as Array<{ gesellschaft_id: string }> | null;
        const gesellschaftZugriff =
          row.alle_gesellschaften || !zuordnungen?.length
            ? ("*" as const)
            : zuordnungen.map((z) => z.gesellschaft_id);

        return {
          id: row.id,
          email: row.email,
          name: row.name,
          initialen: row.initialen,
          stellenbezeichnung: row.stellenbezeichnung ?? "",
          rollen: rollenMitGesellschaftZugriff(rolle, gesellschaftZugriff),
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
      rollen: rollenMitGesellschaftZugriff(row.rolle as RolleName, "*"),
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
        gesellschaftZugriff: input.gesellschaftZugriff,
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
        gesellschaftZugriff: input.gesellschaftZugriff,
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
