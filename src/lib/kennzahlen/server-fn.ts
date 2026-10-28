/** Server-Funktion für die Kennzahlen-Seite. */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";
import { GRENZ_GESELLSCHAFT_ID } from "@/lib/grenz";
import {
  berechneKennzahlen,
  PDF_IMPORT_PRAEFIX,
  type RohBuchung,
} from "./berechnen";
import type { KennzahlenDto } from "./types";

export type { KennzahlenDto };

type Eingabe = { supabaseAccessToken: string; jahr: number };

function heuteIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const kennzahlenLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown): Eingabe => {
    const d = (data ?? {}) as Partial<Eingabe>;
    const jahr = Number(d.jahr);
    return {
      supabaseAccessToken:
        typeof d.supabaseAccessToken === "string" ? d.supabaseAccessToken : "",
      jahr:
        Number.isInteger(jahr) && jahr > 2000 ? jahr : new Date().getFullYear(),
    };
  })
  .handler(async ({ data }): Promise<KennzahlenDto> => {
    await microsoftCallerAusJwt(data.supabaseAccessToken);
    const admin = createServiceRoleClient();

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

    // Alle Buchungen ab Jahresbeginn (spätere Jahre für die Saldo-Rückrechnung),
    // mindestens aber die letzten 13 Monate für Runway und offene USt.
    const heute = heuteIso();
    const vor13 = new Date(`${heute.slice(0, 7)}-01T00:00:00Z`);
    vor13.setUTCMonth(vor13.getUTCMonth() - 13);
    const ab = [
      `${data.jahr}-01-01`,
      vor13.toISOString().slice(0, 10),
    ].sort()[0];
    const buchungen: RohBuchung[] = [];
    const SEITE = 1000;
    for (let von = 0; ibans.length; von += SEITE) {
      const { data: rows, error } = await admin
        .from("bankbuchungen")
        .select(
          "konto_iban, buchungsdatum, betrag, gegenkonto_iban, auftraggeber_name, verwendungszweck, bankauszuege(dateiname)",
        )
        .in("konto_iban", ibans)
        .gte("buchungsdatum", ab)
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
      jahr: data.jahr,
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
  });
