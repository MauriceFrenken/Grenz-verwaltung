/**
 * Lädt Konten, Salden und Buchungen von Grenz & Co. und berechnet die Kennzahlen eines Jahres.
 * Nur serverseitig (service_role); genutzt von der Kennzahlen-Seite und dem Gesellschafterbericht.
 */

import type { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";
import { GRENZ_GESELLSCHAFT_ID } from "@/lib/grenz";

import {
  berechneKennzahlen,
  PDF_IMPORT_PRAEFIX,
  type RohBuchung,
} from "./berechnen";
import type { KennzahlenDto } from "./types";

type Admin = ReturnType<typeof createServiceRoleClient>;

export async function kennzahlenAusDatenbank(
  admin: Admin,
  jahr: number,
  heute: string,
): Promise<KennzahlenDto> {
  const { data: konten, error: kontenErr } = await admin
    .from("bankkonten")
    .select("iban, bezeichnung")
    .eq("gesellschaft_id", GRENZ_GESELLSCHAFT_ID)
    .eq("aktiv", true)
    .order("iban");
  if (kontenErr) throw new Error(kontenErr.message);
  const ibans = (konten ?? []).map((k) => String(k.iban));

  const { data: salden, error: saldenErr } = ibans.length
    ? await admin
        .from("kontosalden")
        .select("iban, stichtag, saldo")
        .in("iban", ibans)
        .order("stichtag", { ascending: false })
    : { data: [], error: null };
  if (saldenErr) throw new Error(saldenErr.message);
  const letzterSaldo = new Map<string, { stichtag: string; saldo: number }>();
  for (const s of salden ?? []) {
    const iban = String(s.iban);
    if (!letzterSaldo.has(iban)) {
      letzterSaldo.set(iban, {
        stichtag: String(s.stichtag),
        saldo: Number(s.saldo),
      });
    }
  }

  // Alle Buchungen ab Jahresbeginn: auch spätere Jahre, für die Saldo-Rückrechnung.
  const buchungen: RohBuchung[] = [];
  const SEITE = 1000;
  for (let von = 0; ibans.length; von += SEITE) {
    const { data: rows, error } = await admin
      .from("bankbuchungen")
      .select(
        "konto_iban, buchungsdatum, betrag, gegenkonto_iban, auftraggeber_name, verwendungszweck, bankauszuege(dateiname)",
      )
      .in("konto_iban", ibans)
      .gte("buchungsdatum", `${jahr}-01-01`)
      .order("buchungsdatum")
      .order("id")
      .range(von, von + SEITE - 1);
    if (error) throw new Error(error.message);
    for (const r of rows ?? []) {
      const auszug = r.bankauszuege as
        { dateiname?: string } | { dateiname?: string }[] | null;
      const dateiname = Array.isArray(auszug)
        ? auszug[0]?.dateiname
        : auszug?.dateiname;
      buchungen.push({
        kontoIban: String(r.konto_iban),
        buchungsdatum: String(r.buchungsdatum),
        betrag: Number(r.betrag),
        gegenkontoIban: (r.gegenkonto_iban as string | null) ?? null,
        auftraggeberName: (r.auftraggeber_name as string | null) ?? null,
        verwendungszweck: (r.verwendungszweck as string | null) ?? null,
        ausPdfImport: (dateiname ?? "").startsWith(PDF_IMPORT_PRAEFIX),
      });
    }
    if (!rows || rows.length < SEITE) break;
  }

  return berechneKennzahlen({
    jahr,
    heute,
    konten: (konten ?? []).map((k) => {
      const s = letzterSaldo.get(String(k.iban));
      return {
        iban: String(k.iban),
        bezeichnung: (k.bezeichnung as string | null) ?? null,
        saldo: s?.saldo ?? null,
        saldoStichtag: s?.stichtag ?? null,
      };
    }),
    buchungen,
  });
}
