/**
 * Rechnungshistorie: an DATEV gesendete Rechnungen bleiben 30 Tage gespeichert —
 * für die Board-Spalte „An DATEV“ und die Dublettenprüfung. Server-only.
 *
 * Zusätzlich: Ordner „Gesendet“ — gleicher Anhangsname schon an ein DATEV-Postfach.
 */
import type { DokumentAnalyseFelder } from "@/lib/dokument-ai";
import { microsoftDokumentPosteingangQuellen } from "@/lib/microsoft/ablage";
import {
  graphGesendeteAnhaenge,
  type GraphGesendeterAnhang,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

import { baueAblageDateiname } from "./dateiname";
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

/** Kurzer Cache, damit Batch-Analysen Graph nicht pro Rechnung neu abfragen. */
const GESENDET_CACHE_TTL_MS = 5 * 60 * 1000;

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

type GesendetCache = {
  geladenAm: number;
  anhaenge: GraphGesendeterAnhang[];
};

let gesendetCache: GesendetCache | null = null;

/** Großbuchstaben ohne Trenn-/Leerzeichen — „RE-2024/17“ und „re 202417“ sind gleich. */
export function normalisiereRechnungsnummer(
  raw: string | null | undefined,
): string | null {
  const norm = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return norm.length >= MIN_NUMMER_LAENGE ? norm : null;
}

function normalisiereAnhangName(raw: string | null | undefined): string | null {
  const norm = (raw ?? "").trim().toLowerCase();
  return norm.length > 0 ? norm : null;
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
    // Cache invalidieren — frisch versendeter Anhang muss sofort treffbar sein.
    gesendetCache = null;
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

async function ladeDatevEmpfaenger(): Promise<string[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("v_gesellschaften")
    .select("datev_postfach");

  if (error) {
    throw new Error(
      `DATEV-Postfächer konnten nicht geladen werden: ${error.message}`,
    );
  }

  const set = new Set<string>();
  for (const row of data ?? []) {
    const mail = String(
      (row as { datev_postfach?: string | null }).datev_postfach ?? "",
    )
      .trim()
      .toLowerCase();
    if (mail) set.add(mail);
  }
  return [...set];
}

async function ladeGesendeteDatevAnhaenge(): Promise<GraphGesendeterAnhang[]> {
  const jetzt = Date.now();
  if (
    gesendetCache &&
    jetzt - gesendetCache.geladenAm < GESENDET_CACHE_TTL_MS
  ) {
    return gesendetCache.anhaenge;
  }

  const empfaenger = await ladeDatevEmpfaenger();
  if (empfaenger.length === 0) {
    gesendetCache = { geladenAm: jetzt, anhaenge: [] };
    return [];
  }

  const { accessToken } = await microsoftAccessToken();
  const seit = grenzeIso();
  const postfaecher = microsoftDokumentPosteingangQuellen().map(
    (q) => q.postfach,
  );

  const bloecke = await Promise.all(
    postfaecher.map((postfach) =>
      graphGesendeteAnhaenge(accessToken, postfach, {
        seit,
        empfaenger,
      }).catch((err) => {
        console.error(
          "[rechnung-historie] Gesendet-Ordner konnte nicht gelesen werden",
          postfach,
          err,
        );
        return [] as GraphGesendeterAnhang[];
      }),
    ),
  );

  const anhaenge = bloecke.flat();
  gesendetCache = { geladenAm: jetzt, anhaenge };
  return anhaenge;
}

function kandidatenAnhangNamen(input: {
  anhangName: string | null | undefined;
  ablageDateiname: string | null | undefined;
  betreff: string | null | undefined;
  felder: DokumentAnalyseFelder | null | undefined;
}): string[] {
  // Nur der DATEV-Ablagename — der wird tatsächlich versendet (nicht der
  // oft generische Originalname wie „Rechnung.pdf“).
  const ablage =
    input.ablageDateiname?.trim() ||
    (input.felder
      ? baueAblageDateiname({
          felder: input.felder,
          dokumentTyp: "rechnung",
          originalName: input.anhangName,
          betreff: input.betreff,
        })
      : null);
  const norm = normalisiereAnhangName(ablage);
  return norm ? [norm] : [];
}

/**
 * Kam die Rechnungsnummer in den letzten 30 Tagen schon vor — bereits an DATEV
 * gesendet oder noch offen auf dem Board? Zusätzlich: gleicher Anhangsname
 * schon an ein DATEV-Postfach im Ordner „Gesendet“.
 */
export async function pruefeRechnungsDuplikat(input: {
  rechnungsnummer: string | null | undefined;
  /** Eigener Eintrag, wird nicht als Treffer gewertet. */
  eintragId: string;
  anhangName?: string | null;
  ablageDateiname?: string | null;
  betreff?: string | null;
  felder?: DokumentAnalyseFelder | null;
}): Promise<RechnungDuplikatHinweis | null> {
  const nummer = input.rechnungsnummer?.trim() || null;
  const norm = normalisiereRechnungsnummer(nummer);
  const treffer: RechnungDuplikatTreffer[] = [];

  if (nummer && norm) {
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

    for (const row of (data as unknown as RechnungHistorieRow[]) ?? []) {
      treffer.push({
        quelle: "datev",
        rechnungsnummer: row.rechnungsnummer ?? nummer,
        rechnungssteller: row.rechnungssteller,
        rechnungsbetrag: row.rechnungsbetrag,
        waehrung: row.waehrung,
        datum: row.an_datev_am,
      });
    }

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
  }

  const namen = kandidatenAnhangNamen({
    anhangName: input.anhangName,
    ablageDateiname: input.ablageDateiname,
    betreff: input.betreff,
    felder: input.felder,
  });

  if (namen.length > 0) {
    const gesendet = await ladeGesendeteDatevAnhaenge();
    const gesehen = new Set<string>();
    for (const a of gesendet) {
      const anhangNorm = normalisiereAnhangName(a.anhangName);
      if (!anhangNorm || !namen.includes(anhangNorm)) continue;
      const key = `${anhangNorm}|${a.gesendetAm}|${a.empfaenger.join(",")}`;
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      treffer.push({
        quelle: "gesendet",
        rechnungsnummer: nummer ?? a.anhangName,
        rechnungssteller: null,
        rechnungsbetrag: null,
        waehrung: null,
        datum: a.gesendetAm,
        anhangName: a.anhangName,
      });
    }
  }

  if (treffer.length === 0) return null;

  return {
    rechnungsnummer: nummer ?? treffer[0]?.anhangName ?? "unbekannt",
    geprueftAm: new Date().toISOString(),
    treffer,
  };
}
