/**
 * Server-Funktionen Käufer-Matching (Masterplan 4.2).
 * Treffer kommen nur aus den Ankaufsprofilen in Salesforce; der Recherche-Pool wird getrennt
 * gezeigt. Eine Kampagne mit Mitgliedern entsteht erst nach Bestätigung in der UI.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";
import { GRENZ_DEAL_RECORD_TYPE } from "@/lib/sf-sync/config";
import { mitSfZugangOderSitzung, sfSitzungAus } from "@/lib/sf-sync/zugang";

import {
  rangliste,
  type MatchErgebnis,
  type ObjektMerkmale,
  type ProfilZeile,
} from "./score";
import {
  historieTreffer,
  marktPassung,
  type HistorieTreffer,
  type InteresseEreignis,
  type MandatKurz,
  type MarktTreffer,
  type RadarKaeufer,
} from "./zusatz";

const KLASSEN = ["Core", "Core+", "Value Add", "Opportunistic", "Development"];

function text(wert: unknown, max = 200): string {
  return typeof wert === "string" ? wert.slice(0, max) : "";
}

export type MatchTreffer = MatchErgebnis & {
  profilName: string | null;
  investorTyp: string | null;
  kontaktSfId: string | null;
  kontaktName: string | null;
  firma: string | null;
  email: string | null;
  /** Kontakt ist schon Mitglied einer Kampagne dieses Mandats. */
  bereitsAngesprochen: boolean;
  /** Bisherige Reaktionen bei Grenz: Interessenten-Deals und Rückmeldungen auf Kampagnen. */
  reaktionen: { deals: number; rueckmeldungen: number };
  /** Status laut Investorendatenbank (aktiv, ruhend, kein_interesse); null bei Rohprofilen. */
  investorStatus: string | null;
  prioritaet: string | null;
};

export type RechercheTreffer = {
  id: string;
  name: string;
  firma: string | null;
  ort: string | null;
  quelle: string;
};

export type HistorieZeile = HistorieTreffer & {
  kontaktName: string | null;
  firma: string | null;
  email: string | null;
  /** Kontakt (003…) für die Kampagne; Accounts lassen sich nicht direkt hinzufügen. */
  waehlbar: boolean;
  hatAnkaufsprofil: boolean;
  bereitsAngesprochen: boolean;
};

export type MatchingDto = {
  objekt: ObjektMerkmale & { name: string };
  treffer: MatchTreffer[];
  profileGesamt: number;
  /** Investoren aus den Listen (noch nicht in Salesforce), ohne Ausschlüsse, Abdeckung ab 50 %. */
  listen: ListenVermarktungsTreffer[];
  listenGesamt: number;
  /** Woher die Profile kommen: bereinigte Investorendatenbank oder Salesforce-Rohprofile. */
  profilQuelle: "investoren" | "ankaufsprofile";
  /** Interne Datenbank: Interessenten ähnlicher Grenz-Mandate ohne passendes Profil. */
  historie: HistorieZeile[];
  /** Externe, gerade aktive Käufer aus dem Markt-Radar. */
  markt: MarktTreffer[];
  recherche: RechercheTreffer[];
  klassen: string[];
};

