/**
 * Server-Funktionen der Investorendatenbank: Liste, Akte, Prüfliste, externe Listen,
 * Prüfung und Rückschreiben nach Salesforce (nur einzeln bestätigte Vorschläge).
 */

import { createServerFn } from "@tanstack/react-start";

import { createServiceRoleClient, pruefeAufrufer, tokenAus } from "@/lib/server/aufrufer";

import { ACCOUNT_TYPE_JE_TYP, type InvestorTyp } from "./bereinigung";
import type {
  InvestorAkte,
  InvestorZeile,
  JsonWert,
  PruefungKurz,
  QuelleZeile,
  VorschlagZeile,
} from "./typen";

type Roh = Record<string, unknown>;

function zahl(w: unknown): number | null {
  if (w == null || w === "") return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}

function pruefungKurz(p: Roh | undefined): PruefungKurz | null {
  if (!p) return null;
  return {
    status: String(p.status),
    begruendung: (p.begruendung as string) ?? null,
    quelleUrl: (p.quelle_url as string) ?? null,
    webseite: (p.webseite as string) ?? null,
    ankaufsprofilUrl: (p.ankaufsprofil_url as string) ?? null,
    ankaufsprofilKurz: (p.ankaufsprofil_kurz as string) ?? null,
    aktiv2026: (p.aktiv_2026 as boolean) ?? null,
    letzteAktivitaet: (p.letzte_aktivitaet as string) ?? null,
    geprueftAm: String(p.geprueft_am),
  };
}

function zuInvestor(z: Roh, p?: Roh): InvestorZeile {
  return {
    accountSfId: String(z.account_sf_id),
    name: String(z.name),
    profilSfId: (z.profil_sf_id as string) ?? null,
    typ: (z.typ as string) ?? null,
    typQuelle: (z.typ_quelle as string) ?? null,
    status: String(z.status),
    statusGrund: (z.status_grund as string) ?? null,
    prioritaet: (z.prioritaet as string) ?? null,
    herkunft: String(z.herkunft),
    nutzungen: (z.nutzungen as string[]) ?? [],
    objektklassen: (z.objektklassen as string[]) ?? [],
    volumenMin: zahl(z.volumen_min),
    volumenMax: zahl(z.volumen_max),
    faktorMax: zahl(z.faktor_max),
    einheitenMin: zahl(z.einheiten_min),
    regionsebene: (z.regionsebene as string) ?? null,
    regionenKurz: (z.regionen_kurz as string[]) ?? [],
    bemerkung: (z.bemerkung as string) ?? null,
    kriterienHerkunft: (z.kriterien_herkunft as Record<string, string>) ?? {},
    letzterKontaktAm: (z.letzter_kontakt_am as string) ?? null,
    aktivitaeten12m: Number(z.aktivitaeten_12m ?? 0),
    dealsAnzahl: Number(z.deals_anzahl ?? 0),
    dealsGewonnen: Number(z.deals_gewonnen ?? 0),
    kampagnenAnzahl: Number(z.kampagnen_anzahl ?? 0),
    radarAnzahl: Number(z.radar_anzahl ?? 0),
    letzteMarktaktivitaetAm: (z.letzte_marktaktivitaet_am as string) ?? null,
    kontakteAnzahl: Number(z.kontakte_anzahl ?? 0),
    kontakteMitEmail: Number(z.kontakte_mit_email ?? 0),
    pruefung: pruefungKurz(p),
  };
}

async function alle(abfrage: (von: number, bis: number) => PromiseLike<{ data: Roh[] | null; error: { message: string } | null }>) {
  const ergebnis: Roh[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await abfrage(von, von + 999);
    if (error) throw new Error(error.message);
    ergebnis.push(...(data ?? []));
    if (!data || data.length < 1000) return ergebnis;
  }
}

export const investorenLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<InvestorZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const [zeilen, pruefungen] = await Promise.all([
      alle((von, bis) => admin.from("investoren").select("*").order("name").range(von, bis)),
      alle((von, bis) => admin.from("investor_pruefungen").select("*").like("schluessel", "acc:%").range(von, bis)),
    ]);
    const je = new Map(pruefungen.map((p) => [String(p.schluessel).slice(4), p]));
    return zeilen.map((z) => zuInvestor(z, je.get(String(z.account_sf_id))));
  });

