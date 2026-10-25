/**
 * Baut die Tabelle `investoren` aus dem Salesforce-Cache, den Aktivitäten und dem Markt-Radar
 * neu auf und legt Vorschläge für die Prüfliste an. Läuft nach jedem Salesforce-Sync und
 * Radar-Lauf. Schreibt nur App-Tabellen, nie nach Salesforce. Server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { findeSfTreffer, normalisiereFirma } from "@/lib/markt-radar/abgleich";

import {
  ACCOUNT_TYPE_JE_TYP,
  dublettenPaare,
  kriterienAusBemerkung,
  statusAus,
  typAusText,
  typAusWert,
  verdichteRegionen,
  volumenPlausibel,
  type InvestorTyp,
} from "./bereinigung";

type Roh = Record<string, unknown>;

async function alle<T = Roh>(admin: SupabaseClient, tabelle: string, spalten: string, filter?: (q: any) => any): Promise<T[]> {
  const ergebnis: T[] = [];
  for (let von = 0; ; von += 1000) {
    let q = admin.from(tabelle).select(spalten).range(von, von + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabelle}: ${error.message}`);
    ergebnis.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return ergebnis;
  }
}

function zahl(w: unknown): number | null {
  if (w == null || w === "") return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}

function datum(w: unknown): Date | null {
  if (typeof w !== "string" || !w) return null;
  const d = new Date(w);
  return Number.isNaN(d.getTime()) ? null : d;
}

function spaeter(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Kampagnen-Status, die echtes Interesse zeigen. */
const INTERESSE = new Set(["Interesse", "Besichtigung", "Besichtigung erfolgt", "Kaufangebot", "Angebot gesendet", "Geantwortet"]);
const DEAL_OFFEN = new Set(["Initial interest", "Data Room", "Negotiation", "LOI", "Due Diligence"]);
const DEAL_GEWONNEN = new Set(["Invoice Paid", "Closed Won"]);

/** „Core+ (fertiges Produkt)“ → „Core+“. */
function objektklasse(w: string): string {
  return w.replace(/\s*\(.*\)\s*$/, "").trim();
}

/** Nutzung aus einer Salesforce-Objektart (Real_Estate_Type__c) für abgeleitete Profile. */
function nutzungAusObjektart(art: string | null): string | null {
  const a = (art ?? "").toLowerCase();
  if (!a) return null;
  if (/wohn.*gesch|wgh|gemischt/.test(a)) return "Wohn-/ Geschäftshaus";
  if (/mehrfamilien|mfh|wohn|apartment/.test(a)) return "Wohnen";
  if (/büro|buero|office/.test(a)) return "Büro";
  if (/handel|retail|fachmarkt/.test(a)) return "Einzelhandel";
  if (/grundst/.test(a)) return "Grundstück";
  if (/pflege/.test(a)) return "Pflege";
  return art;
}

export type Vorschlag = {
  account_sf_id: string | null;
  profil_sf_id?: string | null;
  art: "feld" | "dublette" | "neuer_investor" | "neues_profil";
  feld?: string | null;
  alter_wert?: unknown;
  neuer_wert?: unknown;
  quelle: "regel" | "ki" | "radar" | "kampagne" | "deal" | "liste" | "manuell";
  beleg: string;
  ziel: "app" | "salesforce";
  sf_objekt?: string | null;
  sf_feld?: string | null;
  schluessel: string;
};

/** Felder, die ein übernommener Vorschlag in der App überschreibt. */
const UEBERLAGERBAR = new Set(["typ", "faktor_max", "einheiten_min", "volumen_min", "volumen_max", "status", "prioritaet"]);

export type AufbauErgebnis = {
  investoren: number;
  mitProfil: number;
  ohneProfil: number;
  aktiv: number;
  neueVorschlaege: number;
  radarZugeordnet: number;
};