/** Reaktionen auf frühere Mandate: Kampagnen-Rückmeldungen außer Absage und Interessenten-Deals. */
async function interesseEreignisse(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<InteresseEreignis[]> {
  const [kampagnen, mitglieder, deals] = await Promise.all([
    alle<{ sf_id: string; mandat_sf_id: string | null }>((a, b) =>
      admin
        .from("sf_kampagnen")
        .select("sf_id, mandat_sf_id")
        .not("mandat_sf_id", "is", null)
        .order("sf_id")
        .range(a, b),
    ),
    alle<{
      kampagne_sf_id: string;
      kontakt_sf_id: string | null;
      status: string | null;
      erstmals_geantwortet_am: string | null;
    }>((a, b) =>
      admin
        .from("sf_kampagnen_mitglieder")
        .select(
          "kampagne_sf_id, kontakt_sf_id, status, erstmals_geantwortet_am",
        )
        .eq("geantwortet", true)
        .order("sf_id")
        .range(a, b),
    ),
    alle<{
      mandat_sf_id: string | null;
      kontakt_sf_id: string | null;
      account_sf_id: string | null;
      phase: string | null;
      abschluss_am: string | null;
    }>((a, b) =>
      admin
        .from("sf_deals")
        .select(
          "mandat_sf_id, kontakt_sf_id, account_sf_id, phase, abschluss_am",
        )
        .eq("record_type", GRENZ_DEAL_RECORD_TYPE)
        .not("mandat_sf_id", "is", null)
        .order("sf_id")
        .range(a, b),
    ),
  ]);
  const mandatJeKampagne = new Map(
    kampagnen.map((k) => [k.sf_id, k.mandat_sf_id!]),
  );
  const ereignisse: InteresseEreignis[] = [];
  for (const m of mitglieder) {
    const mandat = mandatJeKampagne.get(m.kampagne_sf_id);
    if (!mandat || !m.kontakt_sf_id || /absage/i.test(m.status ?? "")) continue;
    ereignisse.push({
      kontaktSfId: m.kontakt_sf_id,
      mandatSfId: mandat,
      stufe: m.status ?? "Rückmeldung",
      datum: m.erstmals_geantwortet_am,
    });
  }
  for (const d of deals) {
    const kontakt = d.kontakt_sf_id ?? d.account_sf_id;
    if (!kontakt || /closed lost/i.test(d.phase ?? "")) continue;
    ereignisse.push({
      kontaktSfId: kontakt,
      mandatSfId: d.mandat_sf_id!,
      stufe: d.phase ?? "Deal",
      datum: d.abschluss_am,
    });
  }
  return ereignisse;
}

async function mandateKurz(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<Map<string, MandatKurz>> {
  const [mandate, objekte] = await Promise.all([
    alle<{
      sf_id: string;
      name: string;
      real_estate_sf_id: string | null;
      angebotspreis: number | null;
    }>((a, b) =>
      admin
        .from("sf_mandate")
        .select("sf_id, name, real_estate_sf_id, angebotspreis")
        .order("sf_id")
        .range(a, b),
    ),
    alle<{
      sf_id: string;
      name: string;
      objektart: string | null;
      ort: string | null;
    }>((a, b) =>
      admin
        .from("sf_real_estate")
        .select("sf_id, name, objektart, ort")
        .order("sf_id")
        .range(a, b),
    ),
  ]);
  const objektJeId = new Map(objekte.map((o) => [o.sf_id, o]));
  return new Map(
    mandate.map((m) => {
      const o = m.real_estate_sf_id
        ? objektJeId.get(m.real_estate_sf_id)
        : undefined;
      return [
        m.sf_id,
        {
          sfId: m.sf_id,
          name: o?.name ?? m.name,
          objektart: o?.objektart ?? null,
          ort: o?.ort ?? null,
          preis: m.angebotspreis ? Number(m.angebotspreis) : null,
        },
      ];
    }),
  );
}

/** Aktive Käufer aus dem Markt-Radar der letzten 180 Tage, außer verworfenen. */
async function radarKaeuferLaden(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<RadarKaeufer[]> {
  const ab = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("markt_radar_meldungen")
    .select(
      "id, akteur, akteur_typ, ereignis, objektart, ort, volumen_eur, ereignis_am, created_at, relevanz, quelle_url, quelle_titel, quelle_medium, sf_kontakt_sf_id, sf_bekannt_als, status",
    )
    .eq("seite", "kaeufer")
    .neq("status", "verworfen")
    .gte("created_at", ab)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []).map(
    (r): RadarKaeufer => ({
      id: String(r.id),
      akteur: String(r.akteur),
      akteurTyp: (r.akteur_typ as string) ?? null,
      ereignis: String(r.ereignis),
      objektart: (r.objektart as string) ?? null,
      ort: (r.ort as string) ?? null,
      volumenEur: r.volumen_eur != null ? Number(r.volumen_eur) : null,
      ereignisAm: (r.ereignis_am as string) ?? null,
      createdAt: String(r.created_at),
      relevanz: Number(r.relevanz) || 0,
      quelleUrl: String(r.quelle_url),
      quelleTitel: (r.quelle_titel as string) ?? null,
      quelleMedium: (r.quelle_medium as string) ?? null,
      sfKontaktSfId: (r.sf_kontakt_sf_id as string) ?? null,
      sfBekanntAls: (r.sf_bekannt_als as string) ?? null,
      status: String(r.status),
    }),
  );
}

/** Je Akteur die beste Passung zum Objekt, absteigend. */
function besteMarktTreffer(
  kaeufer: RadarKaeufer[],
  objekt: { objektart: string | null; orte: string[]; preis: number | null },
  max: number,
): MarktTreffer[] {
  const besteJeAkteur = new Map<string, MarktTreffer>();
  for (const k of kaeufer) {
    const t = marktPassung(k, objekt);
    const schluessel = k.akteur.toLowerCase();
    const bisher = besteJeAkteur.get(schluessel);
    if (!bisher || t.score > bisher.score) besteJeAkteur.set(schluessel, t);
  }
  return [...besteJeAkteur.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

async function marktKaeufer(
  admin: ReturnType<typeof createServiceRoleClient>,
  objekt: { objektart: string | null; orte: string[]; preis: number | null },
): Promise<MarktTreffer[]> {
  return besteMarktTreffer(await radarKaeuferLaden(admin), objekt, 60);
}

async function alle<T>(
  abfrage: (
    von: number,
    bis: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const ergebnis: T[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await abfrage(von, von + 999);
    if (error) throw new Error(error.message);
    ergebnis.push(...(data ?? []));
    if (!data || data.length < 1000) return ergebnis;
  }
}

/**
 * Wie oft hat der Investor eines Profils bei Grenz schon reagiert? Interessenten-Deals
 * (über Kontakt oder Account) und Rückmeldungen auf Kampagnen außer Absagen.
 */
async function reaktionenJeProfil(
  admin: ReturnType<typeof createServiceRoleClient>,
  profile: ProfilZeile[],
): Promise<Map<string, { deals: number; rueckmeldungen: number }>> {
  const [deals, antworten] = await Promise.all([
    alle<{ kontakt_sf_id: string | null; account_sf_id: string | null }>(
      (a, b) =>
        admin
          .from("sf_deals")
          .select("kontakt_sf_id, account_sf_id")
          .eq("record_type", GRENZ_DEAL_RECORD_TYPE)
          .order("sf_id")
          .range(a, b),
    ),
    alle<{ kontakt_sf_id: string | null; status: string | null }>((a, b) =>
      admin
        .from("sf_kampagnen_mitglieder")
        .select("kontakt_sf_id, status")
        .eq("geantwortet", true)
        .order("sf_id")
        .range(a, b),
    ),
  ]);
  const dealsJe = new Map<string, number>();
  for (const d of deals)
    for (const id of new Set([d.kontakt_sf_id, d.account_sf_id]))
      if (id) dealsJe.set(id, (dealsJe.get(id) ?? 0) + 1);
  const antwortenJe = new Map<string, number>();
  for (const x of antworten)
    if (x.kontakt_sf_id && (x.status ?? "").toLowerCase() !== "absage")
      antwortenJe.set(
        x.kontakt_sf_id,
        (antwortenJe.get(x.kontakt_sf_id) ?? 0) + 1,
      );
  const ergebnis = new Map<string, { deals: number; rueckmeldungen: number }>();
  for (const p of profile) {
    const deals = Math.max(
      p.kontakt_sf_id ? (dealsJe.get(p.kontakt_sf_id) ?? 0) : 0,
      p.account_sf_id ? (dealsJe.get(p.account_sf_id) ?? 0) : 0,
    );
    const rueckmeldungen = p.kontakt_sf_id
      ? (antwortenJe.get(p.kontakt_sf_id) ?? 0)
      : 0;
    if (deals || rueckmeldungen)
      ergebnis.set(p.sf_id, { deals, rueckmeldungen });
  }
  return ergebnis;
}

type InvestorInfo = { status: string; prioritaet: string | null };

/**
 * Profile für das Matching: bevorzugt die bereinigte Investorendatenbank (ohne erloschene
 * und gesperrte Firmen), sonst die Salesforce-Ankaufsprofile wie bisher.
 */
async function profileLaden(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<{
  profile: ProfilZeile[];
  quelle: MatchingDto["profilQuelle"];
  info: Map<string, InvestorInfo>;
}> {
  try {
    const zeilen = await alle<{
      account_sf_id: string;
      name: string;
      profil_sf_id: string | null;
      hauptkontakt_sf_id: string | null;
      typ: string | null;
      status: string;
      prioritaet: string | null;
      nutzungen: string[] | null;
      objektklassen: string[] | null;
      regionen: string[] | null;
      volumen_min: number | null;
      volumen_max: number | null;
      faktor_max: number | null;
      einheiten_min: number | null;
      baujahr_ab: number | null;
      baujahr_bis: number | null;
    }>((a, b) =>
      admin
        .from("investoren")
        .select(
          "account_sf_id, name, profil_sf_id, hauptkontakt_sf_id, typ, status, prioritaet, nutzungen, objektklassen, regionen, volumen_min, volumen_max, faktor_max, einheiten_min, baujahr_ab, baujahr_bis",
        )
        .not("status", "in", "(erloschen,gesperrt)")
        .order("account_sf_id")
        .range(a, b),
    );
    if (zeilen.length) {
      const zahl = (v: unknown) => (v == null ? null : Number(v));
      const info = new Map<string, InvestorInfo>();
      const profile = zeilen.map((z): ProfilZeile => {
        const sfId = z.profil_sf_id ?? z.account_sf_id;
        info.set(sfId, { status: z.status, prioritaet: z.prioritaet });
        return {
          sf_id: sfId,
          name: z.name,
          kontakt_sf_id: z.hauptkontakt_sf_id,
          account_sf_id: z.account_sf_id,
          assetklassen: z.objektklassen,
          nutzungsarten: z.nutzungen,
          regionen: z.regionen,
          volumen_min: zahl(z.volumen_min),
          volumen_max: zahl(z.volumen_max),
          faktor_max: zahl(z.faktor_max),
          einheiten_min: zahl(z.einheiten_min),
          baujahr_ab: zahl(z.baujahr_ab),
          baujahr_bis: zahl(z.baujahr_bis),
          investor_typ: z.typ,
        };
      });
      return { profile, quelle: "investoren", info };
    }
  } catch (e) {
    // Tabelle fehlt oder ist nicht lesbar: auf die Rohprofile zurückfallen.
    console.warn("[matching] investoren nicht lesbar", e);
  }
  const profile = await alle<ProfilZeile>((a, b) =>
    admin
      .from("sf_ankaufsprofile")
      .select(
        "sf_id, name, kontakt_sf_id, account_sf_id, assetklassen, nutzungsarten, regionen, volumen_min, volumen_max, faktor_max, einheiten_min, baujahr_ab, baujahr_bis, investor_typ",
      )
      .order("sf_id")
      .range(a, b),
  );
  return { profile, quelle: "ankaufsprofile", info: new Map() };
}

/** Aktive und priorisierte Investoren zählen bei der Sortierung wie zusätzliche Reaktionen. */
function statusBonus(i: InvestorInfo | undefined): number {
  if (!i) return 0;
  const prio =
    i.prioritaet === "Tier 1" ? 2 : i.prioritaet === "Tier 2" ? 1 : 0;
  return (i.status === "aktiv" ? 1 : 0) + prio;
}

/**
 * Investoren aus den Listen, die noch nicht in Salesforce sind (Haupteinträge, offen, nicht
 * „Nicht anlegen“, nicht laut Prüfung insolvent, liquidiert oder gelöscht), als Matching-Profile.
 */
async function listenProfileLaden(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<{
  profile: ProfilZeile[];
  jeSchluessel: Map<string, Record<string, unknown>>;
}> {
  const { listeAlsProfil } = await import("./vermarktung");
  const [roh, negativ] = await Promise.all([
    alle<Record<string, unknown>>((a, b) =>
      admin
        .from("investor_quellen")
        .select(
          "schluessel, quelle, firma, person, ort, typ, nutzungen, objektklassen, regionen, volumen_min, volumen_max, einheiten_min",
        )
        .is("dublette_von", null)
        .is("sf_account_sf_id", null)
        .eq("nicht_anlegen", false)
        .eq("bearbeitung", "offen")
        .order("schluessel")
        .range(a, b),
    ),
    alle<{ schluessel: string }>((a, b) =>
      admin
        .from("investor_pruefungen")
        .select("schluessel")
        .like("schluessel", "quelle:%")
        .in("status", ["insolvenz", "liquidation", "geloescht"])
        .order("schluessel")
        .range(a, b),
    ).then((r) => new Set(r.map((x) => x.schluessel))),
  ]);
  return {
    profile: roh
      .filter((q) => !negativ.has(`quelle:${q.schluessel}`))
      .map((q) => listeAlsProfil(q as Parameters<typeof listeAlsProfil>[0])),
    jeSchluessel: new Map(roh.map((q) => [`quelle:${q.schluessel}`, q])),
  };
}

/** Listen-Treffer für die Anzeige. */
function listenTreffer(
  e: MatchErgebnis & { gruende?: string[] },
  q: Record<string, unknown>,
): ListenVermarktungsTreffer {
  return {
    schluessel: String(q.schluessel),
    firma: (q.firma as string) ?? null,
    person: (q.person as string) ?? null,
    ort: (q.ort as string) ?? null,
    quelle: String(q.quelle),
    score: e.score,
    abdeckung: e.abdeckung,
    gruende:
      e.gruende ??
      e.kriterien
        .filter((k) => k.punkte != null && k.punkte >= 70)
        .map((k) => k.begruendung),
  };
}

/** Matching-Merkmale eines Mandats aus Mandat und verknüpftem Objekt (Cache-Zeilen). */
function objektMerkmale(
  m: Record<string, unknown>,
  o: Record<string, unknown> | null,
  objektklasse: string | null,
): MatchingDto["objekt"] {
  const sfDaten = ((o?.sf_daten ?? {}) as Record<string, unknown>) ?? {};
  const n = (v: unknown) => (v == null || Number(v) === 0 ? null : Number(v));
  return {
    name: (o?.name as string) ?? (m.name as string),
    objektart: (o?.objektart as string) ?? null,
    orte: [o?.ort, sfDaten.Stadtbezirk__c, sfDaten.Gemeinde__c].filter(
      (x): x is string => typeof x === "string" && !!x.trim(),
    ),
    preis: n(m.angebotspreis),
    jahresmiete: n(o?.jahresnettokaltmiete),
    einheiten: n(o?.einheiten),
    baujahr: n(o?.baujahr),
    objektklasse,
  };
}

export const matchingFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { mandatSfId?: unknown; objektklasse?: unknown };
    const k = text(d.objektklasse, 30);
    return {
      supabaseAccessToken: tokenAus(data),
      mandatSfId: text(d.mandatSfId, 18),
      objektklasse: KLASSEN.includes(k) ? k : null,
    };
  })
  .handler(async ({ data }): Promise<MatchingDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const { data: m, error } = await admin
      .from("sf_mandate")
      .select("*")
      .eq("sf_id", data.mandatSfId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) throw new Error("Mandat nicht gefunden.");
    const o = m.real_estate_sf_id
      ? ((
          await admin
            .from("sf_real_estate")
            .select("*")
            .eq("sf_id", m.real_estate_sf_id)
            .maybeSingle()
        ).data ?? null)
      : null;
    const objekt = objektMerkmale(m, o, data.objektklasse);

    const { profile, quelle, info } = await profileLaden(admin);
    const reaktionen = await reaktionenJeProfil(admin, profile);
    const summe = new Map(
      profile.map((p) => {
        const r = reaktionen.get(p.sf_id);
        return [
          p.sf_id,
          (r ? r.deals * 3 + r.rueckmeldungen : 0) +
            statusBonus(info.get(p.sf_id)),
        ];
      }),
    );
    // „Kein Interesse“ bleibt sichtbar, steht aber hinter allen anderen Treffern.
    const keinInteresse = (id: string) =>
      Number(info.get(id)?.status === "kein_interesse");
    const ergebnis = rangliste(objekt, profile, summe)
      .map((e, i) => ({ e, i }))
      .sort(
        (a, b) =>
          keinInteresse(a.e.profilSfId) - keinInteresse(b.e.profilSfId) ||
          a.i - b.i,
      )
      .map((x) => x.e)
      .slice(0, 300);
    const profilJeId = new Map(profile.map((p) => [p.sf_id, p]));

    const kontaktIds = new Set<string>();
    for (const e of ergebnis) {
      const p = profilJeId.get(e.profilSfId)!;
      if (p.kontakt_sf_id) kontaktIds.add(p.kontakt_sf_id);
      if (p.account_sf_id) kontaktIds.add(p.account_sf_id);
    }
    const kontakte = new Map<
      string,
      { name: string; firma: string | null; email: string | null }
    >();
    const ids = [...kontaktIds];
    for (let i = 0; i < ids.length; i += 300) {
      const { data: k } = await admin
        .from("sf_kontakte")
        .select("sf_id, name, firma, email")
        .in("sf_id", ids.slice(i, i + 300));
      for (const x of k ?? [])
        kontakte.set(x.sf_id as string, {
          name: x.name as string,
          firma: (x.firma as string) ?? null,
          email: (x.email as string) ?? null,
        });
    }

    const { data: kampagnen } = await admin
      .from("sf_kampagnen")
      .select("sf_id")
      .eq("mandat_sf_id", data.mandatSfId);
    const angesprochen = new Set<string>();
    const kIds = (kampagnen ?? []).map((k) => k.sf_id as string);
    if (kIds.length) {
      const mitglieder = await alle<{ kontakt_sf_id: string | null }>((a, b) =>
        admin
          .from("sf_kampagnen_mitglieder")
          .select("kontakt_sf_id")
          .in("kampagne_sf_id", kIds)
          .order("sf_id")
          .range(a, b),
      );
      for (const x of mitglieder)
        if (x.kontakt_sf_id) angesprochen.add(x.kontakt_sf_id);
    }

    const treffer: MatchTreffer[] = ergebnis.map((e) => {
      const p = profilJeId.get(e.profilSfId)!;
      const kontakt = p.kontakt_sf_id
        ? kontakte.get(p.kontakt_sf_id)
        : undefined;
      const account = p.account_sf_id
        ? kontakte.get(p.account_sf_id)
        : undefined;
      return {
        ...e,
        profilName: p.name,
        investorTyp: p.investor_typ,
        kontaktSfId: p.kontakt_sf_id,
        kontaktName: kontakt?.name ?? null,
        firma: kontakt?.firma ?? account?.name ?? null,
        email: kontakt?.email ?? null,
        bereitsAngesprochen: Boolean(
          p.kontakt_sf_id && angesprochen.has(p.kontakt_sf_id),
        ),
        reaktionen: reaktionen.get(p.sf_id) ?? { deals: 0, rueckmeldungen: 0 },
        investorStatus: info.get(p.sf_id)?.status ?? null,
        prioritaet: info.get(p.sf_id)?.prioritaet ?? null,
      };
    });

    // Interne Datenbank über die Profile hinaus: Interessenten ähnlicher Mandate.
    const [ereignisse, mandate, markt] = await Promise.all([
      interesseEreignisse(admin),
      mandateKurz(admin),
      marktKaeufer(admin, objekt),
    ]);
    const mitProfil = new Set(
      profile
        .flatMap((p) => [p.kontakt_sf_id, p.account_sf_id])
        .filter(Boolean),
    );
    const historieRoh = historieTreffer(
      objekt,
      data.mandatSfId,
      ereignisse,
      mandate,
    )
      .filter((h) => h.score >= 40)
      .slice(0, 80);
    const fehlend = historieRoh
      .map((h) => h.kontaktSfId)
      .filter((id) => !kontakte.has(id));
    for (let i = 0; i < fehlend.length; i += 300) {
      const { data: k } = await admin
        .from("sf_kontakte")
        .select("sf_id, name, firma, email")
        .in("sf_id", fehlend.slice(i, i + 300));
      for (const x of k ?? [])
        kontakte.set(x.sf_id as string, {
          name: x.name as string,
          firma: (x.firma as string) ?? null,
          email: (x.email as string) ?? null,
        });
    }
    const historie: HistorieZeile[] = historieRoh.map((h) => {
      const k = kontakte.get(h.kontaktSfId);
      return {
        ...h,
        kontaktName: k?.name ?? null,
        firma: k?.firma ?? null,
        email: k?.email ?? null,
        waehlbar: h.kontaktSfId.startsWith("003"),
        hatAnkaufsprofil: mitProfil.has(h.kontaktSfId),
        bereitsAngesprochen: angesprochen.has(h.kontaktSfId),
      };
    });

    // Recherche-Pool: nie kontaktierte Adressen, getrennt und nur nach Ort.
    const orte = objekt.orte.map((x) => x.toLowerCase());
    const { data: pool } = await admin
      .from("recherche_pool")
      .select("id, name, firma, ort, quelle")
      .is("sf_id", null)
      .limit(2000);
    const recherche = (pool ?? [])
      .filter(
        (r) =>
          r.ort && orte.some((o) => String(r.ort).toLowerCase().includes(o)),
      )
      .slice(0, 50)
      .map((r) => ({
        id: String(r.id),
        name: String(r.name),
        firma: (r.firma as string) ?? null,
        ort: (r.ort as string) ?? null,
        quelle: String(r.quelle),
      }));

    // Ganze Investorendatenbank: passende Investoren aus den Listen, die noch nicht in Salesforce sind.
    const listen = await listenProfileLaden(admin);
    const listenErgebnis = rangliste(objekt, listen.profile)
      .filter((e) => !e.ausschluss && e.score >= 50 && e.abdeckung >= 50)
      .slice(0, 200)
      .map((e) => listenTreffer(e, listen.jeSchluessel.get(e.profilSfId)!));

    return {
      objekt,
      treffer,
      profileGesamt: profile.length,
      listen: listenErgebnis,
      listenGesamt: listen.profile.length,
      profilQuelle: quelle,
      historie,
      markt,
      recherche,
      klassen: KLASSEN,
    };
  });

/** Mitgliedsstatus wie in den bestehenden Grenz-Vermarktungskampagnen (geprüft 24.10.2026). */
const STATUS_WERTE: { label: string; geantwortet: boolean }[] = [
  { label: "Geplante Ansprache", geantwortet: false },
  { label: "Angebot versenden", geantwortet: false },
  { label: "Angebot gesendet", geantwortet: false },
  { label: "Interesse", geantwortet: true },
  { label: "Besichtigung", geantwortet: true },
  { label: "Besichtigung erfolgt", geantwortet: true },
  { label: "Kaufangebot", geantwortet: true },
  { label: "Absage", geantwortet: true },
];

async function statusWerteSicherstellen(kampagneSfId: string): Promise<void> {
  if (!/^701[A-Za-z0-9]{12,15}$/.test(kampagneSfId))
    throw new Error("Unerwartete Kampagnen-Id von Salesforce.");
  const { sfAbfrage, sfRest } = await import("@/lib/sf-sync/client");
  const vorhanden = await sfAbfrage(
    `SELECT Label, SortOrder FROM CampaignMemberStatus WHERE CampaignId = '${kampagneSfId}'`,
  );
  const labels = new Set(vorhanden.map((v) => String(v.Label)));
  let sort = Math.max(0, ...vorhanden.map((v) => Number(v.SortOrder) || 0));
  const neu = STATUS_WERTE.filter((s) => !labels.has(s.label)).map((s) => ({
    attributes: { type: "CampaignMemberStatus" },
    CampaignId: kampagneSfId,
    Label: s.label,
    HasResponded: s.geantwortet,
    IsDefault: s.label === "Geplante Ansprache",
    SortOrder: (sort += 1),
  }));
  if (neu.length) {
    await sfRest("/composite/sobjects", {
      method: "POST",
      body: JSON.stringify({ allOrNone: true, records: neu }),
    });
  }
}

export type KampagneErgebnis = {
  kampagneSfId: string;
  neuAngelegt: boolean;
  mitglieder: number;
  fehler: string[];
};

/** Legt nach Bestätigung eine Vermarktungskampagne am Objekt an und fügt die Kontakte als „Geplante Ansprache“ hinzu. */
export const kampagneAusMatchingFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      mandatSfId?: unknown;
      kontaktSfIds?: unknown;
      name?: unknown;
      bestaetigt?: unknown;
    };
    return {
      supabaseAccessToken: tokenAus(data),
      mandatSfId: text(d.mandatSfId, 18),
      name: text(d.name, 80).trim(),
      kontaktSfIds: Array.isArray(d.kontaktSfIds)
        ? [
            ...new Set(
              d.kontaktSfIds
                .map((x) => text(x, 18))
                .filter((x) => /^(003|00Q)[A-Za-z0-9]{12,15}$/.test(x)),
            ),
          ]
        : [],
      bestaetigt: d.bestaetigt === true,
      sfSitzung: sfSitzungAus(data),
    };
  })
  .handler(async ({ data }): Promise<KampagneErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    if (!data.bestaetigt)
      throw new Error("Der Schritt muss in der App bestätigt werden.");
    if (!data.kontaktSfIds.length)
      throw new Error("Keine Kontakte ausgewählt.");
    if (data.kontaktSfIds.length > 200)
      throw new Error("Höchstens 200 Kontakte je Kampagne.");
    if (!data.name) throw new Error("Bitte einen Kampagnennamen angeben.");
    const admin = createServiceRoleClient();
    const { data: m } = await admin
      .from("sf_mandate")
      .select("real_estate_sf_id")
      .eq("sf_id", data.mandatSfId)
      .maybeSingle();
    if (!m?.real_estate_sf_id)
      throw new Error("Das Mandat hat kein verknüpftes Objekt in Salesforce.");
    const { sfCreate, sfCreateMehrere } =
      await import("@/lib/sf-sync/schreiben");
    // Masterplan: Kampagne „Vermarktung …“ nur anlegen, falls am Objekt noch keine existiert.
    const { data: vorhandene } = await admin
      .from("sf_kampagnen")
      .select("sf_id")
      .eq("mandat_sf_id", data.mandatSfId)
      .ilike("name", "Vermarktung%")
      .order("start_am", { ascending: false, nullsFirst: false })
      .limit(1);
    const bestehend = (vorhandene?.[0]?.sf_id as string | undefined) ?? null;
    return mitSfZugangOderSitzung(data.sfSitzung, async () => {
      const kampagneSfId: string =
        bestehend ??
        (await sfCreate(admin, "Campaign", {
          Name: data.name,
          // Grenz führt Vermarktungskampagnen mit Typ „Event“ und Name „Vermarktung …“ (geprüft 24.10.2026).
          Type: "Event",
          Status: "Planned",
          IsActive: true,
          Real_Estate__c: m.real_estate_sf_id,
        }));
      await statusWerteSicherstellen(kampagneSfId);
      const { ids, fehler } = await sfCreateMehrere(
        admin,
        "CampaignMember",
        data.kontaktSfIds.map((id) => ({
          CampaignId: kampagneSfId,
          ...(id.startsWith("00Q") ? { LeadId: id } : { ContactId: id }),
          Status: "Geplante Ansprache",
        })),
      );
      return {
        kampagneSfId,
        neuAngelegt: !bestehend,
        mitglieder: ids.length,
        fehler,
      };
    });
  });

