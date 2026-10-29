/**
 * Stand der Kontosalden für die Anzeige. camt.053 liefert einen Tagesendsaldo
 * nur für Tage mit Buchungen: ein Konto ohne Bewegung bliebe sonst auf dem
 * letzten Buchungstag stehen, obwohl EBICS danach erfolgreich abgerufen hat.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Letzter Tag, den ein erfolgreicher EBICS-Abruf abdeckt (Vortag des Abrufs). */
export async function letzterEbicsAbrufStichtag(
  admin: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await admin
    .from("ebics_abrufe")
    .select("created_at")
    .eq("erfolgreich", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.created_at) return null;
  const tag = new Date(String(data.created_at));
  tag.setUTCDate(tag.getUTCDate() - 1);
  return tag.toISOString().slice(0, 10);
}

/** Saldo gilt unverändert bis zum letzten Abruf, wenn seitdem nichts gebucht wurde. */
export function saldoStand(
  stichtag: string | null,
  zugang: string | null,
  abrufStichtag: string | null,
): string | null {
  if (!stichtag || zugang !== "ebics" || !abrufStichtag) return stichtag;
  return abrufStichtag > stichtag ? abrufStichtag : stichtag;
}

/** Jüngster Saldo je IBAN; am selben Tag hat camt.053 Vorrang vor dem PDF-Import. */
export function letzteSalden(
  salden: Array<{
    iban: unknown;
    stichtag: unknown;
    saldo: unknown;
    quelle?: unknown;
  }>,
): Map<string, { stichtag: string; saldo: number }> {
  const sortiert = [...salden].sort((a, b) => {
    const tag = String(b.stichtag).localeCompare(String(a.stichtag));
    if (tag !== 0) return tag;
    return (a.quelle === "camt053" ? 0 : 1) - (b.quelle === "camt053" ? 0 : 1);
  });
  const letzter = new Map<string, { stichtag: string; saldo: number }>();
  for (const s of sortiert) {
    const iban = String(s.iban);
    if (!letzter.has(iban)) {
      letzter.set(iban, {
        stichtag: String(s.stichtag),
        saldo: Number(s.saldo),
      });
    }
  }
  return letzter;
}
