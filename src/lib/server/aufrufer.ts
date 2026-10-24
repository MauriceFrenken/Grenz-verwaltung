/** Prüft den Aufrufer einer Server-Funktion (Supabase-JWT) und seine Rolle. */

import { createServiceRoleClient, microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

/** Rollen mit Schreibrecht, wie public.jwt_darf_schreiben(). */
const SCHREIBENDE_ROLLEN = new Set(["op_admin", "administrator", "manager", "mitarbeiter"]);
const ADMIN_ROLLEN = new Set(["op_admin", "administrator"]);

export type Aufrufer = { userId: string; rolle: string };

export async function pruefeAufrufer(
  supabaseAccessToken: string,
  anforderung: "lesen" | "schreiben" | "admin" = "lesen",
): Promise<Aufrufer> {
  const caller = await microsoftCallerAusJwt(supabaseAccessToken);
  if (caller.userId === "cron") return { userId: caller.userId, rolle: caller.rolle };
  if (anforderung === "schreiben" && !SCHREIBENDE_ROLLEN.has(caller.rolle)) {
    throw new Error("Keine Berechtigung zum Bearbeiten.");
  }
  if (anforderung === "admin" && !ADMIN_ROLLEN.has(caller.rolle)) {
    throw new Error("Nur Administratoren dürfen diese Aktion ausführen.");
  }
  return { userId: caller.userId, rolle: caller.rolle };
}

export { createServiceRoleClient };

/** Einheitliche Eingabe der Server-Funktionen: Token plus Nutzdaten. */
export function tokenAus(data: unknown): string {
  const d = (data ?? {}) as { supabaseAccessToken?: unknown };
  return typeof d.supabaseAccessToken === "string" ? d.supabaseAccessToken : "";
}