/**
 * Kontakt aus dem Recherche-Pool nach Bestätigung als Contact in Salesforce anlegen (Owner Sebastian)
 * und im Pool als übernommen markieren. Erst danach kann er Kampagnenmitglied werden.
 */
export const poolNachSalesforceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { poolId?: unknown; bestaetigt?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      poolId: text(d.poolId, 40),
      bestaetigt: d.bestaetigt === true,
      sfSitzung: sfSitzungAus(data),
    };
  })
  .handler(async ({ data }): Promise<{ kontaktSfId: string }> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    if (!data.bestaetigt)
      throw new Error("Der Schritt muss in der App bestätigt werden.");
    const admin = createServiceRoleClient();
    const { data: p, error } = await admin
      .from("recherche_pool")
      .select("*")
      .eq("id", data.poolId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Eintrag nicht gefunden.");
    if (p.sf_id) return { kontaktSfId: String(p.sf_id) };
    const teile = String(p.name).trim().split(/\s+/);
    const nachname = teile.length > 1 ? teile.pop()! : teile[0];
    const { sfCreate } = await import("@/lib/sf-sync/schreiben");
    const { SEBASTIAN_SF_USER_ID } = await import("@/lib/sf-sync/config");
    const kontaktSfId = await mitSfZugangOderSitzung(data.sfSitzung, () =>
      sfCreate(admin, "Contact", {
        FirstName:
          teile.length && teile[0] !== nachname ? teile.join(" ") : undefined,
        LastName: nachname,
        Email: p.email ?? undefined,
        Phone: p.telefon ?? undefined,
        MailingCity: p.ort ?? undefined,
        Description: `Aus Recherche-Pool übernommen (Quelle ${p.quelle}${p.firma ? `, Firma ${p.firma}` : ""}).`,
        OwnerId: SEBASTIAN_SF_USER_ID,
      }),
    );
    await admin
      .from("recherche_pool")
      .update({
        sf_id: kontaktSfId,
        uebernommen_am: new Date().toISOString(),
        uebernommen_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.poolId);
    return { kontaktSfId };
  });

/**
 * Sucht mit dem Markt-Radar gezielt Käufer, die gerade Objekte wie dieses kaufen
 * (Websuche, nur belegte Quellen). Die Funde landen im Radar und damit im Matching.
 */
export const marktSucheFuerMandatFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { mandatSfId?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      mandatSfId: text(d.mandatSfId, 18),
    };
  })
  .handler(async ({ data }) => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const vor = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: laufend } = await admin
      .from("markt_radar_laeufe")
      .select("id")
      .eq("status", "laeuft")
      .gte("gestartet_am", vor)
      .limit(1);
    if (laufend?.length) throw new Error("Es läuft bereits eine Marktsuche.");

    const { data: m } = await admin
      .from("sf_mandate")
      .select("name, real_estate_sf_id, angebotspreis")
      .eq("sf_id", data.mandatSfId)
      .maybeSingle();
    if (!m) throw new Error("Mandat nicht gefunden.");
    const o = m.real_estate_sf_id
      ? (
          await admin
            .from("sf_real_estate")
            .select("objektart, ort, einheiten, baujahr, jahresnettokaltmiete")
            .eq("sf_id", m.real_estate_sf_id)
            .maybeSingle()
        ).data
      : null;
    const preis = Number(m.angebotspreis) || null;
    const merkmale = [
      o?.objektart ?? "Zinshaus",
      o?.ort ? `in ${o.ort}` : null,
      preis
        ? `Angebotspreis rund ${Math.round(preis / 100_000) / 10} Mio. €`
        : null,
      Number(o?.einheiten) ? `${Number(o?.einheiten)} Einheiten` : null,
      Number(o?.baujahr) ? `Baujahr ${Number(o?.baujahr)}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const auftrag = `Suche Käufer für ein konkretes Verkaufsmandat: ${merkmale}.
Finde Unternehmen und Personen, die in den letzten 12 Monaten vergleichbare Objekte in derselben Stadt oder Region gekauft haben, dafür ein Ankaufsprofil veröffentlicht haben oder Kapital dafür einsammeln. Nenne keine Makler. Gib für jeden Akteur die Objektart und den Ort seiner Käufe an.`;
    const { marktRadarAusfuehren } = await import("@/lib/markt-radar/lauf");
    return marktRadarAusfuehren(admin, "manuell", {
      seiten: ["kaeufer"],
      auftrag,
    });
  });

export type VermarktungsTreffer = {
  profilSfId: string;
  score: number;
  abdeckung: number;
  gruende: string[];
  firma: string | null;
  kontaktSfId: string | null;
  kontaktName: string | null;
  email: string | null;
  investorStatus: string | null;
  prioritaet: string | null;
  reaktionen: { deals: number; rueckmeldungen: number };
};

export type ListenVermarktungsTreffer = {
  schluessel: string;
  firma: string | null;
  person: string | null;
  ort: string | null;
  quelle: string;
  score: number;
  abdeckung: number;
  gruende: string[];
};

export type VermarktungZeile = {
  mandatSfId: string;
  objekt: MatchingDto["objekt"];
  kampagne: { sfId: string; name: string } | null;
  /** Kontakte, die schon in einer Kampagne dieses Mandats sind. */
  angesprochen: number;
  treffer: VermarktungsTreffer[];
  listen: ListenVermarktungsTreffer[];
};

/**
 * Alle laufenden Vermarktungen (Mandate in Beauftragung) gegen die Investorendatenbank: je Mandat
 * qualifizierte Salesforce-Investoren, die noch nicht in der Kampagne sind, und passende
 * Investoren aus den Listen. Schreibt nichts; Kampagne und Anlage laufen über die bestätigten
 * Funktionen kampagneAusMatchingFn und quellenAnlegenFn.
 */
export const vermarktungsAbgleichFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<VermarktungZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const { istTest } = await import("@/lib/uebersicht/berechnen");
    const { listeAlsProfil, qualifizierteTreffer } =
      await import("./vermarktung");

    const { data: mRoh, error } = await admin
      .from("sf_mandate")
      .select("*")
      .eq("status", "Beauftragung");
    if (error) throw new Error(error.message);
    const mandate = (mRoh ?? []).filter((m) => !istTest(String(m.name ?? "")));
    if (!mandate.length) return [];
    const reIds = mandate
      .map((m) => m.real_estate_sf_id)
      .filter(Boolean) as string[];
    const mandatIds = mandate.map((m) => String(m.sf_id));

    const [objekte, kampagnen, { profile, info }, listen] = await Promise.all([
      reIds.length
        ? admin
            .from("sf_real_estate")
            .select("*")
            .in("sf_id", reIds)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      admin
        .from("sf_kampagnen")
        .select("sf_id, name, mandat_sf_id, start_am")
        .in("mandat_sf_id", mandatIds)
        .order("start_am", { ascending: false, nullsFirst: false })
        .then((r) => r.data ?? []),
      profileLaden(admin),
      listenProfileLaden(admin),
    ]);
    const objektJeId = new Map(
      objekte.map((o) => [String(o.sf_id), o as Record<string, unknown>]),
    );
    const reaktionen = await reaktionenJeProfil(admin, profile);
    const gewichtung = new Map(
      profile.map((p) => {
        const r = reaktionen.get(p.sf_id);
        return [
          p.sf_id,
          (r ? r.deals * 3 + r.rueckmeldungen : 0) +
            statusBonus(info.get(p.sf_id)),
        ];
      }),
    );
    const { profile: listenProfile, jeSchluessel: listenJeSchluessel } = listen;

    // Schon angesprochene Kontakte je Mandat (alle Kampagnen des Mandats).
    const kIds = kampagnen.map((k) => String(k.sf_id));
    const mitglieder = kIds.length
      ? await alle<{ kampagne_sf_id: string; kontakt_sf_id: string | null }>(
          (a, b) =>
            admin
              .from("sf_kampagnen_mitglieder")
              .select("kampagne_sf_id, kontakt_sf_id")
              .in("kampagne_sf_id", kIds)
              .order("sf_id")
              .range(a, b),
        )
      : [];
    const mandatJeKampagne = new Map(
      kampagnen.map((k) => [String(k.sf_id), String(k.mandat_sf_id)]),
    );
    const angesprochen = new Map<string, Set<string>>();
    for (const x of mitglieder) {
      const mandat = mandatJeKampagne.get(x.kampagne_sf_id);
      if (!mandat || !x.kontakt_sf_id) continue;
      const s = angesprochen.get(mandat) ?? new Set<string>();
      s.add(x.kontakt_sf_id);
      angesprochen.set(mandat, s);
    }

    const profilJeId = new Map(profile.map((p) => [p.sf_id, p]));
    const zeilen = mandate.map((m) => {
      const mandatSfId = String(m.sf_id);
      const objekt = objektMerkmale(
        m,
        m.real_estate_sf_id
          ? (objektJeId.get(String(m.real_estate_sf_id)) ?? null)
          : null,
        null,
      );
      const schon = angesprochen.get(mandatSfId) ?? new Set<string>();
      const treffer = qualifizierteTreffer(objekt, profile, {
        gewichtung,
        ausschliessen: (p) =>
          info.get(p.sf_id)?.status === "kein_interesse" ||
          Boolean(p.kontakt_sf_id && schon.has(p.kontakt_sf_id)),
        max: 50,
      });
      const listen = qualifizierteTreffer(objekt, listenProfile, { max: 30 });
      const kampagne =
        kampagnen.find(
          (k) =>
            k.mandat_sf_id === mandatSfId &&
            /^vermarktung/i.test(String(k.name)),
        ) ?? kampagnen.find((k) => k.mandat_sf_id === mandatSfId);
      return {
        mandatSfId,
        objekt,
        kampagne,
        angesprochen: schon.size,
        treffer,
        listen,
      };
    });

    // Namen und E-Mails der Treffer in einem Rutsch.
    const ids = new Set<string>();
    for (const z of zeilen)
      for (const t of z.treffer) {
        const p = profilJeId.get(t.profilSfId)!;
        if (p.kontakt_sf_id) ids.add(p.kontakt_sf_id);
        if (p.account_sf_id) ids.add(p.account_sf_id);
      }
    const kontakte = new Map<
      string,
      { name: string; firma: string | null; email: string | null }
    >();
    const idListe = [...ids];
    for (let i = 0; i < idListe.length; i += 300) {
      const { data: k } = await admin
        .from("sf_kontakte")
        .select("sf_id, name, firma, email")
        .in("sf_id", idListe.slice(i, i + 300));
      for (const x of k ?? [])
        kontakte.set(String(x.sf_id), {
          name: String(x.name),
          firma: (x.firma as string) ?? null,
          email: (x.email as string) ?? null,
        });
    }

    return zeilen
      .map((z) => ({
        mandatSfId: z.mandatSfId,
        objekt: z.objekt,
        kampagne: z.kampagne
          ? { sfId: String(z.kampagne.sf_id), name: String(z.kampagne.name) }
          : null,
        angesprochen: z.angesprochen,
        treffer: z.treffer.map((t): VermarktungsTreffer => {
          const p = profilJeId.get(t.profilSfId)!;
          const k = p.kontakt_sf_id ? kontakte.get(p.kontakt_sf_id) : undefined;
          const a = p.account_sf_id ? kontakte.get(p.account_sf_id) : undefined;
          return {
            profilSfId: t.profilSfId,
            score: t.score,
            abdeckung: t.abdeckung,
            gruende: t.gruende,
            firma: a?.name ?? k?.firma ?? p.name,
            kontaktSfId: p.kontakt_sf_id?.startsWith("003")
              ? p.kontakt_sf_id
              : null,
            kontaktName: k?.name ?? null,
            email: k?.email ?? null,
            investorStatus: info.get(p.sf_id)?.status ?? null,
            prioritaet: info.get(p.sf_id)?.prioritaet ?? null,
            reaktionen: reaktionen.get(p.sf_id) ?? {
              deals: 0,
              rueckmeldungen: 0,
            },
          };
        }),
        listen: z.listen.map((t) =>
          listenTreffer(t, listenJeSchluessel.get(t.profilSfId)!),
        ),
      }))
      .sort(
        (a, b) =>
          b.treffer.length +
          b.listen.length -
          (a.treffer.length + a.listen.length),
      );
  });

export type MarktVermarktungZeile = {
  mandatSfId: string;
  objekt: MatchingDto["objekt"];
  treffer: MarktTreffer[];
};

/** Ab dieser Passung zeigt der Abgleich einen Marktkäufer an (wie im Käufer-Matching). */
const MARKT_MINDESTSCORE = 40;

/**
 * Alle laufenden Vermarktungen (Mandate in Beauftragung) gegen die gerade aktiven Käufer aus der
 * Online-Recherche (Markt-Radar, letzte 180 Tage, nur belegte Quellen). Schreibt nichts.
 */
export const marktVermarktungFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<MarktVermarktungZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const { istTest } = await import("@/lib/uebersicht/berechnen");
    const { data: mRoh, error } = await admin
      .from("sf_mandate")
      .select("*")
      .eq("status", "Beauftragung");
    if (error) throw new Error(error.message);
    const mandate = (mRoh ?? []).filter((m) => !istTest(String(m.name ?? "")));
    if (!mandate.length) return [];
    const reIds = mandate
      .map((m) => m.real_estate_sf_id)
      .filter(Boolean) as string[];
    const [objekte, kaeufer] = await Promise.all([
      reIds.length
        ? admin
            .from("sf_real_estate")
            .select("*")
            .in("sf_id", reIds)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      radarKaeuferLaden(admin),
    ]);
    const objektJeId = new Map(
      objekte.map((o) => [String(o.sf_id), o as Record<string, unknown>]),
    );
    return mandate
      .map((m) => {
        const objekt = objektMerkmale(
          m,
          m.real_estate_sf_id
            ? (objektJeId.get(String(m.real_estate_sf_id)) ?? null)
            : null,
          null,
        );
        return {
          mandatSfId: String(m.sf_id),
          objekt,
          treffer: besteMarktTreffer(kaeufer, objekt, 25).filter(
            (t) => t.score >= MARKT_MINDESTSCORE,
          ),
        };
      })
      .sort(
        (a, b) =>
          b.treffer.length - a.treffer.length ||
          a.objekt.name.localeCompare(b.objekt.name, "de"),
      );
  });
