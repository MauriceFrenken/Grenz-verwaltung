/**
 * Server-Funktionen für EBICS (Init, HPB, Umsätze, Status).
 * Schwere EBICS-Abhängigkeiten nur lazy in den Handlern laden.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";
import { loadEbicsKunden } from "@/lib/ebics/kunden";
import type {
  EbicsKundeStatusDto,
  EbicsUmsaetzeDto,
} from "@/lib/ebics/types";
import { GRENZ_GESELLSCHAFT_ID } from "@/lib/grenz";

export type { EbicsKundeStatusDto, EbicsUmsaetzeDto };

function asToken(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const token = (data as { supabaseAccessToken?: unknown }).supabaseAccessToken;
  return typeof token === "string" ? token : "";
}

function ibanFormatiert(iban: string): string {
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

export const ebicsStatusFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();
    const { data: rows, error } = await admin
      .from("v_ebics_kunden")
      .select("*")
      .eq("gesellschaft_id", GRENZ_GESELLSCHAFT_ID)
      .order("partner_id");
    if (error) throw new Error(error.message);

    const kundeIds = (rows ?? []).map((r) => String(r.id));
    const { data: kundenMeta } = kundeIds.length
      ? await admin
          .from("ebics_kunden")
          .select("id, partner_id")
          .in("id", kundeIds)
      : { data: [] as Array<{ id: string; partner_id: string }> };
    const partnerById = new Map(
      (kundenMeta ?? []).map((k) => [String(k.id), String(k.partner_id)]),
    );

    const { data: kontenRows } = kundeIds.length
      ? await admin
          .from("ebics_konten")
          .select("ebics_kunde_id, iban, aktiv")
          .in("ebics_kunde_id", kundeIds)
          .eq("aktiv", true)
      : { data: [] as Array<{ ebics_kunde_id: string; iban: string }> };
    const ibans = (kontenRows ?? []).map((k) => String(k.iban));
    const { data: bankRows } = ibans.length
      ? await admin
          .from("bankkonten")
          .select("iban, bezeichnung, gesellschaft_id")
          .in("iban", ibans)
      : {
          data: [] as Array<{
            iban: string;
            bezeichnung: string | null;
            gesellschaft_id: string;
          }>,
        };
    const bankByIban = new Map(
      (bankRows ?? []).map((b) => [String(b.iban), b]),
    );
    const gesIds = [
      ...new Set(
        (bankRows ?? [])
          .map((b) => String(b.gesellschaft_id))
          .filter(Boolean),
      ),
    ];
    const { data: gesRows } = gesIds.length
      ? await admin
          .from("gesellschaften")
          .select("id, name, kuerzel")
          .in("id", gesIds)
      : { data: [] as Array<{ id: string; name: string; kuerzel: string }> };
    const gesById = new Map(
      (gesRows ?? []).map((g) => [String(g.id), g]),
    );

    const kontenByKunde = new Map<string, EbicsKundeStatusDto["konten"]>();
    for (const k of kontenRows ?? []) {
      const iban = String(k.iban);
      const bank = bankByIban.get(iban);
      const gesId = bank ? String(bank.gesellschaft_id) : "";
      const ges = gesId ? gesById.get(gesId) : undefined;
      const kundeId = String(k.ebics_kunde_id);
      const liste = kontenByKunde.get(kundeId) ?? [];
      liste.push({
        iban: ibanFormatiert(iban),
        bezeichnung: (bank?.bezeichnung as string | null) ?? null,
        gesellschaftId: gesId,
        gesellschaftKuerzel: ges ? String(ges.kuerzel) : "—",
        gesellschaftName: ges ? String(ges.name) : "—",
      });
      kontenByKunde.set(kundeId, liste);
    }
    for (const [, liste] of kontenByKunde) {
      liste.sort((a, b) =>
        a.gesellschaftKuerzel.localeCompare(b.gesellschaftKuerzel, "de"),
      );
    }

    const items: EbicsKundeStatusDto[] = (rows ?? []).map((r) => {
      const id = String(r.id);
      const konten = kontenByKunde.get(id) ?? [];
      return {
        id,
        partnerId: partnerById.get(id) ?? "",
        gesellschaftId: String(r.gesellschaft_id),
        gesellschaftName: String(r.gesellschaft_name),
        gesellschaftKuerzel: String(r.gesellschaft_kuerzel),
        status: String(r.status),
        anzahlKonten: konten.length || Number(r.anzahl_konten) || 0,
        hatSchluessel: Boolean(r.hat_schluessel),
        letzterFehler: (r.letzter_fehler as string | null) ?? null,
        initialisiertAm: (r.initialisiert_am as string | null) ?? null,
        bereitAm: (r.bereit_am as string | null) ?? null,
        konten,
      };
    });
    return { items };
  });

export const ebicsInitialisierenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();
    const { ebicsInitialisiereKunde } = await import("@/lib/ebics/client");
    const kunden = await loadEbicsKunden(admin);
    const briefe: Array<{
      gesellschaftId: string;
      gesellschaftName: string;
      iniLetterHtml: string;
    }> = [];
    const fehler: Array<{ gesellschaftId: string; meldung: string }> = [];

    for (const kunde of kunden) {
      // Nicht erneut INI/HIA senden — Schlüssel bleiben gültig für die Bank
      if (kunde.status === "bereit" || kunde.status === "wartet_auf_bank") {
        continue;
      }
      try {
        const { iniLetterHtml } = await ebicsInitialisiereKunde(admin, kunde);
        const { data: g } = await admin
          .from("gesellschaften")
          .select("name")
          .eq("id", kunde.gesellschaft_id)
          .maybeSingle();
        briefe.push({
          gesellschaftId: kunde.gesellschaft_id,
          gesellschaftName: (g?.name as string) ?? kunde.gesellschaft_id,
          iniLetterHtml,
        });
      } catch (err) {
        fehler.push({
          gesellschaftId: kunde.gesellschaft_id,
          meldung: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (briefe.length === 0 && fehler.length > 0) {
      throw new Error(
        fehler.map((f) => `${f.gesellschaftId}: ${f.meldung}`).join(" · "),
      );
    }

    return {
      anzahl: briefe.length,
      briefe,
      fehler,
      hinweis:
        "INI-Briefe ausdrucken, unterschreiben und an die Bank senden. Danach „Freischaltung“.",
    };
  });

/** INI-Briefe erneut aus gespeicherten Schlüsseln (ohne Bank-Kontakt). */
export const ebicsIniBriefeHolenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();
    const { ebicsIniBriefErzeugen } = await import("@/lib/ebics/client");
    const kunden = await loadEbicsKunden(admin);
    const briefe: Array<{
      gesellschaftId: string;
      gesellschaftName: string;
      iniLetterHtml: string;
    }> = [];
    const fehler: Array<{ gesellschaftId: string; meldung: string }> = [];

    for (const kunde of kunden) {
      if (kunde.status === "nicht_initialisiert") {
        fehler.push({
          gesellschaftId: kunde.gesellschaft_id,
          meldung: "Noch nicht initialisiert.",
        });
        continue;
      }
      try {
        const { iniLetterHtml } = await ebicsIniBriefErzeugen(admin, kunde);
        const { data: g } = await admin
          .from("gesellschaften")
          .select("name")
          .eq("id", kunde.gesellschaft_id)
          .maybeSingle();
        briefe.push({
          gesellschaftId: kunde.gesellschaft_id,
          gesellschaftName: (g?.name as string) ?? kunde.gesellschaft_id,
          iniLetterHtml,
        });
      } catch (err) {
        fehler.push({
          gesellschaftId: kunde.gesellschaft_id,
          meldung: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (briefe.length === 0) {
      throw new Error(
        fehler.length
          ? fehler.map((f) => `${f.gesellschaftId}: ${f.meldung}`).join(" · ")
          : "Keine INI-Briefe vorhanden.",
      );
    }

    return { anzahl: briefe.length, briefe, fehler };
  });

export const ebicsBankFreischaltungPruefenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();
    const { ebicsBankSchluesselHolen } = await import("@/lib/ebics/client");
    const kunden = await loadEbicsKunden(admin);
    const ergebnisse: Array<{
      gesellschaftId: string;
      status: "bereit" | "fehler" | "skip";
      meldung?: string;
    }> = [];

    const nochNichtInit = kunden.filter(
      (k) => k.status === "nicht_initialisiert",
    );
    if (nochNichtInit.length === kunden.length && kunden.length > 0) {
      throw new Error(
        "Noch nicht initialisiert. Zuerst „Initialisieren“, INI-Briefe an die Bank, danach „Freischaltung“.",
      );
    }

    for (const kunde of kunden) {
      if (kunde.status === "bereit") {
        ergebnisse.push({
          gesellschaftId: kunde.gesellschaft_id,
          status: "bereit",
        });
        continue;
      }
      if (kunde.status === "nicht_initialisiert") {
        ergebnisse.push({
          gesellschaftId: kunde.gesellschaft_id,
          status: "fehler",
          meldung: "Zuerst Initialisieren",
        });
        continue;
      }
      try {
        await ebicsBankSchluesselHolen(admin, kunde);
        ergebnisse.push({
          gesellschaftId: kunde.gesellschaft_id,
          status: "bereit",
        });
      } catch (err) {
        ergebnisse.push({
          gesellschaftId: kunde.gesellschaft_id,
          status: "fehler",
          meldung: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { ergebnisse };
  });

/** Umsätze aller bereiten Zugänge jetzt abrufen (wie der tägliche Cron). */
export const ebicsUmsaetzeAbrufenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();
    const { syncEbicsAlleKonten } = await import("@/lib/ebics/sync");
    return syncEbicsAlleKonten(admin);
  });

/** Letzte Buchungen und Kontostände der Konten von Grenz & Co. */
export const ebicsUmsaetzeLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }): Promise<EbicsUmsaetzeDto> => {
    await microsoftCallerAusJwt(asToken(data));
    const admin = createServiceRoleClient();

    const { data: konten, error: kontenErr } = await admin
      .from("bankkonten")
      .select("iban, bezeichnung")
      .eq("gesellschaft_id", GRENZ_GESELLSCHAFT_ID)
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

    const { data: buchungen, error: buchungenErr } = ibans.length
      ? await admin
          .from("bankbuchungen")
          .select(
            "id, konto_iban, buchungsdatum, betrag, auftraggeber_name, verwendungszweck",
          )
          .in("konto_iban", ibans)
          .order("buchungsdatum", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [], error: null };
    if (buchungenErr) throw new Error(buchungenErr.message);

    return {
      konten: (konten ?? []).map((k) => {
        const iban = String(k.iban);
        const saldo = letzterSaldo.get(iban);
        return {
          iban: ibanFormatiert(iban),
          bezeichnung: (k.bezeichnung as string | null) ?? null,
          saldo: saldo?.saldo ?? null,
          saldoStichtag: saldo?.stichtag ?? null,
        };
      }),
      buchungen: (buchungen ?? []).map((b) => ({
        id: String(b.id),
        kontoIban: ibanFormatiert(String(b.konto_iban)),
        buchungsdatum: String(b.buchungsdatum),
        betrag: Number(b.betrag),
        auftraggeberName: (b.auftraggeber_name as string | null) ?? null,
        verwendungszweck: (b.verwendungszweck as string | null) ?? null,
      })),
    };
  });
