import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Accounts aus sf_kontakte, deren Name mit „Test“ beginnt (z. B. „Test GmbH“). Mandate dieser
 * Eigentümer sind Testdatensätze, auch wenn Mandatsname und Objekt unauffällig sind.
 */
export async function testEigentuemer(
  admin: SupabaseClient,
  accountIds: Array<string | null | undefined>,
): Promise<Set<string>> {
  const ids = [...new Set(accountIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Set();
  const { data, error } = await admin
    .from("sf_kontakte")
    .select("sf_id")
    .in("sf_id", ids)
    .ilike("name", "test%");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => String(r.sf_id)));
}
