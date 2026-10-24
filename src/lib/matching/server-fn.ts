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
import { mitSfZugangOderSitzung, sfSitzungAus } from "@/lib/sf-sync/zugang";

import {
  rangliste,
  type MatchErgebnis,
  type ObjektMerkmale,
  type ProfilZeile,
} from "./score";

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
};

export type RechercheTreffer = {
  id: string;
  name: string;
  firma: string | null;
  ort: string | null;
  quelle: string;
};

export type MatchingDto = {
  objekt: ObjektMerkmale & { name: string };
  treffer: MatchTreffer[];
  profileGesamt: number;
  recherche: RechercheTreffer[];
  klassen: string[];
};

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
    const sfDaten = ((o?.sf_daten ?? {}) as Record<string, unknown>) ?? {};
    const n = (v: unknown) => (v == null || Number(v) === 0 ? null : Number(v));
    const objekt: MatchingDto["objekt"] = {
      name: (o?.name as string) ?? (m.name as string),
      objektart: (o?.objektart as string) ?? null,
      orte: [o?.ort, sfDaten.Stadtbezirk__c, sfDaten.Gemeinde__c].filter(
        (x): x is string => typeof x === "string" && !!x.trim(),
      ),
      preis: n(m.angebotspreis),
      jahresmiete: n(o?.jahresnettokaltmiete),
      einheiten: n(o?.einheiten),
      baujahr: n(o?.baujahr),
      objektklasse: data.objektklasse,
    };

    const profile = await alle<ProfilZeile>((a, b) =>
      admin
        .from("sf_ankaufsprofile")
        .select(
          "sf_id, name, kontakt_sf_id, account_sf_id, assetklassen, nutzungsarten, regionen, volumen_min, volumen_max, faktor_max, einheiten_min, baujahr_ab, baujahr_bis, investor_typ",
        )
        .order("sf_id")
        .range(a, b),
    );
    const ergebnis = rangliste(objekt, profile).slice(0, 300);
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

    return {
      objekt,
      treffer,
      profileGesamt: profile.length,
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
