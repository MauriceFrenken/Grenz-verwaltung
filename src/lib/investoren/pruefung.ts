/**
 * Investorenprüfung per KI-Websuche: Gibt es die Gesellschaft noch, ist sie insolvent, in
 * Liquidation oder gelöscht, und sucht sie aktuell (2026) Immobilien? Ergebnis mit Quellen,
 * die gegen die tatsächlich gefundenen URLs geprüft werden. Server-only.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalisiereUrl } from "@/lib/markt-radar/abgleich";

import type { Vorschlag } from "./aufbau";
import { NUTZUNGSARTEN } from "./typen";

const MODELL = "claude-opus-5-5";
const MAX_FORTSETZUNGEN = 4;
/** Firmen je KI-Aufruf: spart Kosten, bleibt aber gründlich. */
export const JE_AUFRUF = 5;

export type PruefStatus = "aktiv" | "insolvenz" | "liquidation" | "geloescht" | "unklar";

export type PruefKandidat = {
  schluessel: string;
  firma: string;
  webseite: string | null;
  ort: string | null;
};

export type WebKontakt = {
  name: string | null;
  funktion: string | null;
  email: string | null;
  telefon: string | null;
  quelleUrl: string | null;
};

export type WebProfil = {
  nutzungen: string[];
  volumenMin: number | null;
  volumenMax: number | null;
  regionen: string[];
  faktorMax: number | null;
  einheitenMin: number | null;
};

export type PruefErgebnis = {
  schluessel: string;
  status: PruefStatus;
  begruendung: string;
  quelleUrl: string | null;
  webseite: string | null;
  ankaufsprofilUrl: string | null;
  ankaufsprofilKurz: string | null;
  aktiv2026: boolean | null;
  letzteAktivitaet: string | null;
  profil: WebProfil | null;
  kontakte: WebKontakt[];
};

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

