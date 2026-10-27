/**
 * Server-Funktionen des Gesellschafterberichts. Lesen (Entwurf, Historie) darf jeder
 * angemeldete Benutzer; Freigabe und Senden nur Geschäftsführung bzw. Administratoren.
 * Gesendet wird ausschließlich hier auf dem Server mit FRENKEN_BERICHT_URL und
 * FRENKEN_BERICHT_SCHLUESSEL (nie VITE_*, nie im Browser). Kein Zugriff auf die
 * FRENKEN-Datenbank: Die FRENKEN-App erhält nur das JSON laut Schnittstelle.
 */

import { createServerFn } from "@tanstack/react-start";

import { GRENZ_GESELLSCHAFT_ID } from "@/lib/grenz";
import { kennzahlenAusDatenbank } from "@/lib/kennzahlen/laden";
import {
  ADMIN_ROLLEN,
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  entwurfBerechnen,
  inhaltBauen,
  inhaltPruefen,
  istPeriode,
  monatsgrenzen,
  vormonat,
  type EntwurfEingabe,
} from "./berechnen";
import {
  HAUPTWERTE,
  KOMMENTAR_MAX,
  MAKLER_KENNZAHLEN,
  type BerichtArt,
  type BerichtFormular,
  type BerichtInhalt,
  type Feldname,
  type GesellschafterberichtDto,
  type GesendeterBericht,
  type SendeErgebnis,
} from "./typen";

type Admin = ReturnType<typeof createServiceRoleClient>;
type Roh = Record<string, unknown>;

const SPALTEN =
  "id, periode, art, inhalt, freigegeben_von, freigegeben_am, gesendet_am, antwort_status, antwort_text, erfolgreich";
const MAX_BYTES = 32 * 1024;
/** So lange nach der Vorschau darf mit derselben Freigabe gesendet werden. */
const FREIGABE_GUELTIG_MS = 60 * 60 * 1000;
const ZEITLIMIT_MS = 20_000;

function heuteIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function konfiguration(): { url: string; schluessel: string } | null {
  const url = env("FRENKEN_BERICHT_URL");
  const schluessel = env("FRENKEN_BERICHT_SCHLUESSEL");
  return url && schluessel ? { url, schluessel } : null;
}

const NICHT_KONFIGURIERT =
  "Die Schnittstelle zur FRENKEN-App ist nicht eingerichtet: FRENKEN_BERICHT_URL und FRENKEN_BERICHT_SCHLUESSEL fehlen in den Server-Variablen (Vercel).";

function tabellenFehler(message: string): Error {
  return new Error(
    /gesellschafter_berichte/.test(message) &&
      /does not exist|schema cache/i.test(message)
      ? "Die Tabelle für Gesellschafterberichte ist noch nicht angelegt (Migration 20261027190000_gesellschafter_berichte)."
      : message,
  );
}