function zuVorschlag(v: Roh, namen: Map<string, string>): VorschlagZeile {
  return {
    id: String(v.id),
    accountSfId: (v.account_sf_id as string) ?? null,
    investor: v.account_sf_id ? (namen.get(String(v.account_sf_id)) ?? null) : null,
    profilSfId: (v.profil_sf_id as string) ?? null,
    art: String(v.art),
    feld: (v.feld as string) ?? null,
    alterWert: (v.alter_wert ?? null) as JsonWert,
    neuerWert: (v.neuer_wert ?? null) as JsonWert,
    quelle: String(v.quelle),
    beleg: (v.beleg as string) ?? null,
    ziel: String(v.ziel),
    sfObjekt: (v.sf_objekt as string) ?? null,
    sfFeld: (v.sf_feld as string) ?? null,
    status: String(v.status),
    createdAt: String(v.created_at),
  };
}

export const investorAkteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { accountSfId?: unknown };
    if (typeof d.accountSfId !== "string") throw new Error("Ungültige Eingabe.");
    return { supabaseAccessToken: tokenAus(data), accountSfId: d.accountSfId };
  })
  .handler(async ({ data }): Promise<InvestorAkte> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const id = data.accountSfId;
    const [inv, pr, ereignisse, vorschlaege, kontakte, quellen] = await Promise.all([
      admin.from("investoren").select("*").eq("account_sf_id", id).maybeSingle(),
      admin.from("investor_pruefungen").select("*").eq("schluessel", `acc:${id}`).maybeSingle(),
      admin.from("investor_ereignisse").select("*").eq("account_sf_id", id).order("am", { ascending: false }).limit(200),
      admin.from("investor_vorschlaege").select("*").eq("account_sf_id", id).order("created_at", { ascending: false }),
      admin.from("sf_kontakte").select("sf_id, name, email, telefon, mobil").eq("account_sf_id", id).limit(50),
      admin.from("investor_quellen").select("quelle, quelle_link, nutzungen, volumen_min, volumen_max, objekte_interesse, person, emails").eq("sf_account_sf_id", id),
    ]);
    if (inv.error) throw new Error(inv.error.message);
    if (!inv.data) throw new Error("Investor nicht gefunden.");
    const investor = zuInvestor(inv.data, pr.data ?? undefined);
    const namen = new Map([[id, investor.name]]);
    return {
      investor,
      ereignisse: (ereignisse.data ?? []).map((e) => ({
        am: e.am,
        quelle: e.quelle,
        art: e.art,
        titel: e.titel,
        detail: e.detail,
      })),
      vorschlaege: (vorschlaege.data ?? []).map((v) => zuVorschlag(v, namen)),
      kontakte: (kontakte.data ?? []).map((k) => ({
        sfId: k.sf_id,
        name: k.name,
        email: k.email,
        telefon: k.telefon ?? k.mobil ?? null,
      })),
      listen: (quellen.data ?? []).map((q) => ({
        quelle: q.quelle,
        link: q.quelle_link,
        nutzungen: q.nutzungen ?? [],
        volumenMin: zahl(q.volumen_min),
        volumenMax: zahl(q.volumen_max),
        objekteInteresse: q.objekte_interesse ?? [],
      })),
    };
  });

export const vorschlaegeLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { status?: unknown };
    return { supabaseAccessToken: tokenAus(data), status: typeof d.status === "string" ? d.status : "offen" };
  })
  .handler(async ({ data }): Promise<VorschlagZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const [vs, inv] = await Promise.all([
      alle((von, bis) =>
        admin.from("investor_vorschlaege").select("*").eq("status", data.status).order("created_at", { ascending: false }).range(von, bis),
      ),
      alle((von, bis) => admin.from("investoren").select("account_sf_id, name").range(von, bis)),
    ]);
    const namen = new Map(inv.map((i) => [String(i.account_sf_id), String(i.name)]));
    return vs.map((v) => zuVorschlag(v, namen));
  });

