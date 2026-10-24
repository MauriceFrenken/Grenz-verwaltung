/** Serverseitig: Mandatsdaten aus den sf_*-Caches lesen (nur lesen, Salesforce ist führend). */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AktivitaetZeile,
  DealZeile,
  KampagneZeile,
  MitgliedZeile,
  ReportKennzahlen,
} from "./report";

const SEITE = 1000;

/** Liest alle Zeilen einer Abfrage seitenweise (PostgREST liefert höchstens 1000 je Aufruf). */
async function alleZeilen<T>(
  abfrage: (
    von: number,
    bis: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const alle: T[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await abfrage(von, von + SEITE - 1);
    if (error) throw new Error(error.message);
    alle.push(...(data ?? []));
    if (!data || data.length < SEITE) return alle;
  }
}

export type MandatListenEintrag = {
  sfId: string;
  name: string;
  status: string | null;
  art: string | null;
  angebotspreis: number | null;
  provisionProzent: number | null;
  beauftragtAm: string | null;
  objekt: string | null;
  objektart: string | null;
  ort: string | null;
  kampagnen: number;
  letzterReport: string | null;
  sfGeaendertAm: string | null;
};

export async function ladeMandatsliste(
  admin: SupabaseClient,
): Promise<MandatListenEintrag[]> {
  const mandate = await alleZeilen<Record<string, unknown>>((a, b) =>
    admin
      .from("sf_mandate")
      .select(
        "sf_id, name, status, art, angebotspreis, provision_prozent, beauftragt_am, real_estate_sf_id, sf_geaendert_am",
      )
      .order("sf_geaendert_am", { ascending: false, nullsFirst: false })
      .range(a, b),
  );
  const [objekte, kampagnen, reports] = await Promise.all([
    alleZeilen<Record<string, unknown>>((a, b) =>
      admin
        .from("sf_real_estate")
        .select("sf_id, name, objektart, ort")
        .range(a, b),
    ),
    alleZeilen<Record<string, unknown>>((a, b) =>
      admin
        .from("sf_kampagnen")
        .select("mandat_sf_id")
        .not("mandat_sf_id", "is", null)
        .range(a, b),
    ),
    alleZeilen<Record<string, unknown>>((a, b) =>
      admin
        .from("eigentuemer_reports")
        .select("mandat_sf_id, created_at")
        .order("created_at", { ascending: false })
        .range(a, b),
    ),
  ]);
  const objektJeId = new Map(objekte.map((o) => [String(o.sf_id), o]));
  const kampagnenJeMandat = new Map<string, number>();
  for (const k of kampagnen)
    kampagnenJeMandat.set(
      String(k.mandat_sf_id),
      (kampagnenJeMandat.get(String(k.mandat_sf_id)) ?? 0) + 1,
    );
  const letzterReport = new Map<string, string>();
  for (const r of reports)
    if (!letzterReport.has(String(r.mandat_sf_id)))
      letzterReport.set(String(r.mandat_sf_id), String(r.created_at));

  return mandate.map((m) => {
    const o = m.real_estate_sf_id
      ? objektJeId.get(String(m.real_estate_sf_id))
      : undefined;
    return {
      sfId: String(m.sf_id),
      name: String(m.name),
      status: (m.status as string) ?? null,
      art: (m.art as string) ?? null,
      angebotspreis: m.angebotspreis == null ? null : Number(m.angebotspreis),
      provisionProzent:
        m.provision_prozent == null ? null : Number(m.provision_prozent),
      beauftragtAm: (m.beauftragt_am as string) ?? null,
      objekt: (o?.name as string) ?? null,
      objektart: (o?.objektart as string) ?? null,
      ort: (o?.ort as string) ?? null,
      kampagnen: kampagnenJeMandat.get(String(m.sf_id)) ?? 0,
      letzterReport: letzterReport.get(String(m.sf_id)) ?? null,
      sfGeaendertAm: (m.sf_geaendert_am as string) ?? null,
    };
  });
}

export type MandatRohdaten = {
  mandat: ReportKennzahlen["mandat"] & {
    art: string | null;
    provisionProzent: number | null;
    beauftragtAm: string | null;
    eigentuemerKontaktSfId: string | null;
    eigentuemerAccountSfId: string | null;
    eigentuemer: string | null;
    eigentuemerEmail: string | null;
  };
  objekt: Record<string, unknown> | null;
  kampagnen: KampagneZeile[];
  mitglieder: MitgliedZeile[];
  aktivitaeten: AktivitaetZeile[];
  deals: DealZeile[];
  namen: Map<string, string>;
};

export async function ladeMandatRohdaten(
  admin: SupabaseClient,
  sfId: string,
): Promise<MandatRohdaten> {
  const { data: m, error } = await admin
    .from("sf_mandate")
    .select("*")
    .eq("sf_id", sfId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!m)
    throw new Error(
      "Mandat nicht gefunden. Bitte den Salesforce-Sync ausführen.",
    );

  const objekt = m.real_estate_sf_id
    ? ((
        await admin
          .from("sf_real_estate")
          .select("*")
          .eq("sf_id", m.real_estate_sf_id)
          .maybeSingle()
      ).data ?? null)
    : null;

  const { data: kampagnen, error: ek } = await admin
    .from("sf_kampagnen")
    .select("sf_id, name, typ, status, start_am, anzahl_mitglieder")
    .eq("mandat_sf_id", sfId)
    .order("start_am", { ascending: true, nullsFirst: false });
  if (ek) throw new Error(ek.message);
  const kampagnenIds = (kampagnen ?? []).map((k) => k.sf_id as string);

  const [mitglieder, aktivitaetenMandat, aktivitaetenKampagne, deals] =
    await Promise.all([
      kampagnenIds.length
        ? alleZeilen<MitgliedZeile>((a, b) =>
            admin
              .from("sf_kampagnen_mitglieder")
              .select(
                "sf_id, kampagne_sf_id, kontakt_sf_id, status, geantwortet, erstmals_geantwortet_am, sf_daten",
              )
              .in("kampagne_sf_id", kampagnenIds)
              .order("sf_id")
              .range(a, b),
          )
        : Promise.resolve([]),
      alleZeilen<AktivitaetZeile>((a, b) =>
        admin
          .from("sf_aktivitaeten")
          .select(
            "sf_id, sf_typ, art, betreff, datum, status, who_sf_id, kampagne_sf_id, sf_daten",
          )
          .eq("mandat_sf_id", sfId)
          .order("sf_id")
          .range(a, b),
      ),
      kampagnenIds.length
        ? alleZeilen<AktivitaetZeile>((a, b) =>
            admin
              .from("sf_aktivitaeten")
              .select(
                "sf_id, sf_typ, art, betreff, datum, status, who_sf_id, kampagne_sf_id, sf_daten",
              )
              .in("kampagne_sf_id", kampagnenIds)
              .order("sf_id")
              .range(a, b),
          )
        : Promise.resolve([]),
      alleZeilen<DealZeile>((a, b) =>
        admin
          .from("sf_deals")
          .select(
            "sf_id, name, phase, betrag, abschluss_am, kontakt_sf_id, account_sf_id, sf_daten",
          )
          .eq("mandat_sf_id", sfId)
          .order("sf_id")
          .range(a, b),
      ),
    ]);

  const aktivitaeten = [
    ...new Map(
      [...aktivitaetenMandat, ...aktivitaetenKampagne].map((a) => [a.sf_id, a]),
    ).values(),
  ];

  const kontaktIds = new Set<string>();
  for (const x of mitglieder)
    if (x.kontakt_sf_id) kontaktIds.add(x.kontakt_sf_id);
  for (const d of deals) {
    if (d.kontakt_sf_id) kontaktIds.add(d.kontakt_sf_id);
    if (d.account_sf_id) kontaktIds.add(d.account_sf_id);
  }
  for (const id of [m.eigentuemer_kontakt_sf_id, m.eigentuemer_account_sf_id])
    if (id) kontaktIds.add(id as string);
  const namen = new Map<string, string>();
  const emails = new Map<string, string>();
  const ids = [...kontaktIds];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error: en } = await admin
      .from("sf_kontakte")
      .select("sf_id, name, firma, email")
      .in("sf_id", ids.slice(i, i + 300));
    if (en) throw new Error(en.message);
    for (const k of data ?? []) {
      namen.set(
        k.sf_id as string,
        k.firma ? `${k.name} (${k.firma})` : (k.name as string),
      );
      if (k.email) emails.set(k.sf_id as string, k.email as string);
    }
  }

  const adresse = objekt
    ? [objekt.strasse, [objekt.plz, objekt.ort].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ") || null
    : null;
  const eigentuemerId = (m.eigentuemer_kontakt_sf_id ??
    m.eigentuemer_account_sf_id) as string | null;

  return {
    mandat: {
      sfId,
      name: m.name as string,
      status: (m.status as string) ?? null,
      angebotspreis: m.angebotspreis == null ? null : Number(m.angebotspreis),
      objekt: (objekt?.name as string) ?? null,
      adresse,
      art: (m.art as string) ?? null,
      provisionProzent:
        m.provision_prozent == null ? null : Number(m.provision_prozent),
      beauftragtAm: (m.beauftragt_am as string) ?? null,
      eigentuemerKontaktSfId: (m.eigentuemer_kontakt_sf_id as string) ?? null,
      eigentuemerAccountSfId: (m.eigentuemer_account_sf_id as string) ?? null,
      eigentuemer: eigentuemerId ? (namen.get(eigentuemerId) ?? null) : null,
      eigentuemerEmail: m.eigentuemer_kontakt_sf_id
        ? (emails.get(m.eigentuemer_kontakt_sf_id as string) ?? null)
        : null,
    },
    objekt,
    kampagnen: (kampagnen ?? []) as KampagneZeile[],
    mitglieder,
    aktivitaeten,
    deals: deals.map((d) => ({
      ...d,
      betrag: d.betrag == null ? null : Number(d.betrag),
    })),
    namen,
  };
}