function zahl(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function artAus(v: unknown): BerichtArt {
  if (v === "ist" || v === "plan") return v;
  throw new Error("Ungültige Art (ist oder plan).");
}

function periodeAus(v: unknown, art: BerichtArt): string {
  if (!istPeriode(v)) throw new Error("Ungültiger Monat (JJJJ-MM).");
  if (art === "ist" && v > heuteIso().slice(0, 7))
    throw new Error("Ein Ist-Bericht darf nicht in der Zukunft liegen.");
  return v;
}

function formularAus(roh: unknown): BerichtFormular {
  const d = (roh ?? {}) as Roh;
  const art = artAus(d.art);
  const werteRoh = (d.werte ?? {}) as Roh;
  const werte = {} as Record<Feldname, number | null>;
  for (const k of [...HAUPTWERTE, ...MAKLER_KENNZAHLEN]) werte[k] = zahl(werteRoh[k]);
  const kommentar = typeof d.kommentar === "string" ? d.kommentar : "";
  if (kommentar.trim().length > KOMMENTAR_MAX)
    throw new Error(`Der Kommentar darf höchstens ${KOMMENTAR_MAX} Zeichen haben.`);
  return { periode: periodeAus(d.periode, art), art, werte, kommentar };
}

function berichtAus(r: Roh): GesendeterBericht {
  return {
    id: String(r.id),
    periode: String(r.periode),
    art: r.art === "plan" ? "plan" : "ist",
    inhalt: r.inhalt as BerichtInhalt,
    freigegebenVon: String(r.freigegeben_von),
    freigegebenAm: String(r.freigegeben_am),
    gesendetAm: text(r.gesendet_am),
    antwortStatus: zahl(r.antwort_status),
    antwortText: text(r.antwort_text),
    erfolgreich: r.erfolgreich === true,
  };
}

async function profilName(admin: Admin, userId: string): Promise<string | null> {
  if (userId === "cron") return null;
  const { data } = await admin
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return name || null;
}

/** Freigeben und senden: Geschäftsführung bzw. Administratoren, nie der Cron. */
async function freigebender(token: string) {
  const aufrufer = await pruefeAufrufer(token, "admin");
  if (aufrufer.userId === "cron")
    throw new Error("Berichte gibt nur ein Mensch frei.");
  const admin = createServiceRoleClient();
  const name = await profilName(admin, aufrufer.userId);
  if (!name)
    throw new Error(
      "In Ihrem Benutzerprofil fehlt der Name. Er wird als „freigegeben von“ gesendet.",
    );
  return { admin, userId: aufrufer.userId, name };
}

// --- Entwurf aus den Daten der App -----------------------------------------

async function entwurfEingabe(
  admin: Admin,
  periode: string,
  art: BerichtArt,
): Promise<EntwurfEingabe> {
  const heute = heuteIso();
  const basis: EntwurfEingabe = {
    periode,
    art,
    heute,
    finanzen: null,
    unternehmenszahlen: [],
    personal: null,
    mandate: [],
    deals: [],
    salesforceStand: null,
  };
  if (art === "plan") return basis;

  const { start, ende } = monatsgrenzen(periode);
  const [finanzen, zahlen, personal, mandate, deals, stand] = await Promise.all([
    kennzahlenAusDatenbank(admin, Number(periode.slice(0, 4)), heute).catch(
      () => null,
    ),
    admin
      .from("unternehmenszahlen")
      .select("quelle, kennzahl, betrag, dokument_ref")
      .eq("gesellschaft_id", GRENZ_GESELLSCHAFT_ID)
      .eq("periode_von", start)
      .eq("periode_bis", ende)
      .in("kennzahl", ["umsatz", "rohertrag", "ebitda", "ergebnis"]),
    // Nur Ein- und Austritt, keine Namen oder sonstigen Personaldaten.
    admin
      .from("personal_mitarbeiter")
      .select("eintritt_am, austritt_am, vertragsart")
      .limit(1000),
    admin
      .from("sf_mandate")
      .select("name, status, angebotspreis, beauftragt_am")
      .limit(5000),
    admin
      .from("sf_deals")
      .select(
        "name, abschluss_am, betrag, gewonnen:sf_daten->IsWon, provision:sf_daten->Provision_in__c, kaufpreis:sf_daten->Beurkundeter_Kaufpreis_in__c",
      )
      .gte("abschluss_am", start)
      .lte("abschluss_am", ende)
      .limit(5000),
    admin
      .from("sf_sync_stand")
      .select("letzter_abruf_am")
      .not("letzter_abruf_am", "is", null),
  ]);

  const monat = finanzen?.monate.find((m) => m.monat === periode) ?? null;
  const stichtage = (finanzen?.konten ?? [])
    .map((k) => k.saldoStichtag)
    .filter((s): s is string => !!s)
    .sort();

  return {
    ...basis,
    finanzen:
      finanzen && finanzen.konten.length > 0
        ? {
            monat: monat
              ? {
                  einnahmen: monat.einnahmen,
                  ausgaben: monat.ausgaben,
                  provisionen: monat.provisionen,
                  saldo: monat.saldo,
                }
              : null,
            kontenMitSaldo: finanzen.konten.filter((k) => k.saldo !== null).length,
            saldoStichtag: stichtage.at(-1) ?? null,
          }
        : null,
    unternehmenszahlen: (zahlen.error ? [] : (zahlen.data ?? [])).map((u) => ({
      quelle: String(u.quelle),
      kennzahl: String(u.kennzahl),
      betrag: Number(u.betrag),
      dokumentRef: text(u.dokument_ref),
    })),
    personal: personal.error
      ? null
      : (personal.data ?? []).map((p) => ({
          eintrittAm: text(p.eintritt_am),
          austrittAm: text(p.austritt_am),
          vertragsart: text(p.vertragsart),
        })),
    mandate: (mandate.error ? [] : (mandate.data ?? [])).map((m) => ({
      name: String(m.name),
      status: text(m.status),
      angebotspreis: zahl(m.angebotspreis),
      beauftragtAm: text(m.beauftragt_am),
    })),
    deals: (deals.error ? [] : (deals.data ?? [])).map((d) => ({
      name: String(d.name),
      gewonnen: d.gewonnen === true,
      abschlussAm: text(d.abschluss_am),
      provision: zahl(d.provision),
      kaufpreis: zahl(d.kaufpreis) ?? zahl(d.betrag),
    })),
    salesforceStand:
      (stand.error ? [] : (stand.data ?? []))
        .map((s) => String(s.letzter_abruf_am))
        .sort()
        .at(-1) ?? null,
  };
}

export const gesellschafterberichtLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Roh;
    const art = d.art === undefined ? "ist" : artAus(d.art);
    return {
      supabaseAccessToken: tokenAus(data),
      art,
      periode:
        d.periode === undefined
          ? vormonat(heuteIso())
          : periodeAus(d.periode, art),
    };
  })
  .handler(async ({ data }): Promise<GesellschafterberichtDto> => {
    const aufrufer = await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const [eingabe, historie, name] = await Promise.all([
      entwurfEingabe(admin, data.periode, data.art),
      admin
        .from("gesellschafter_berichte")
        .select(SPALTEN)
        .order("created_at", { ascending: false })
        .limit(100),
      profilName(admin, aufrufer.userId),
    ]);
    return {
      entwurf: entwurfBerechnen(eingabe),
      historie: historie.error ? [] : (historie.data ?? []).map(berichtAus),
      einrichtungsHinweis: historie.error
        ? tabellenFehler(historie.error.message).message
        : null,
      darfFreigeben:
        aufrufer.userId !== "cron" && ADMIN_ROLLEN.has(aufrufer.rolle),
      konfiguriert: konfiguration() !== null,
      freigabeName: name,
    };
  });