/** Ein Vorschlag wird übernommen (fließt beim nächsten Aufbau in die App-Werte) oder abgelehnt. */
export const vorschlagEntscheidenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { ids?: unknown; status?: unknown };
    const ids = Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === "string") : [];
    if (!ids.length || (d.status !== "uebernommen" && d.status !== "abgelehnt" && d.status !== "offen"))
      throw new Error("Ungültige Eingabe.");
    return { supabaseAccessToken: tokenAus(data), ids, status: d.status as "uebernommen" | "abgelehnt" | "offen" };
  })
  .handler(async ({ data }) => {
    const aufrufer = await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("investor_vorschlaege")
      .update({
        status: data.status,
        entschieden_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
        entschieden_am: new Date().toISOString(),
      })
      .in("id", data.ids)
      .neq("status", "zurueckgeschrieben");
    if (error) throw new Error(error.message);
    const { investorenAufbauen } = await import("./aufbau");
    await investorenAufbauen(admin);
    return { ok: true };
  });

/** Salesforce-Felder je übernommenem Vorschlag. Nur eindeutige Ein-Feld-Änderungen. */
function sfAenderung(v: Roh): { objekt: "Account" | "Investorprofile__c"; id: string; felder: Record<string, unknown> } | null {
  const feld = String(v.feld ?? "");
  if (v.ziel !== "salesforce") return null;
  if (feld === "typ" && v.sf_objekt === "Account" && v.account_sf_id) {
    const wert = ACCOUNT_TYPE_JE_TYP[String(v.neuer_wert) as InvestorTyp];
    return wert ? { objekt: "Account", id: String(v.account_sf_id), felder: { Type: wert } } : null;
  }
  if (feld === "erloschen" && v.account_sf_id)
    return { objekt: "Account", id: String(v.account_sf_id), felder: { DO_NOT_CONTACT__c: true } };
  if (v.sf_objekt === "Investorprofile__c" && v.profil_sf_id && v.sf_feld && !String(v.sf_feld).includes(",")) {
    if (["faktor_max", "einheiten_min", "grundstueck_ab_m2", "bgf_ab_m2", "volumen_min", "volumen_max"].includes(feld))
      return { objekt: "Investorprofile__c", id: String(v.profil_sf_id), felder: { [String(v.sf_feld)]: v.neuer_wert } };
  }
  if (feld === "volumen" && v.profil_sf_id) {
    const n = (v.neuer_wert ?? {}) as { min?: number | null; max?: number | null };
    const a = (v.alter_wert ?? {}) as { min?: number | null; max?: number | null };
    const felder: Record<string, unknown> = {};
    if (a.min == null && n.min != null) felder.Objektvolumen_Min_Mio__c = n.min;
    if (a.max == null && n.max != null) felder.Objektvolumen_Max_Mio__c = n.max;
    return Object.keys(felder).length ? { objekt: "Investorprofile__c", id: String(v.profil_sf_id), felder } : null;
  }
  return null;
}

/**
 * Schreibt übernommene Vorschläge nach Salesforce. Nur auf ausdrückliche Bestätigung in der UI,
 * höchstens 50 je Vorgang; jeder Datensatz wird danach neu in den Cache geholt.
 */
export const vorschlaegeZurueckschreibenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { ids?: unknown; bestaetigt?: unknown };
    const ids = Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === "string") : [];
    if (!ids.length || ids.length > 50 || d.bestaetigt !== true) throw new Error("Bitte höchstens 50 Vorschläge auswählen und bestätigen.");
    return { supabaseAccessToken: tokenAus(data), ids };
  })
  .handler(async ({ data }) => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const { data: vs, error } = await admin.from("investor_vorschlaege").select("*").in("id", data.ids).eq("status", "uebernommen");
    if (error) throw new Error(error.message);
    const { sfUpdate } = await import("@/lib/sf-sync/schreiben");
    let geschrieben = 0;
    const fehler: string[] = [];
    for (const v of vs ?? []) {
      const a = sfAenderung(v);
      if (!a) {
        fehler.push(`${v.feld}: lässt sich nicht automatisch schreiben.`);
        continue;
      }
      try {
        await sfUpdate(admin, a.objekt, a.id, a.felder);
        await admin.from("investor_vorschlaege").update({ status: "zurueckgeschrieben", zurueckgeschrieben_am: new Date().toISOString() }).eq("id", v.id);
        geschrieben++;
      } catch (e) {
        fehler.push(`${v.feld}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { geschrieben, fehler };
  });

function zuQuelle(q: Roh, p?: Roh): QuelleZeile {
  return {
    schluessel: String(q.schluessel),
    quelle: String(q.quelle),
    firma: (q.firma as string) ?? null,
    person: (q.person as string) ?? null,
    emails: (q.emails as string[]) ?? [],
    telefon: (q.telefon as string) ?? null,
    adresse: (q.adresse as string) ?? null,
    webseite: (q.webseite as string) ?? null,
    quelleLink: (q.quelle_link as string) ?? null,
    typ: (q.typ as string) ?? null,
    nutzungen: (q.nutzungen as string[]) ?? [],
    volumenMin: zahl(q.volumen_min),
    volumenMax: zahl(q.volumen_max),
    nrwBezug: (q.nrw_bezug as string) ?? null,
    objekteInteresse: (q.objekte_interesse as string[]) ?? [],
    passung: Number(q.passung ?? 0),
    sfTrefferArt: (q.sf_treffer_art as string) ?? null,
    bearbeitung: String(q.bearbeitung),
    pruefung: pruefungKurz(p),
  };
}

export const quellenLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { quelle?: unknown; minPassung?: unknown; nurNeu?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      quelle: typeof d.quelle === "string" ? d.quelle : null,
      minPassung: typeof d.minPassung === "number" ? d.minPassung : 70,
      nurNeu: d.nurNeu !== false,
    };
  })
  .handler(async ({ data }): Promise<QuelleZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    let q = admin
      .from("investor_quellen")
      .select("*")
      .gte("passung", data.minPassung)
      .eq("bearbeitung", "offen")
      .eq("nicht_anlegen", false)
      .order("passung", { ascending: false })
      .order("firma")
      .limit(500);
    if (data.quelle) q = q.eq("quelle", data.quelle);
    if (data.nurNeu) q = q.is("sf_treffer_art", null);
    const { data: zeilen, error } = await q;
    if (error) throw new Error(error.message);
    const schluessel = (zeilen ?? []).map((z) => `quelle:${z.schluessel}`);
    const pr = new Map<string, Roh>();
    for (let i = 0; i < schluessel.length; i += 200) {
      const { data: p } = await admin.from("investor_pruefungen").select("*").in("schluessel", schluessel.slice(i, i + 200));
      for (const x of p ?? []) pr.set(String(x.schluessel).slice(7), x);
    }
    return (zeilen ?? []).map((z) => zuQuelle(z, pr.get(String(z.schluessel))));
  });

export const quelleBearbeitenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { schluessel?: unknown; bearbeitung?: unknown };
    const schluessel = Array.isArray(d.schluessel) ? d.schluessel.filter((x): x is string => typeof x === "string") : [];
    if (!schluessel.length || (d.bearbeitung !== "verworfen" && d.bearbeitung !== "offen")) throw new Error("Ungültige Eingabe.");
    return { supabaseAccessToken: tokenAus(data), schluessel, bearbeitung: d.bearbeitung as "verworfen" | "offen" };
  })
  .handler(async ({ data }) => {
    const aufrufer = await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const { error } = await createServiceRoleClient()
      .from("investor_quellen")
      .update({
        bearbeitung: data.bearbeitung,
        bearbeitet_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
        bearbeitet_am: new Date().toISOString(),
      })
      .in("schluessel", data.schluessel);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Legt ausgewählte Listeneinträge in Salesforce an (Account, Kontakt, Ankaufsprofil).
 * Nur nach Bestätigung in der UI, höchstens 25 je Vorgang. Insolvente oder gelöschte Firmen werden übersprungen.
 */
export const quellenAnlegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { schluessel?: unknown; bestaetigt?: unknown };
    const schluessel = Array.isArray(d.schluessel) ? d.schluessel.filter((x): x is string => typeof x === "string") : [];
    if (!schluessel.length || schluessel.length > 25 || d.bestaetigt !== true)
      throw new Error("Bitte höchstens 25 Einträge auswählen und bestätigen.");
    return { supabaseAccessToken: tokenAus(data), schluessel };
  })
  .handler(async ({ data }) => {
    const aufrufer = await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const { data: zeilen, error } = await admin.from("investor_quellen").select("*").in("schluessel", data.schluessel);
    if (error) throw new Error(error.message);
    const { sfCreate } = await import("@/lib/sf-sync/schreiben");
    const { SEBASTIAN_SF_USER_ID } = await import("@/lib/sf-sync/config");
    let angelegt = 0;
    const fehler: string[] = [];
    for (const q of zeilen ?? []) {
      const name = String(q.firma ?? q.person ?? "").trim();
      try {
        if (!name) throw new Error("Kein Name.");
        if (q.nicht_anlegen) throw new Error("Als „Nicht anlegen“ markiert.");
        if (q.sf_treffer_art) throw new Error("Ist schon in Salesforce.");
        const { data: pr } = await admin.from("investor_pruefungen").select("status").eq("schluessel", `quelle:${q.schluessel}`).maybeSingle();
        if (pr && ["insolvenz", "liquidation", "geloescht"].includes(pr.status)) throw new Error(`Laut Prüfung ${pr.status}.`);
        const typWert = q.typ ? ACCOUNT_TYPE_JE_TYP[q.typ as InvestorTyp] : null;
        const accountId = await sfCreate(admin, "Account", {
          Name: name,
          OwnerId: SEBASTIAN_SF_USER_ID,
          Website: q.webseite ?? undefined,
          Type: typWert ?? undefined,
          Gesch_ftsbereich__c: "Nur Grenz & Co",
          Focus__c: "Inverstor",
          Description: `Aus Liste ${q.quelle}${q.quelle_link ? `: ${q.quelle_link}` : ""}`,
        });
        const [vor, ...rest] = String(q.person ?? "").replace(/^(herr|frau)\s+/i, "").trim().split(/\s+/);
        const kontaktId =
          q.person || (q.emails ?? []).length
            ? await sfCreate(admin, "Contact", {
                AccountId: accountId,
                OwnerId: SEBASTIAN_SF_USER_ID,
                FirstName: rest.length ? vor : undefined,
                LastName: (rest.length ? rest.join(" ") : vor) || name,
                Email: (q.emails ?? [])[0] ?? undefined,
                Phone: q.telefon ?? undefined,
              })
            : null;
        if ((q.nutzungen ?? []).length || q.volumen_min || q.volumen_max) {
          const erlaubt = new Set(["Behördenimmobilien", "Büro", "Einzelhandel", "Grundstück", "Kita", "Mirco-Apartments", "Pflege", "Serviced Apartments", "Studentenwohnen", "Wohn-/ Geschäftshaus", "Wohnen"]);
          await sfCreate(admin, "Investorprofile__c", {
            Account__c: accountId,
            Hauptansprechpartner_Kontakt__c: kontaktId ?? undefined,
            OwnerId: SEBASTIAN_SF_USER_ID,
            Nutzungsarten__c: (q.nutzungen ?? []).filter((n: string) => erlaubt.has(n)).join(";") || undefined,
            Objektvolumen_Min_Mio__c: q.volumen_min ?? undefined,
            Objektvolumen_Max_Mio__c: q.volumen_max ?? undefined,
            Bemerkungsfeld__c: `Aus Liste ${q.quelle}. Nutzung laut Liste: ${(q.nutzungen ?? []).join(", ")}`,
          });
        }
        await admin
          .from("investor_quellen")
          .update({
            bearbeitung: "angelegt",
            sf_treffer_art: "angelegt",
            sf_account_sf_id: accountId,
            sf_kontakt_sf_id: kontaktId,
            bearbeitet_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
            bearbeitet_am: new Date().toISOString(),
          })
          .eq("schluessel", q.schluessel);
        angelegt++;
      } catch (e) {
        fehler.push(`${name || q.schluessel}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (angelegt) {
      const { investorenAufbauen } = await import("./aufbau");
      await investorenAufbauen(admin);
    }
    return { angelegt, fehler };
  });

/** Prüft sofort die nächsten Firmen (Existenz, Insolvenz, Ankaufsprofil). Dauert ein bis zwei Minuten. */
export const pruefungJetztFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }) => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const { pruefLauf } = await import("./pruefung");
    const ergebnis = await pruefLauf(admin, 5);
    const { investorenAufbauen } = await import("./aufbau");
    await investorenAufbauen(admin);
    return ergebnis;
  });

export const investorenNeuAufbauenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }) => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const { investorenAufbauen } = await import("./aufbau");
    return investorenAufbauen(createServiceRoleClient());
  });
