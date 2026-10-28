/**
 * Liest eine Supabase-Abfrage seitenweise vollständig. PostgREST liefert höchstens
 * 1.000 Zeilen je Anfrage (max_rows); ein `.limit(5000)` allein schneidet still ab.
 * Die Abfrage braucht eine stabile Sortierung (z. B. nach sf_id).
 */
export async function alleSeiten<T>(
  abfrage: (
    von: number,
    bis: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const seite = 1000;
  const ergebnis: T[] = [];
  for (let i = 0; ; i += seite) {
    const { data, error } = await abfrage(i, i + seite - 1);
    if (error) throw new Error(error.message);
    ergebnis.push(...(data ?? []));
    if (!data || data.length < seite) return ergebnis;
  }
}
