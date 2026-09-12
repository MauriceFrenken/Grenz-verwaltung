/**
 * Rechnungshistorie: an DATEV gesendete Rechnungen bleiben 30 Tage gespeichert —
 * für die Board-Spalte „An DATEV“ und die Dublettenprüfung. Server-only.
 */
import type { DokumentAnalyseFelder } from "@/lib/dokument-ai";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

import { leseRechnungsfreigabe } from "./store";
import {
  RECHNUNG_HISTORIE_TAGE,
  type RechnungDuplikatHinweis,
  type RechnungDuplikatTreffer,
  type RechnungHistorieEintrag,
} from "./typen";

const TABELLE = "rechnung_historie";

const SPALTEN =
  "id,rechnungsnummer,rechnungsnummer_norm,rechnungssteller,rechnungsbetrag," +
  "waehrung,rechnungsdatum,gesellschaft_name,betreff,anhang_name," +
  "ablage_dateiname,an_datev_am";

/** Kürzere Nummern („12“, „RE“) erzeugen zu viele Fehltreffer. */
const MIN_NUMMER_LAENGE = 3;

type RechnungHistorieRow = {
  id: string;
  rechnungsnummer: string | null;
  rechnungsnummer_norm: string | null;
  rechnungssteller: string | null;
  rechnungsbetrag: string | null;
  waehrung: string | null;
  rechnungsdatum: string | null;
  gesellschaft_name: string | null;
  betreff: string | null;
  anhang_name: string | null;
  ablage_dateiname: string | null;
  an_datev_am: string;
};

/** Großbuchstaben ohne Trenn-/Leerzeichen — „RE-2024/17“ und „re 202417“ sind gleich. */
export function normalisiereRechnungsnummer(
  raw: string | null | undefined,
): string | null {
  const norm = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return norm.length >= MIN_NUMMER_LAENGE ? norm : null;
}

function grenzeIso(): string {
  return new Date(
    Date.now() - RECHNUNG_HISTORIE_TAGE * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function zuHistorieEintrag(row: RechnungHistorieRow): RechnungHistorieEintrag {
  return {
    id: row.id,
    rechnungsnummer: row.rechnungsnummer,
    rechnungssteller: row.rechnungssteller,
    rechnungsbetrag: row.rechnungsbetrag,
    waehrung: row.waehrung,
    rechnungsdatum: row.rechnungsdatum,
    gesellschaftName: row.gesellschaft_name,
    betreff: row.betreff,
    anhangName: row.anhang_name,
    ablageDateiname: row.ablage_dateiname,
    anDatevAm: row.an_datev_am,
  };
}

function feldText(
  felder: DokumentAnalyseFelder | null | undefined,
  id: keyof DokumentAnalyseFelder,
): string | null {
  return felder?.[id]?.value?.trim() || null;
}

/**
 * Nach erfolgreichem DATEV-Versand speichern. Fehler werden nur protokolliert —
 * die Rechnung ist zu diesem Zeitpunkt bereits verschickt.
 */
export async function merkeRechnungInHistorie(input: {
  eintragId: string;
  felder: DokumentAnalyseFelder | null;
  gesellschaftId: string | null;
  gesellschaftName: string | null;
  betreff: string | null;
  anhangName: string | null;
  ablageDateiname: string | null;
  ordnerPfad: string | null;
}): Promise<RechnungHistorieEintrag | null> {
  const rechnungsnummer = feldText(input.felder, "rechnungsnummer");

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from(TABELLE)
      .upsert(
        {
          rechnungsnummer,
          rechnungsnummer_norm: normalisiereRechnungsnummer(rechnungsnummer),
          rechnungssteller: feldText(input.felder, "rechnungssteller"),
          rechnungsbetrag: feldText(input.felder, "rechnungsbetrag"),
          waehrung: feldText(input.felder, "waehrung"),
          rechnungsdatum: feldText(input.felder, "rechnungsdatum"),
          gesellschaft_id: input.gesellschaftId,
          gesellschaft_name:
            input.gesellschaftName?.trim() ||
            feldText(input.felder, "gesellschaftName"),
          betreff: input.betreff,
          anhang_name: input.anhangName,
          ablage_dateiname: input.ablageDateiname,
          ordner_pfad: input.ordnerPfad,
          quelle_eintrag_id: input.eintragId,
          an_datev_am: new Date().toISOString(),
        },
        { onConflict: "quelle_eintrag_id" },
      )
      .select(SPALTEN)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data
      ? zuHistorieEintrag(data as unknown as RechnungHistorieRow)
      : null;
  } catch (err) {
    console.error(
      "[rechnung-historie] Rechnung konnte nicht gemerkt werden",
      input.eintragId,
      err,
    );
    return null;
  }
}

export async function leseRechnungsHistorie(): Promise<
  RechnungHistorieEintrag[]
> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .gte("an_datev_am", grenzeIso())
    .order("an_datev_am", { ascending: false });

  if (error) {
    throw new Error(
      `Rechnungshistorie konnte nicht geladen werden: ${error.message}`,
    );
  }
  return ((data as unknown as RechnungHistorieRow[]) ?? []).map(
    zuHistorieEintrag,
  );
}