export type Rohdaten = {
  profile: Roh[];
  kontakte: Roh[];
  aktivitaeten: Roh[];
  deals: Roh[];
  mitglieder: Roh[];
  kampagnen: Roh[];
  mandate: Roh[];
  objekte: Roh[];
  radar: Roh[];
  entschieden: Roh[];
  quellen: Roh[];
  pruefungen: Roh[];
};

export async function rohdatenLaden(admin: SupabaseClient): Promise<Rohdaten> {
  const [profile, kontakte, aktivitaeten, deals, mitglieder, kampagnen, mandate, objekte, radar, entschieden, quellen, pruefungen] =
    await Promise.all([
      alle(admin, "sf_ankaufsprofile", "sf_id, name, kontakt_sf_id, account_sf_id, assetklassen, nutzungsarten, regionen, volumen_min, volumen_max, faktor_max, einheiten_min, baujahr_ab, baujahr_bis, investor_typ, sf_daten"),
      alle(admin, "sf_kontakte", "sf_id, sf_typ, name, firma, account_sf_id, email, sf_daten", (q) => q.in("sf_typ", ["Account", "Contact"])),
      alle(admin, "sf_aktivitaeten", "who_sf_id, what_sf_id, datum, sf_typ, art, eingehend:sf_daten->Incoming"),
      alle(admin, "sf_deals", "sf_id, name, phase, account_sf_id, mandat_sf_id, abschluss_am, sf_geaendert_am"),
      alle(admin, "sf_kampagnen_mitglieder", "kampagne_sf_id, kontakt_sf_id, status, sf_geaendert_am"),
      alle(admin, "sf_kampagnen", "sf_id, name, mandat_sf_id"),
      alle(admin, "sf_mandate", "sf_id, real_estate_sf_id, angebotspreis, eigentuemer_account_sf_id"),
      alle(admin, "sf_real_estate", "sf_id, objektart, ort"),
      alle(admin, "markt_radar_meldungen", "id, akteur, akteur_typ, ereignis, ort, objektart, volumen_eur, ereignis_am, created_at, relevanz, status, quelle_url", (q) => q.eq("seite", "kaeufer")),
      alle(admin, "investor_vorschlaege", "account_sf_id, feld, neuer_wert, status, quelle", (q) => q.eq("status", "uebernommen")),
      alle(admin, "investor_quellen", "schluessel, quelle, firma, sf_account_sf_id, typ, nutzungen, volumen_min, volumen_max, einheiten_min, objekte_interesse, quelle_link", (q) => q.not("sf_account_sf_id", "is", null)),
      alle(admin, "investor_pruefungen", "schluessel, status, begruendung, quelle_url, aktiv_2026, letzte_aktivitaet", (q) => q.like("schluessel", "acc:%")),
    ]);
  return { profile, kontakte, aktivitaeten, deals, mitglieder, kampagnen, mandate, objekte, radar, entschieden, quellen, pruefungen };
}

export type Berechnung = {
  zeilen: Roh[];
  vorschlaege: Vorschlag[];
  zuordnung: { id: string; account: string | null }[];
};

