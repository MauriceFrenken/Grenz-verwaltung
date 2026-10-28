/** Gemeinsame Server-Hilfen des Personalbereichs (Aufrufer prüfen, Werte bereinigen). Server-only. */

import { createServiceRoleClient, pruefeAufrufer } from "@/lib/server/aufrufer";

type Roh = Record<string, unknown>;

const VERWALTENDE_ROLLEN = new Set(["op_admin", "administrator", "manager"]);

export function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function zahl(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function datum(v: unknown): string | null {
  const t = text(v);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

export function pruefe<T>(ergebnis: {
  data: T;
  error: { message: string } | null;
}): T {
  if (ergebnis.error) {
    if (
      /personal_\w+.*does not exist|relation .*personal_/i.test(
        ergebnis.error.message,
      )
    )
      throw new Error(
        "Der Personalbereich ist noch nicht eingerichtet (Datenbank-Migration fehlt).",
      );
    throw new Error(ergebnis.error.message);
  }
  return ergebnis.data;
}

export async function kontext(
  token: string,
  anforderung: "lesen" | "schreiben" = "lesen",
) {
  const aufrufer = await pruefeAufrufer(token, anforderung);
  if (aufrufer.userId === "cron")
    throw new Error("Kein Zugriff auf Personaldaten.");
  const admin = createServiceRoleClient();
  const verwalten = VERWALTENDE_ROLLEN.has(aufrufer.rolle);
  const ich = pruefe(
    await admin
      .from("personal_mitarbeiter")
      .select("id")
      .eq("profil_id", aufrufer.userId)
      .maybeSingle(),
  ) as Roh | null;
  return {
    admin,
    userId: aufrufer.userId,
    verwalten,
    ichId: ich ? String(ich.id) : null,
  };
}

export function url(v: unknown): string | null {
  const t = text(v);
  if (!t) return null;
  if (!/^https:\/\//i.test(t))
    throw new Error("Links müssen mit https:// beginnen.");
  return t;
}