/**
 * Baut den exakten Inhalt mit Freigabe (Name aus dem Profil, Zeitpunkt jetzt) und prüft ihn.
 * Der Bestätigungsdialog zeigt genau dieses JSON, das Senden schickt es unverändert.
 */
export const gesellschafterberichtVorschauFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    formular: formularAus((data as Roh | null)?.formular),
  }))
  .handler(
    async ({ data }): Promise<{ inhalt: BerichtInhalt; fehler: string[] }> => {
      const { name } = await freigebender(data.supabaseAccessToken);
      if (!konfiguration()) throw new Error(NICHT_KONFIGURIERT);
      const inhalt = inhaltBauen(data.formular, {
        von: name,
        am: new Date().toISOString(),
      });
      return { inhalt, fehler: inhaltPruefen(inhalt, heuteIso()) };
    },
  );

export const gesellschafterberichtSendenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Roh;
    const inhalt = d.inhalt as Roh | undefined;
    const fehler = inhaltPruefen(inhalt, heuteIso());
    if (fehler.length) throw new Error(fehler.join(" "));
    const roh = inhalt as unknown as BerichtInhalt;
    // Neu aufbauen: nur die Felder der Schnittstelle, in fester Reihenfolge.
    const neu = inhaltBauen(
      {
        periode: roh.periode,
        art: roh.art,
        werte: {
          umsatz: roh.umsatz ?? null,
          rohertrag: roh.rohertrag ?? null,
          ebitda: roh.ebitda ?? null,
          ergebnis: roh.ergebnis ?? null,
          liquiditaet: roh.liquiditaet ?? null,
          mitarbeiter: roh.mitarbeiter ?? null,
          mandate: roh.kennzahlen?.mandate ?? null,
          pipeline: roh.kennzahlen?.pipeline ?? null,
          abschluesse: roh.kennzahlen?.abschluesse ?? null,
          provisionsquote: roh.kennzahlen?.provisionsquote ?? null,
          forderungen: roh.kennzahlen?.forderungen ?? null,
        },
        kommentar: roh.kommentar ?? "",
      },
      { von: roh.freigegeben_von, am: roh.freigegeben_am },
    );
    return { supabaseAccessToken: tokenAus(data), inhalt: neu };
  })
  .handler(async ({ data }): Promise<SendeErgebnis> => {
    const { admin, userId, name } = await freigebender(data.supabaseAccessToken);
    const ziel = konfiguration();
    if (!ziel) throw new Error(NICHT_KONFIGURIERT);
    if (!/^https:\/\//i.test(ziel.url))
      throw new Error("FRENKEN_BERICHT_URL muss mit https:// beginnen.");

    const { inhalt } = data;
    if (inhalt.freigegeben_von !== name)
      throw new Error("Die Freigabe gehört zu einem anderen Benutzer. Bitte erneut prüfen.");
    const alter = Date.now() - Date.parse(inhalt.freigegeben_am);
    if (alter < -60_000 || alter > FREIGABE_GUELTIG_MS)
      throw new Error("Die Freigabe ist abgelaufen. Bitte den Bericht erneut prüfen und freigeben.");

    const koerper = JSON.stringify(inhalt);
    if (new TextEncoder().encode(koerper).length > MAX_BYTES)
      throw new Error("Der Bericht ist größer als 32 KB. Bitte den Kommentar kürzen.");

    // Erst protokollieren, dann senden: Jeder Sendeversuch steht in der Historie.
    const { data: zeile, error } = await admin
      .from("gesellschafter_berichte")
      .insert({
        periode: inhalt.periode,
        art: inhalt.art,
        inhalt,
        freigegeben_von: inhalt.freigegeben_von,
        freigegeben_von_id: userId,
        freigegeben_am: inhalt.freigegeben_am,
      })
      .select("id")
      .single();
    if (error) throw tabellenFehler(error.message);

    let antwortStatus: number | null = null;
    let antwortText: string;
    try {
      const antwort = await fetch(ziel.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ziel.schluessel}`,
          "Content-Type": "application/json",
        },
        body: koerper,
        signal: AbortSignal.timeout(ZEITLIMIT_MS),
      });
      antwortStatus = antwort.status;
      antwortText = (await antwort.text()).slice(0, 4000);
    } catch (err) {
      antwortText = `Keine Antwort: ${err instanceof Error ? err.message : String(err)}`.slice(
        0,
        4000,
      );
    }
    const erfolgreich = antwortStatus === 200;

    const { data: fertig, error: e2 } = await admin
      .from("gesellschafter_berichte")
      .update({
        gesendet_am: new Date().toISOString(),
        antwort_status: antwortStatus,
        antwort_text: antwortText,
        erfolgreich,
      })
      .eq("id", String(zeile.id))
      .select(SPALTEN)
      .single();
    if (e2) throw tabellenFehler(e2.message);

    return {
      erfolgreich,
      antwortStatus,
      antwortText,
      bericht: berichtAus(fertig),
    };
  });