/** Reine Berechnung aus den Rohdaten, ohne Schreiben (testbar, auch als Probelauf). */
export function investorenBerechnen(d: Rohdaten, heute = new Date()): Berechnung {
  const { profile, kontakte, aktivitaeten, deals, mitglieder, kampagnen, mandate, objekte, radar, entschieden } = d;
  const quellen = d.quellen ?? [];
  const pruefungJe = new Map((d.pruefungen ?? []).map((p) => [String(p.schluessel).slice(4), p]));
  const accounts = new Map<string, Roh>();
  const kontakteJeAccount = new Map<string, Roh[]>();
  const accountVonKontakt = new Map<string, string>();
  for (const k of kontakte) {
    if (k.sf_typ === "Account") accounts.set(String(k.sf_id), k);
    else if (k.account_sf_id) {
      const a = String(k.account_sf_id);
      accountVonKontakt.set(String(k.sf_id), a);
      kontakteJeAccount.set(a, [...(kontakteJeAccount.get(a) ?? []), k]);
    }
  }
  const eigentuemer = new Set(mandate.map((m) => m.eigentuemer_account_sf_id).filter(Boolean) as string[]);
  const kampagneJe = new Map(kampagnen.map((c) => [String(c.sf_id), c]));
  const mandatJe = new Map(mandate.map((m) => [String(m.sf_id), m]));
  const objektJe = new Map(objekte.map((o) => [String(o.sf_id), o]));
  const vermarktung = (c: Roh | undefined) =>
    Boolean(c && /^vermarktung/i.test(String(c.name ?? "")) && !/test|vorlage/i.test(String(c.name ?? "")));

  // Investorenkreis: Accounts mit Profil, Kampagnen-Empfänger der Vermarktung, Deal-Käufer.
  const profilJe = new Map<string, Roh>();
  for (const p of profile) if (p.account_sf_id) profilJe.set(String(p.account_sf_id), p);
  const herkunft = new Map<string, "ankaufsprofil" | "kampagne" | "deal" | "radar" | "liste">();
  for (const a of profilJe.keys()) herkunft.set(a, "ankaufsprofil");
  for (const m of mitglieder) {
    const a = accountVonKontakt.get(String(m.kontakt_sf_id));
    if (a && !herkunft.has(a) && !eigentuemer.has(a) && vermarktung(kampagneJe.get(String(m.kampagne_sf_id))))
      herkunft.set(a, "kampagne");
  }
  for (const d of deals) {
    const a = d.account_sf_id ? String(d.account_sf_id) : null;
    if (a && !herkunft.has(a) && !eigentuemer.has(a) && (DEAL_OFFEN.has(String(d.phase)) || DEAL_GEWONNEN.has(String(d.phase)) || d.phase === "Closed Lost"))
      herkunft.set(a, "deal");
  }

  // Accounts, die in den externen Listen als Investor stehen.
  const quellenJe = new Map<string, Roh[]>();
  for (const q of quellen) {
    const a = String(q.sf_account_sf_id);
    quellenJe.set(a, [...(quellenJe.get(a) ?? []), q]);
    if (!herkunft.has(a) && !eigentuemer.has(a)) herkunft.set(a, "liste");
  }

  // Aktivitäten je Account.
  const letzterKontakt = new Map<string, Date>();
  const aktiv12 = new Map<string, number>();
  const rueckmeldung = new Map<string, Date>();
  const jahrGrenze = new Date(heute);
  jahrGrenze.setFullYear(jahrGrenze.getFullYear() - 1);
  for (const x of aktivitaeten) {
    const a = accountVonKontakt.get(String(x.who_sf_id)) ?? (String(x.what_sf_id ?? "").startsWith("001") ? String(x.what_sf_id) : null);
    const d = datum(x.datum);
    if (!a || !herkunft.has(a) || !d || d > heute) continue;
    letzterKontakt.set(a, spaeter(letzterKontakt.get(a) ?? null, d)!);
    if (x.art === "Anruf" || x.art === "Termin" || x.eingehend === true || x.eingehend === "true")
      rueckmeldung.set(a, spaeter(rueckmeldung.get(a) ?? null, d)!);
    if (d >= jahrGrenze) aktiv12.set(a, (aktiv12.get(a) ?? 0) + 1);
  }

  // Kampagnen je Account, mit den Objekten, für die Interesse bestand.
  const kampagnenJe = new Map<string, { anzahl: number; absagen: number; interesse: number; objekte: Roh[]; angeschrieben: Roh[] }>();
  for (const m of mitglieder) {
    const a = accountVonKontakt.get(String(m.kontakt_sf_id));
    const c = kampagneJe.get(String(m.kampagne_sf_id));
    if (!a || !herkunft.has(a) || !vermarktung(c)) continue;
    const e = kampagnenJe.get(a) ?? { anzahl: 0, absagen: 0, interesse: 0, objekte: [], angeschrieben: [] };
    e.anzahl++;
    if (m.status === "Absage") e.absagen++;
    const gesendetMandat = mandatJe.get(String(c?.mandat_sf_id));
    if (gesendetMandat && m.status !== "Absage" && !/geplant/i.test(String(m.status))) {
      const o = objektJe.get(String(gesendetMandat.real_estate_sf_id));
      e.angeschrieben.push({ ...o, preis: gesendetMandat.angebotspreis });
    }
    if (INTERESSE.has(String(m.status))) {
      e.interesse++;
      const am = datum(m.sf_geaendert_am);
      if (am) rueckmeldung.set(a, spaeter(rueckmeldung.get(a) ?? null, am)!);
      const mandat = mandatJe.get(String(c?.mandat_sf_id));
      const objekt = mandat ? objektJe.get(String(mandat.real_estate_sf_id)) : undefined;
      if (mandat) e.objekte.push({ ...objekt, preis: mandat.angebotspreis });
    }
    kampagnenJe.set(a, e);
  }

  const dealsJe = new Map<string, { anzahl: number; gewonnen: number; offen: number }>();
  for (const d of deals) {
    const a = d.account_sf_id ? String(d.account_sf_id) : null;
    if (!a || !herkunft.has(a)) continue;
    const e = dealsJe.get(a) ?? { anzahl: 0, gewonnen: 0, offen: 0 };
    e.anzahl++;
    if (DEAL_GEWONNEN.has(String(d.phase))) e.gewonnen++;
    if (DEAL_OFFEN.has(String(d.phase))) e.offen++;
    dealsJe.set(a, e);
  }

  // Radar-Käufer den Investoren (und allen bekannten Accounts) zuordnen.
  const kandidaten = [...accounts.values()].map((a) => ({ sfId: String(a.sf_id), name: String(a.name), firma: null }));
  const radarJe = new Map<string, { anzahl: number; letzte: Date | null }>();
  const zuordnung: { id: string; account: string | null }[] = [];
  const vorschlaege: Vorschlag[] = [];
  for (const r of radar) {
    const t = findeSfTreffer(String(r.akteur), kandidaten);
    zuordnung.push({ id: String(r.id), account: t?.sfId ?? null });
    if (t) {
      if (!herkunft.has(t.sfId)) herkunft.set(t.sfId, "radar");
      const e = radarJe.get(t.sfId) ?? { anzahl: 0, letzte: null };
      e.anzahl++;
      e.letzte = spaeter(e.letzte, datum(r.ereignis_am) ?? datum(r.created_at));
      radarJe.set(t.sfId, e);
    } else if (Number(r.relevanz) >= 60 && r.status !== "verworfen") {
      vorschlaege.push({
        account_sf_id: null,
        art: "neuer_investor",
        feld: "account",
        neuer_wert: { name: r.akteur, typ: typAusWert(String(r.akteur_typ ?? "")), ort: r.ort, objektart: r.objektart, meldung_id: r.id },
        quelle: "radar",
        beleg: `${r.ereignis} (${r.quelle_url})`,
        ziel: "salesforce",
        sf_objekt: "Account",
        schluessel: `neuer_investor:${normalisiereFirma(String(r.akteur))}`,
      });
    }
  }

  // Übernommene Vorschläge überlagern die abgeleiteten Werte.
  const ueberlagert = new Map<string, Map<string, unknown>>();
  for (const v of entschieden) {
    if (!v.account_sf_id || !UEBERLAGERBAR.has(String(v.feld))) continue;
    const m = ueberlagert.get(String(v.account_sf_id)) ?? new Map();
    m.set(String(v.feld), v.neuer_wert);
    ueberlagert.set(String(v.account_sf_id), m);
  }

  const zeilen: Roh[] = [];
  for (const [acc, quelle] of herkunft) {
    const account = accounts.get(acc);
    if (!account) continue;
    const sfA = (account.sf_daten ?? {}) as Roh;
    const p = profilJe.get(acc);
    const sfP = (p?.sf_daten ?? {}) as Roh;
    const name = String(account.name);
    const bemerkung = (sfP.Bemerkungsfeld__c as string | null) ?? null;
    const herkunftWerte: Record<string, string> = {};
    const ueber = ueberlagert.get(acc);

    // Typ
    let typ: InvestorTyp | null = typAusWert(sfA.Type as string) ?? typAusWert(p?.investor_typ as string);
    let typQuelle: string | null = typ ? "salesforce" : null;
    if (!typ) {
      const r = typAusText(name, bemerkung);
      if (r) {
        typ = r.typ;
        typQuelle = "regel";
        const sfWert = ACCOUNT_TYPE_JE_TYP[r.typ];
        vorschlaege.push({
          account_sf_id: acc,
          art: "feld",
          feld: "typ",
          alter_wert: sfA.Type ?? null,
          neuer_wert: r.typ,
          quelle: "regel",
          beleg: r.beleg,
          ziel: sfWert ? "salesforce" : "app",
          sf_objekt: sfWert ? "Account" : null,
          sf_feld: sfWert ? "Type" : null,
          schluessel: `typ:${acc}:${r.typ}`,
        });
      }
    }
    if (ueber?.has("typ")) {
      typ = ueber.get("typ") as InvestorTyp;
      typQuelle = "manuell";
    }

    // Kriterien
    let volMin = zahl(p?.volumen_min);
    let volMax = zahl(p?.volumen_max);
    let faktor = zahl(p?.faktor_max);
    let einheiten = zahl(p?.einheiten_min);
    let nutzungen = (p?.nutzungsarten as string[] | null) ?? [];
    let regionen = (p?.regionen as string[] | null) ?? [];
    let { ebene, kurz } = p ? verdichteRegionen(sfP) : { ebene: null, kurz: [] as string[] };
    if (p) {
      for (const [feld, sfFeld] of [["volumen_min", "Objektvolumen_Min_Mio__c"], ["volumen_max", "Objektvolumen_Max_Mio__c"]] as const) {
        const roh = zahl(sfP[sfFeld]);
        if (roh != null && !volumenPlausibel(roh))
          vorschlaege.push({
            account_sf_id: acc, profil_sf_id: String(p.sf_id), art: "feld", feld, alter_wert: roh, neuer_wert: null,
            quelle: "regel", beleg: `${roh.toLocaleString("de-DE")} € ist als Objektvolumen unplausibel (unter 250.000 €). Bitte korrigieren oder leeren.`,
            ziel: "salesforce", sf_objekt: "Investorprofile__c", sf_feld: sfFeld, schluessel: `plausi:${p.sf_id}:${sfFeld}:${roh}`,
          });
      }
      const ausText = kriterienAusBemerkung(bemerkung);
      const felder: [keyof typeof ausText, string, string, number | null][] = [
        ["faktorMax", "faktor_max", "Multiplikator_bis_fach__c", zahl(sfP.Multiplikator_bis_fach__c)],
        ["einheitenMin", "einheiten_min", "AnzahlEinheitenMin__c", zahl(sfP.AnzahlEinheitenMin__c)],
        ["grundstueckAbM2", "grundstueck_ab_m2", "GrundstCksgrEAbM2__c", null],
        ["bgfAbM2", "bgf_ab_m2", "RealisierbareBGFAbM2__c", null],
      ];
      for (const [schl, feld, sfFeld, vorhanden] of felder) {
        const f = ausText[schl];
        if (!f || vorhanden != null) continue;
        if (feld === "faktor_max" && faktor == null) { faktor = f.wert; herkunftWerte.faktor_max = "bemerkung"; }
        if (feld === "einheiten_min" && einheiten == null) { einheiten = f.wert; herkunftWerte.einheiten_min = "bemerkung"; }
        vorschlaege.push({
          account_sf_id: acc, profil_sf_id: String(p.sf_id), art: "feld", feld, alter_wert: null, neuer_wert: f.wert,
          quelle: "regel", beleg: `Bemerkungsfeld: „${f.beleg}“`, ziel: "salesforce", sf_objekt: "Investorprofile__c", sf_feld: sfFeld,
          schluessel: `bemerkung:${p.sf_id}:${sfFeld}:${f.wert}`,
        });
      }
    } else {
      // Ohne Profil: Kriterien aus den Objekten ableiten, für die der Investor Interesse gezeigt hat.
      // Interesse zählt stärker; sonst die Objekte, für die Grenz ihn angeschrieben hat.
      const k = kampagnenJe.get(acc);
      const mitInteresse = Boolean(k?.objekte.length);
      const objs = mitInteresse ? k!.objekte : (k?.angeschrieben ?? []);
      if (objs.length) {
        nutzungen = [...new Set(objs.map((o) => nutzungAusObjektart(o.objektart as string)).filter(Boolean) as string[])];
        regionen = [...new Set(objs.map((o) => o.ort as string).filter(Boolean))];
        kurz = regionen;
        ebene = regionen.length ? "gemeinde" : null;
        const preise = objs.map((o) => zahl(o.preis)).filter((x): x is number => x != null && x > 0);
        if (preise.length) {
          volMin = Math.round(Math.min(...preise) * 0.7 / 100_000) * 100_000;
          volMax = Math.round(Math.max(...preise) * 1.5 / 100_000) * 100_000;
        }
        Object.assign(herkunftWerte, { nutzungen: "kampagne", regionen: "kampagne", volumen: "kampagne" });
        vorschlaege.push({
          account_sf_id: acc, art: "neues_profil", feld: "profil", alter_wert: null,
          neuer_wert: { nutzungen, regionen, volumen_min: volMin, volumen_max: volMax },
          quelle: "kampagne", beleg: `${mitInteresse ? "Interesse an" : "Angeschrieben für"} ${objs.length} Grenz-Objekt(en): ${objs.map((o) => [o.objektart, o.ort].filter(Boolean).join(" ")).join("; ")}`,
          ziel: "salesforce", sf_objekt: "Investorprofile__c", schluessel: `profil:${acc}`,
        });
      }
    }
    // Fehlende Kriterien aus den externen Listen ergänzen (mit Beleg in der Prüfliste).
    for (const q of quellenJe.get(acc) ?? []) {
      const beleg = `Liste ${q.quelle}${q.quelle_link ? ` (${q.quelle_link})` : ""}`;
      if (!nutzungen.length && (q.nutzungen as string[] | null)?.length) {
        nutzungen = q.nutzungen as string[];
        herkunftWerte.nutzungen = "liste";
      }
      if (volMin == null && zahl(q.volumen_min) != null) { volMin = zahl(q.volumen_min); herkunftWerte.volumen = "liste"; }
      if (volMax == null && zahl(q.volumen_max) != null) { volMax = zahl(q.volumen_max); herkunftWerte.volumen = "liste"; }
      if (einheiten == null && zahl(q.einheiten_min) != null) { einheiten = zahl(q.einheiten_min); herkunftWerte.einheiten_min = "liste"; }
      if (!typ && q.typ) {
        typ = q.typ as InvestorTyp;
        typQuelle = "regel";
        const sfWert = ACCOUNT_TYPE_JE_TYP[typ];
        vorschlaege.push({
          account_sf_id: acc, art: "feld", feld: "typ", alter_wert: sfA.Type ?? null, neuer_wert: typ, quelle: "liste",
          beleg, ziel: sfWert ? "salesforce" : "app", sf_objekt: sfWert ? "Account" : null, sf_feld: sfWert ? "Type" : null,
          schluessel: `typ:${acc}:${typ}`,
        });
      }
      if (p && (zahl(sfP.Objektvolumen_Min_Mio__c) == null || zahl(sfP.Objektvolumen_Max_Mio__c) == null) && (zahl(q.volumen_min) != null || zahl(q.volumen_max) != null)) {
        vorschlaege.push({
          account_sf_id: acc, profil_sf_id: String(p.sf_id), art: "feld", feld: "volumen",
          alter_wert: { min: zahl(sfP.Objektvolumen_Min_Mio__c), max: zahl(sfP.Objektvolumen_Max_Mio__c) },
          neuer_wert: { min: zahl(q.volumen_min), max: zahl(q.volumen_max) }, quelle: "liste", beleg,
          ziel: "salesforce", sf_objekt: "Investorprofile__c", sf_feld: "Objektvolumen_Min_Mio__c,Objektvolumen_Max_Mio__c",
          schluessel: `liste_volumen:${p.sf_id}:${q.volumen_min}:${q.volumen_max}`,
        });
      }
    }

    if (ueber?.has("faktor_max")) { faktor = zahl(ueber.get("faktor_max")); herkunftWerte.faktor_max = "manuell"; }
    if (ueber?.has("einheiten_min")) { einheiten = zahl(ueber.get("einheiten_min")); herkunftWerte.einheiten_min = "manuell"; }
    if (ueber?.has("volumen_min")) volMin = zahl(ueber.get("volumen_min"));
    if (ueber?.has("volumen_max")) volMax = zahl(ueber.get("volumen_max"));

    // Aktivität und Status
    const kam = kampagnenJe.get(acc) ?? { anzahl: 0, absagen: 0, interesse: 0, objekte: [], angeschrieben: [] };
    const dl = dealsJe.get(acc) ?? { anzahl: 0, gewonnen: 0, offen: 0 };
    const rd = radarJe.get(acc) ?? { anzahl: 0, letzte: null };
    const ks = kontakteJeAccount.get(acc) ?? [];
    const st = statusAus({
      gesperrt: sfA.DO_NOT_CONTACT__c === true,
      letzterKontaktAm: letzterKontakt.get(acc) ?? null,
      letzteRueckmeldungAm: rueckmeldung.get(acc) ?? null,
      letzteMarktaktivitaetAm: rd.letzte,
      dealsOffen: dl.offen,
      absagen: kam.absagen,
      interesse: kam.interesse,
      heute,
    });
    let status: string = st.status;
    let statusGrund = st.grund;
    const pr = pruefungJe.get(acc);
    if (pr && ["insolvenz", "liquidation", "geloescht"].includes(String(pr.status))) {
      status = "erloschen";
      statusGrund = `${pr.begruendung ?? pr.status}`;
      vorschlaege.push({
        account_sf_id: acc, art: "feld", feld: "erloschen", alter_wert: null, neuer_wert: pr.status, quelle: "ki",
        beleg: `${pr.begruendung ?? ""} ${pr.quelle_url ?? ""}`.trim(), ziel: "salesforce", sf_objekt: "Account",
        sf_feld: "DO_NOT_CONTACT__c", schluessel: `erloschen:${acc}:${pr.status}`,
      });
    } else if (pr?.aktiv_2026 === true && status === "ruhend") {
      status = "aktiv";
      statusGrund = `Laut Recherche aktiv: ${pr.letzte_aktivitaet ?? "Ankaufsprofil 2025/2026"}`;
    }
    if (ueber?.has("status")) { status = String(ueber.get("status")); statusGrund = "Manuell gesetzt"; }

    zeilen.push({
      account_sf_id: acc,
      name,
      profil_sf_id: p ? p.sf_id : null,
      hauptkontakt_sf_id: (p?.kontakt_sf_id as string) ?? (ks[0]?.sf_id as string) ?? null,
      typ,
      typ_quelle: typQuelle,
      status,
      status_grund: statusGrund,
      prioritaet: (ueber?.get("prioritaet") as string) ?? (sfA.Priorit_t__c as string) ?? null,
      herkunft: quelle,
      nutzungen,
      objektklassen: ((p?.assetklassen as string[] | null) ?? []).map(objektklasse),
      volumen_min: volMin,
      volumen_max: volMax,
      faktor_max: faktor,
      einheiten_min: einheiten,
      baujahr_ab: zahl(p?.baujahr_ab),
      baujahr_bis: zahl(p?.baujahr_bis),
      regionen,
      regionsebene: ebene,
      regionen_kurz: kurz,
      bemerkung,
      kriterien_herkunft: herkunftWerte,
      letzter_kontakt_am: letzterKontakt.get(acc)?.toISOString() ?? null,
      aktivitaeten_12m: aktiv12.get(acc) ?? 0,
      deals_anzahl: dl.anzahl,
      deals_gewonnen: dl.gewonnen,
      kampagnen_anzahl: kam.anzahl,
      radar_anzahl: rd.anzahl,
      letzte_marktaktivitaet_am: rd.letzte ? rd.letzte.toISOString().slice(0, 10) : null,
      kontakte_anzahl: ks.length,
      kontakte_mit_email: ks.filter((k) => k.email).length,
      aufgebaut_am: heute.toISOString(),
    });
  }

  // Profile ohne Account und Dubletten unter den Accounts.
  for (const p of profile) {
    if (!p.account_sf_id)
      vorschlaege.push({
        account_sf_id: null, profil_sf_id: String(p.sf_id), art: "feld", feld: "account", quelle: "regel",
        beleg: `Ankaufsprofil ${p.name} hat keinen Account und erscheint deshalb nicht in der Investorenliste.`,
        ziel: "salesforce", sf_objekt: "Investorprofile__c", sf_feld: "Account__c", schluessel: `ohne_account:${p.sf_id}`,
      });
  }
  const investorIds = new Set(zeilen.map((z) => String(z.account_sf_id)));
  for (const [a, b] of dublettenPaare([...accounts.values()].map((x) => ({ id: String(x.sf_id), name: String(x.name) })))) {
    if (!investorIds.has(a.id) && !investorIds.has(b.id)) continue;
    const [x, y] = [a.id, b.id].sort();
    vorschlaege.push({
      account_sf_id: investorIds.has(a.id) ? a.id : b.id, art: "dublette", feld: "account",
      alter_wert: { id: x }, neuer_wert: { id: y }, quelle: "regel",
      beleg: `Gleicher Firmenname: „${a.name}“ und „${b.name}“. In Salesforce zusammenführen.`,
      ziel: "salesforce", sf_objekt: "Account", schluessel: `dublette:${x}:${y}`,
    });
  }

  return { zeilen, vorschlaege, zuordnung };
}

