import { createClient } from "npm:@supabase/supabase-js@2";

export const SYSTEM_ROLLE_RANG: Record<string, number> = {
  op_admin: 0,
  administrator: 1,
  manager: 2,
  mitarbeiter: 3,
  leser: 4,
};

export const BENUTZER_VERWALTER_ROLLEN = ["op_admin", "administrator", "manager"];

export function initialenAusName(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return "–";
  if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
  return `${teile[0][0] ?? ""}${teile[teile.length - 1][0] ?? ""}`.toUpperCase();
}

export async function rolleRang(
  admin: ReturnType<typeof createClient>,
  rolle: string,
): Promise<number | null> {
  if (rolle === "op_admin") return 0;

  const { data, error } = await admin
    .from("rollen")
    .select("rang")
    .eq("id", rolle)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return SYSTEM_ROLLE_RANG[rolle] ?? null;
    }
    throw error;
  }

  if (data?.rang !== undefined && data?.rang !== null) {
    return Number(data.rang);
  }

  return SYSTEM_ROLLE_RANG[rolle] ?? null;
}

export async function darfRolleZuweisen(
  admin: ReturnType<typeof createClient>,
  bearbeiterRolle: string,
  zielRolle: string,
): Promise<boolean> {
  if (bearbeiterRolle === "op_admin") return true;
  if (zielRolle === "op_admin") return false;
  const bearbeiterRang = await rolleRang(admin, bearbeiterRolle);
  const zielRang = await rolleRang(admin, zielRolle);
  if (bearbeiterRang === null || zielRang === null) return false;
  return zielRang > bearbeiterRang;
}

export async function darfBenutzerVerwalten(
  admin: ReturnType<typeof createClient>,
  bearbeiterRolle: string,
  zielRolle: string,
): Promise<boolean> {
  if (bearbeiterRolle === "op_admin") return true;
  if (zielRolle === "op_admin") return false;
  return darfRolleZuweisen(admin, bearbeiterRolle, zielRolle);
}

export async function istGueltigeRolle(
  admin: ReturnType<typeof createClient>,
  rolle: string,
): Promise<boolean> {
  if (rolle === "op_admin") return true;
  if (SYSTEM_ROLLE_RANG[rolle] !== undefined) {
    return true;
  }

  const { data, error } = await admin
    .from("rollen")
    .select("id")
    .eq("id", rolle)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return false;
    }
    throw error;
  }

  return data !== null;
}

export type MandantZuweisung = "alle" | "mehrere" | "einzeln";

export async function mandantZuweisungFuerRolle(
  admin: ReturnType<typeof createClient>,
  rolle: string,
): Promise<MandantZuweisung> {
  if (rolle === "op_admin") return "alle";

  const { data, error } = await admin
    .from("rollen")
    .select("mandant_zuweisung")
    .eq("id", rolle)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return "alle";
    }
    throw error;
  }

  const zuweisung = data?.mandant_zuweisung;
  if (zuweisung === "mehrere" || zuweisung === "einzeln") return zuweisung;
  return "alle";
}

export async function mandantZugriffValidieren(
  admin: ReturnType<typeof createClient>,
  rolle: string,
  alleMandanten: boolean,
  mandantIds: string[],
): Promise<string | null> {
  const mandantZuweisung = await mandantZuweisungFuerRolle(admin, rolle);

  if (mandantZuweisung !== "alle" && alleMandanten) {
    return "Diese Rolle darf keinen Zugriff auf alle Mandanten erhalten";
  }
  if (mandantZuweisung === "einzeln" && mandantIds.length !== 1) {
    return "Für diese Rolle ist genau ein Mandant erlaubt";
  }
  if (!alleMandanten) {
    const { data: mandanten, error: mandantenError } = await admin
      .from("mandanten")
      .select("id")
      .in("id", mandantIds);

    if (mandantenError) return mandantenError.message;
    if ((mandanten ?? []).length !== mandantIds.length) {
      return "Ein oder mehrere Mandanten sind ungültig";
    }
  }

  return null;
}

export async function benutzerMandantenSpeichern(
  admin: ReturnType<typeof createClient>,
  userId: string,
  alleMandanten: boolean,
  mandantIds: string[],
): Promise<string | null> {
  const { error: profileError } = await admin
    .from("profiles")
    .update({ alle_mandanten: alleMandanten })
    .eq("id", userId);

  if (profileError) return profileError.message;

  if (alleMandanten) {
    const { error: deleteError } = await admin
      .from("benutzer_mandanten")
      .delete()
      .eq("benutzer_id", userId);
    if (deleteError) return deleteError.message;
    return null;
  }

  const { error: deleteZuordnungError } = await admin
    .from("benutzer_mandanten")
    .delete()
    .eq("benutzer_id", userId);

  if (deleteZuordnungError) return deleteZuordnungError.message;

  const { error: zuordnungError } = await admin.from("benutzer_mandanten").insert(
    mandantIds.map((mandant_id) => ({
      benutzer_id: userId,
      mandant_id,
    })),
  );

  if (zuordnungError) return zuordnungError.message;
  return null;
}