/** Einträge älter als 30 Tage entfernen — täglich im Nachtlauf. */
export async function loescheAlteRechnungsHistorie(): Promise<number> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .delete()
    .lt("an_datev_am", grenzeIso())
    .select("id");

  if (error) {
    throw new Error(
      `Rechnungshistorie konnte nicht aufgeräumt werden: ${error.message}`,
    );
  }
  return data?.length ?? 0;
}

/**
 * Kam die Rechnungsnummer in den letzten 30 Tagen schon vor — bereits an DATEV
 * gesendet oder noch offen auf dem Board?
 */
export async function pruefeRechnungsDuplikat(input: {
  rechnungsnummer: string | null | undefined;
  /** Eigener Eintrag, wird nicht als Treffer gewertet. */
  eintragId: string;
}): Promise<RechnungDuplikatHinweis | null> {
  const nummer = input.rechnungsnummer?.trim();
  const norm = normalisiereRechnungsnummer(nummer);
  if (!nummer || !norm) return null;

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .eq("rechnungsnummer_norm", norm)
    .gte("an_datev_am", grenzeIso())
    .order("an_datev_am", { ascending: false });

  if (error) {
    throw new Error(`Dublettenprüfung fehlgeschlagen: ${error.message}`);
  }

  const treffer: RechnungDuplikatTreffer[] = (
    (data as unknown as RechnungHistorieRow[]) ?? []
  ).map((row) => ({
    quelle: "datev" as const,
    rechnungsnummer: row.rechnungsnummer ?? nummer,
    rechnungssteller: row.rechnungssteller,
    rechnungsbetrag: row.rechnungsbetrag,
    waehrung: row.waehrung,
    datum: row.an_datev_am,
  }));

  for (const row of await leseRechnungsfreigabe()) {
    if (row.id === input.eintragId) continue;
    if (row.status === "gebucht" || row.freigabe_status === "erledigt")
      continue;
    const andere = row.felder?.rechnungsnummer?.value?.trim();
    if (!andere || normalisiereRechnungsnummer(andere) !== norm) continue;
    treffer.push({
      quelle: "offen",
      rechnungsnummer: andere,
      rechnungssteller: row.felder?.rechnungssteller?.value?.trim() || null,
      rechnungsbetrag: row.felder?.rechnungsbetrag?.value?.trim() || null,
      waehrung: row.felder?.waehrung?.value?.trim() || null,
      datum: row.eingegangen_am,
    });
  }

  if (treffer.length === 0) return null;

  return {
    rechnungsnummer: nummer,
    geprueftAm: new Date().toISOString(),
    treffer,
  };
}