const SYSTEM = `Du prüfst für Grenz & Co. (Investmentmakler, Düsseldorf) Immobilieninvestoren, bevor sie in die Investorendatenbank kommen.

Für jede Firma:
1. Existiert die Gesellschaft noch und ist sie geschäftlich aktiv? Suche nach Insolvenzbekanntmachungen (insolvenzbekanntmachungen.de, Presse), Liquidation („i. L.“), Löschung im Handelsregister, Umfirmierung oder Verschmelzung.
2. Hat sie eine Website mit aktuellem Ankaufsprofil? Wenn ja: Link und Kriterien in einem Satz (Objektart, Region, Volumen, Faktor).
3. Gibt es Hinweise auf Ankäufe oder Ankaufsaktivität im Jahr 2025 oder 2026?
4. Wenn es ein Ankaufsprofil gibt: die Kriterien strukturiert (Nutzungsarten, Volumen von/bis in Euro, Regionen, maximaler Faktor, Einheiten ab).
5. Ansprechpartner für den Ankauf: bis zu drei Personen mit Funktion, geschäftlicher E-Mail und Telefon, nur von der Firmenwebsite (Ankauf, Team, Kontakt, Impressum). Eine allgemeine Ankaufsadresse wie ankauf@ zählt auch. Keine privaten Daten, keine geratenen E-Mail-Muster.

Regeln: Nur belegte Aussagen mit exakter Quell-URL. Bei gleichnamigen Firmen auf Ort und Website achten. Wenn nichts zu finden ist, Status „unklar“, nicht raten.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["firmen"],
  properties: {
    firmen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "schluessel", "status", "begruendung", "quelleUrl", "webseite",
          "ankaufsprofilUrl", "ankaufsprofilKurz", "aktiv2026", "letzteAktivitaet", "profil", "kontakte",
        ],
        properties: {
          schluessel: { type: "string" },
          status: { type: "string", enum: ["aktiv", "insolvenz", "liquidation", "geloescht", "unklar"] },
          begruendung: { type: "string", description: "Ein Satz mit dem Beleg" },
          quelleUrl: { type: ["string", "null"] },
          webseite: { type: ["string", "null"] },
          ankaufsprofilUrl: { type: ["string", "null"] },
          ankaufsprofilKurz: { type: ["string", "null"] },
          aktiv2026: { type: ["boolean", "null"], description: "Ankauf oder Ankaufsprofil 2025/2026 belegt" },
          letzteAktivitaet: { type: ["string", "null"], description: "z. B. „03/2026 Ankauf MFH in Köln“" },
          profil: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["nutzungen", "volumenMin", "volumenMax", "regionen", "faktorMax", "einheitenMin"],
            properties: {
              nutzungen: { type: "array", items: { type: "string", enum: [...NUTZUNGSARTEN] } },
              volumenMin: { type: ["number", "null"], description: "in Euro" },
              volumenMax: { type: ["number", "null"], description: "in Euro" },
              regionen: { type: "array", items: { type: "string" } },
              faktorMax: { type: ["number", "null"] },
              einheitenMin: { type: ["number", "null"] },
            },
          },
          kontakte: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "funktion", "email", "telefon", "quelleUrl"],
              properties: {
                name: { type: ["string", "null"] },
                funktion: { type: ["string", "null"] },
                email: { type: ["string", "null"] },
                telefon: { type: ["string", "null"] },
                quelleUrl: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Prüft bis zu JE_AUFRUF Firmen. URLs, die die Websuche nicht geliefert hat, werden verworfen. */
export async function firmenPruefen(kandidaten: PruefKandidat[]): Promise<{
  ergebnisse: PruefErgebnis[];
  usage: { input: number; output: number; suchen: number };
}> {
  const ki = client();
  const liste = kandidaten
    .map((k) => `- Schlüssel ${k.schluessel}: ${k.firma}${k.ort ? `, ${k.ort}` : ""}${k.webseite ? `, Website ${k.webseite}` : ""}`)
    .join("\n");
  const nachrichten: Anthropic.MessageParam[] = [
    { role: "user", content: `Heute ist der ${new Date().toISOString().slice(0, 10)}. Prüfe diese Firmen:\n${liste}\n\nSchreibe am Ende je Firma einen Absatz mit Schlüssel, Ergebnis und Quell-URLs.` },
  ];
  const urls = new Set<string>();
  const usage = { input: 0, output: 0, suchen: 0 };
  let bericht = "";
  for (let runde = 0; runde <= MAX_FORTSETZUNGEN; runde++) {
    const antwort = await ki.messages
      .stream({
        model: MODELL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: "low" },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 4 * kandidaten.length },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 * kandidaten.length },
        ],
        messages: nachrichten,
      })
      .finalMessage();
    usage.input += antwort.usage.input_tokens;
    usage.output += antwort.usage.output_tokens;
    usage.suchen += antwort.usage.server_tool_use?.web_search_requests ?? 0;
    for (const block of antwort.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) urls.add(r.url);
      } else if (block.type === "web_fetch_tool_result") {
        const inhalt = block.content as { type?: string; url?: string };
        if (inhalt.type === "web_fetch_result" && inhalt.url) urls.add(inhalt.url);
      } else if (block.type === "text") {
        bericht += block.text;
      }
    }
    if (antwort.stop_reason === "refusal") throw new Error("Die KI hat die Prüfung abgelehnt.");
    if (antwort.stop_reason !== "pause_turn") break;
    nachrichten.push({ role: "assistant", content: antwort.content });
  }

  const struktur = await ki.messages
    .stream({
      model: MODELL,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: "Überführe den Prüfbericht in die Felder. Nur, was im Bericht steht; URLs exakt kopieren. Ein Eintrag je Schlüssel.",
      messages: [{ role: "user", content: `Schlüssel: ${kandidaten.map((k) => k.schluessel).join(", ")}\n\nBericht:\n${bericht}` }],
    })
    .finalMessage();
  usage.input += struktur.usage.input_tokens;
  usage.output += struktur.usage.output_tokens;
  const text = struktur.content.find((b) => b.type === "text");
  const roh = text && text.type === "text" ? (JSON.parse(text.text) as { firmen: PruefErgebnis[] }).firmen : [];

  const gefunden = new Set([...urls].map((u) => normalisiereUrl(u)).filter(Boolean));
  const belegt = (u: string | null) => (u && gefunden.has(normalisiereUrl(u)) ? u : null);
  const bekannt = new Set(kandidaten.map((k) => k.schluessel));
  const ergebnisse = roh
    .filter((e) => bekannt.has(e.schluessel))
    .map((e) => {
      const quelleUrl = belegt(e.quelleUrl);
      // Ohne belegte Quelle keine harte Aussage über Insolvenz oder Löschung.
      const status: PruefStatus = e.status !== "aktiv" && e.status !== "unklar" && !quelleUrl ? "unklar" : e.status;
      // Kontakte nur mit belegter Seite und echter E-Mail oder Telefonnummer.
      const kontakte = (e.kontakte ?? []).filter(
        (k) => belegt(k.quelleUrl) && ((k.email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(k.email)) || k.telefon),
      );
      const profilUrl = belegt(e.ankaufsprofilUrl);
      return {
        ...e,
        status,
        quelleUrl,
        ankaufsprofilUrl: profilUrl ?? e.ankaufsprofilUrl,
        // Strukturierte Kriterien nur, wenn die Profilseite tatsächlich gefunden wurde.
        profil: profilUrl ? e.profil : null,
        kontakte,
      };
    });
  return { ergebnisse, usage };
}

/** Was zu einem Salesforce-Investor schon bekannt ist, damit nur Lücken vorgeschlagen werden. */
export type InvestorBestand = {
  acc: string;
  firma: string;
  profilSfId: string | null;
  nutzungen: string[];
  volumenMin: number | null;
  volumenMax: number | null;
  faktorMax: number | null;
  einheitenMin: number | null;
  /** E-Mails, die in Salesforce schon irgendwo stehen (klein geschrieben). */
  bekannteEmails: Set<string>;
};

const GUELTIGE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Vorschläge aus der Webrecherche für einen Salesforce-Investor: neues Ankaufsprofil, wenn
 * keines hinterlegt ist, sonst nur leere Kriterien; neue Ansprechpartner mit E-Mail. Alles geht
 * in die Prüfliste und erst nach Freigabe nach Salesforce.
 */
export function anreicherungsVorschlaege(e: PruefErgebnis, b: InvestorBestand): Vorschlag[] {
  const v: Vorschlag[] = [];
  const beleg = (url: string | null, text: string) => `${b.firma}: ${text}${url ? ` Quelle: ${url}` : ""}`;
  const p = e.profil;
  const nutzungen = (p?.nutzungen ?? []).filter((n) => (NUTZUNGSARTEN as readonly string[]).includes(n));
  const hatKriterien = p && (nutzungen.length || p.volumenMin != null || p.volumenMax != null);
  if (p && hatKriterien && e.status === "aktiv") {
    if (!b.profilSfId) {
      v.push({
        account_sf_id: b.acc, art: "neues_profil", feld: "profil", alter_wert: null,
        neuer_wert: {
          nutzungen, regionen: p.regionen, volumen_min: p.volumenMin, volumen_max: p.volumenMax,
          faktor_max: p.faktorMax, einheiten_min: p.einheitenMin,
        },
        quelle: "ki", beleg: beleg(e.ankaufsprofilUrl, e.ankaufsprofilKurz ?? "Ankaufsprofil auf der Website."),
        ziel: "salesforce", sf_objekt: "Investorprofile__c", schluessel: `web_profil:${b.acc}`,
      });
    } else {
      const profil = b.profilSfId;
      const basis = { account_sf_id: b.acc, profil_sf_id: profil, art: "feld" as const, quelle: "ki" as const, ziel: "salesforce" as const, sf_objekt: "Investorprofile__c" };
      const text = beleg(e.ankaufsprofilUrl, e.ankaufsprofilKurz ?? "Ankaufsprofil auf der Website.");
      if (!b.nutzungen.length && nutzungen.length)
        v.push({ ...basis, feld: "nutzungen", alter_wert: [], neuer_wert: nutzungen, beleg: text, sf_feld: "Nutzungsarten__c", schluessel: `web_nutzungen:${profil}` });
      if (b.volumenMin == null && b.volumenMax == null && (p.volumenMin != null || p.volumenMax != null))
        v.push({
          ...basis, feld: "volumen", alter_wert: { min: null, max: null }, neuer_wert: { min: p.volumenMin, max: p.volumenMax },
          beleg: text, sf_feld: "Objektvolumen_Min_Mio__c,Objektvolumen_Max_Mio__c", schluessel: `web_volumen:${profil}`,
        });
      if (b.faktorMax == null && p.faktorMax != null)
        v.push({ ...basis, feld: "faktor_max", alter_wert: null, neuer_wert: p.faktorMax, beleg: text, sf_feld: "Multiplikator_bis_fach__c", schluessel: `web_faktor:${profil}` });
      if (b.einheitenMin == null && p.einheitenMin != null)
        v.push({ ...basis, feld: "einheiten_min", alter_wert: null, neuer_wert: p.einheitenMin, beleg: text, sf_feld: "AnzahlEinheitenMin__c", schluessel: `web_einheiten:${profil}` });
    }
  }
  if (e.status === "aktiv" || e.status === "unklar") {
    const gesehen = new Set<string>();
    for (const k of e.kontakte) {
      const email = k.email?.trim().toLowerCase();
      if (!email || !GUELTIGE_EMAIL.test(email) || b.bekannteEmails.has(email) || gesehen.has(email)) continue;
      gesehen.add(email);
      v.push({
        account_sf_id: b.acc, art: "feld", feld: "kontakt", alter_wert: null,
        neuer_wert: { name: k.name, funktion: k.funktion, email, telefon: k.telefon },
        quelle: "ki", beleg: beleg(k.quelleUrl, `Ansprechpartner laut Website${k.funktion ? ` (${k.funktion})` : ""}.`),
        ziel: "salesforce", sf_objekt: "Contact", schluessel: `web_kontakt:${b.acc}:${email}`,
      });
    }
  }
  return v;
}

/** Ergänzt einen Listeneintrag direkt um die Funde der Recherche (nur leere Felder, E-Mails vereint). */
export function quellenErgaenzung(
  e: PruefErgebnis,
  q: { emails: string[] | null; telefon: string | null; webseite: string | null; nutzungen: string[] | null; volumen_min: number | string | null; volumen_max: number | string | null },
): Record<string, unknown> {
  const neu: Record<string, unknown> = {};
  const alt = (q.emails ?? []).map((m) => m.toLowerCase());
  const funde = e.kontakte.map((k) => k.email?.trim().toLowerCase()).filter((m): m is string => !!m && GUELTIGE_EMAIL.test(m));
  const emails = [...new Set([...alt, ...funde])];
  if (emails.length !== alt.length) neu.emails = emails;
  const telefon = e.kontakte.find((k) => k.telefon)?.telefon;
  if (!q.telefon && telefon) neu.telefon = telefon;
  if (!q.webseite && e.webseite) neu.webseite = e.webseite;
  if (e.profil && e.status === "aktiv") {
    if (!(q.nutzungen ?? []).length && e.profil.nutzungen.length) neu.nutzungen = e.profil.nutzungen;
    if (q.volumen_min == null && q.volumen_max == null) {
      if (e.profil.volumenMin != null) neu.volumen_min = e.profil.volumenMin;
      if (e.profil.volumenMax != null) neu.volumen_max = e.profil.volumenMax;
    }
  }
  return neu;
}

/**
 * Salesforce-Investoren, die schon auf Existenz geprüft wurden, bevor die Recherche auch
 * Ankaufsprofil und Ansprechpartner erfasste (Spalte lusha noch leer). Sie kommen vor den
 * ungeprüften Listen dran, weil sie für das Matching zählen.
 */
async function nachzuholen(admin: SupabaseClient, anzahl: number): Promise<PruefKandidat[]> {
  const { data, error } = await admin
    .from("investor_pruefungen")
    .select("schluessel, firma, webseite")
    .like("schluessel", "acc:%")
    .is("lusha", null)
    .in("status", ["aktiv", "unklar"])
    .order("geprueft_am")
    .limit(anzahl);
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => ({ schluessel: z.schluessel, firma: z.firma, webseite: z.webseite, ort: null }));
}

async function bestandLaden(admin: SupabaseClient, ergebnisse: PruefErgebnis[]): Promise<Map<string, InvestorBestand>> {
  const accs = ergebnisse.filter((e) => e.schluessel.startsWith("acc:")).map((e) => e.schluessel.slice(4));
  const emails = ergebnisse.flatMap((e) => e.kontakte.map((k) => k.email?.trim().toLowerCase())).filter((m): m is string => !!m);
  if (!accs.length) return new Map();
  const [inv, kon] = await Promise.all([
    admin.from("investoren").select("account_sf_id, name, profil_sf_id, nutzungen, volumen_min, volumen_max, faktor_max, einheiten_min").in("account_sf_id", accs),
    emails.length ? admin.from("sf_kontakte").select("email").in("email", emails) : Promise.resolve({ data: [], error: null }),
  ]);
  if (inv.error) throw new Error(inv.error.message);
  if (kon.error) throw new Error(kon.error.message);
  const bekannt = new Set((kon.data ?? []).map((k: { email: string | null }) => String(k.email ?? "").toLowerCase()));
  const zahl = (w: unknown) => (w == null || w === "" ? null : Number(w));
  return new Map(
    (inv.data ?? []).map((i) => [
      `acc:${i.account_sf_id}`,
      {
        acc: i.account_sf_id, firma: i.name, profilSfId: i.profil_sf_id, nutzungen: i.nutzungen ?? [],
        volumenMin: zahl(i.volumen_min), volumenMax: zahl(i.volumen_max), faktorMax: zahl(i.faktor_max), einheitenMin: zahl(i.einheiten_min),
        bekannteEmails: bekannt,
      },
    ]),
  );
}

/** Funde der Recherche ablegen: Vorschläge für Salesforce-Investoren, Listeneinträge direkt ergänzen. */
async function anreichern(admin: SupabaseClient, ergebnisse: PruefErgebnis[]): Promise<number> {
  const bestand = await bestandLaden(admin, ergebnisse);
  const vorschlaege = ergebnisse.flatMap((e) => {
    const b = bestand.get(e.schluessel);
    return b ? anreicherungsVorschlaege(e, b) : [];
  });
  let neu = 0;
  if (vorschlaege.length) {
    const { data, error } = await admin
      .from("investor_vorschlaege")
      .upsert(vorschlaege, { onConflict: "schluessel", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`investor_vorschlaege: ${error.message}`);
    neu = data?.length ?? 0;
  }
  const listen = ergebnisse.filter((e) => e.schluessel.startsWith("quelle:"));
  if (listen.length) {
    const { data, error } = await admin
      .from("investor_quellen")
      .select("schluessel, emails, telefon, webseite, nutzungen, volumen_min, volumen_max")
      .in("schluessel", listen.map((e) => e.schluessel.slice(7)));
    if (error) throw new Error(error.message);
    for (const q of data ?? []) {
      const e = listen.find((x) => x.schluessel === `quelle:${q.schluessel}`)!;
      const werte = quellenErgaenzung(e, q);
      if (!Object.keys(werte).length) continue;
      const { error: f } = await admin.from("investor_quellen").update(werte).eq("schluessel", q.schluessel);
      if (f) throw new Error(f.message);
    }
  }
  return neu;
}

/**
 * Ein Prüflauf: holt zuerst Profil und Ansprechpartner bereits geprüfter Salesforce-Investoren
 * nach, nimmt dann die wichtigsten ungeprüften Firmen (Salesforce-Investoren zuerst, dann Listen
 * nach Passung), prüft sie und speichert Ergebnis und Funde. Für Cron in kleinen Paketen.
 */
export async function pruefLauf(
  admin: SupabaseClient,
  anzahl = 20,
): Promise<{ geprueft: number; auffaellig: number; vorschlaege: number }> {
  const kandidaten = await nachzuholen(admin, anzahl);
  if (kandidaten.length < anzahl) {
    const { data: offen, error } = await admin.rpc("investor_pruefung_kandidaten", { anzahl: anzahl - kandidaten.length });
    if (error) throw new Error(error.message);
    kandidaten.push(...((offen ?? []) as PruefKandidat[]));
  }
  let geprueft = 0;
  let auffaellig = 0;
  let vorschlaege = 0;
  for (let i = 0; i < kandidaten.length; i += JE_AUFRUF) {
    const paket = kandidaten.slice(i, i + JE_AUFRUF);
    const { ergebnisse } = await firmenPruefen(paket);
    const je = new Map(ergebnisse.map((e) => [e.schluessel, e]));
    const zeilen = paket.map((k) => {
      const e = je.get(k.schluessel);
      return {
        schluessel: k.schluessel,
        firma: k.firma,
        status: e?.status ?? "unklar",
        begruendung: e?.begruendung ?? "Kein Ergebnis der Recherche.",
        quelle_url: e?.quelleUrl ?? null,
        webseite: e?.webseite ?? k.webseite,
        ankaufsprofil_url: e?.ankaufsprofilUrl ?? null,
        ankaufsprofil_kurz: e?.ankaufsprofilKurz ?? null,
        aktiv_2026: e?.aktiv2026 ?? null,
        letzte_aktivitaet: e?.letzteAktivitaet ?? null,
        // Webfunde (Profil, Ansprechpartner); Lusha-Ergebnisse kommen unter eigenem Schlüssel dazu.
        lusha: { web: { am: new Date().toISOString(), profil: e?.profil ?? null, kontakte: e?.kontakte ?? [] } },
        geprueft_am: new Date().toISOString(),
      };
    });
    const { error: f } = await admin.from("investor_pruefungen").upsert(zeilen, { onConflict: "schluessel" });
    if (f) throw new Error(f.message);
    vorschlaege += await anreichern(admin, ergebnisse);
    geprueft += zeilen.length;
    auffaellig += zeilen.filter((z) => z.status !== "aktiv" && z.status !== "unklar").length;
  }
  return { geprueft, auffaellig, vorschlaege };
}