export async function investorenAufbauen(admin: SupabaseClient, heute = new Date()): Promise<AufbauErgebnis> {
  const { zeilen, vorschlaege, zuordnung } = investorenBerechnen(await rohdatenLaden(admin), heute);

  // Schreiben: Investoren ersetzen, Radar-Zuordnung setzen, neue Vorschläge ergänzen.
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error } = await admin.from("investoren").upsert(zeilen.slice(i, i + 500), { onConflict: "account_sf_id" });
    if (error) throw new Error(`investoren: ${error.message}`);
  }
  const { error: loeschFehler } = await admin.from("investoren").delete().lt("aufgebaut_am", heute.toISOString());
  if (loeschFehler) throw new Error(`investoren: ${loeschFehler.message}`);

  let radarZugeordnet = 0;
  for (const z of zuordnung) {
    if (z.account) radarZugeordnet++;
    await admin.from("markt_radar_meldungen").update({ investor_account_sf_id: z.account }).eq("id", z.id);
  }

  let neu = 0;
  const eindeutig = [...new Map(vorschlaege.map((v) => [v.schluessel, v])).values()];
  for (let i = 0; i < eindeutig.length; i += 500) {
    const { data, error } = await admin
      .from("investor_vorschlaege")
      .upsert(eindeutig.slice(i, i + 500), { onConflict: "schluessel", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`investor_vorschlaege: ${error.message}`);
    neu += data?.length ?? 0;
  }

  return {
    investoren: zeilen.length,
    mitProfil: zeilen.filter((z) => z.profil_sf_id).length,
    ohneProfil: zeilen.filter((z) => !z.profil_sf_id).length,
    aktiv: zeilen.filter((z) => z.status === "aktiv").length,
    neueVorschlaege: neu,
    radarZugeordnet,
  };
}
