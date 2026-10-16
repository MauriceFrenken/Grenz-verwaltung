/**
 * Postfach-Datenhinweise erkennen. Server-only.
 *
 * Geht analysierte Postfach-Einträge durch, die noch nicht geprüft sind,
 * und fragt die KI, ob Mail oder Anhang eine Zahl im Board verändert
 * (Mieterhöhung, Bescheid, Mahnung, Kaufvertrag …). Treffer landen in
 * `postfach_datenhinweise` und erscheinen unter Datenqualität.
 */
import {
  anthropicNachricht,
  type DokumentVisionBlock,
} from "@/lib/dokument-ai";
import { graphAnhangBinary } from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";

import { baueAnhangAnalyseKontext, baueMailKontext } from "./anhang-kontext";
import {
  hinweiseAusAntwort,
  hinweisSchluessel,
  type HinweisVorschlag,
} from "./datenwirkung-logik";

export const HINWEISE = "postfach_datenhinweise";
const POSTEINGANG = "dokument_posteingang";
/** Einträge je Aufruf aus der Oberfläche (innerhalb maxDuration) */
const BATCH_UI = 6;
/** Nur Post der letzten Tage nachholen, ältere ist meist schon erledigt */
const RUECKBLICK_TAGE = 60;
export const MAX_ANHANG_BYTES = 25 * 1024 * 1024;
export const MAX_FEHLER_IN_FOLGE = 3;

const SYSTEM = `
Du prüfst eingehende Post (E-Mails und Anhänge) und neue Dateien in der OneDrive-Ablage von Grenz & Co., eines Immobilienunternehmens (Aufteiler und Bestandshalter). Das Management Board rechnet Mieten, Cashflow je Objekt, Liquidität je Gesellschaft, Darlehen und Kauf/Verkauf. Deine Aufgabe: erkennen, ob dieses Dokument eine Zahl im Board verändert oder eine Zahlung auslöst.

Melde einen Hinweis nur für:
- mieterhoehung: Mieterhöhungsverlangen, Staffel- oder Indexanpassung, Zustimmung dazu (neue Kaltmiete, ab wann)
- mieterwechsel: Kündigung, Auszug, Einzug, neuer Mietvertrag, Mietaufhebung
- nebenkosten: Nebenkosten-/Betriebskostenabrechnung, Anpassung der NK-Vorauszahlung
- feste_kosten: Bescheid oder Beitragsrechnung zu wiederkehrenden Objektkosten (Grundsteuer, Grundbesitzabgaben, Abfall/Straßenreinigung, Gebäudeversicherung, Wartungsvertrag, Hausgeld) mit neuem oder geändertem Betrag
- zahlungsforderung: Mahnung, Zahlungserinnerung, Steuer- oder Behördenbescheid mit Nachzahlung oder Erstattung, Kautions- oder Schadensforderung, einmalige Rechnung ab 2.500 €. Normale Eingangsrechnungen unter 2.500 € laufen über die Rechnungsfreigabe: dafür KEIN Hinweis.
- darlehen: Zinsanpassung, neue Rate, Ende der Zinsbindung, Kreditzusage, Kündigung, Auszahlung
- transaktion: Kaufvertrag oder Entwurf, Notartermin, Reservierung, Kaufpreisfälligkeit, Verkauf einer Einheit
- bank: Kontoeröffnung oder -schließung, Saldenbestätigung, Auszug eines Kontos, das nicht per EBICS kommt
- sonstiges: anderes mit klarer Auswirkung auf Zahlen (z. B. Mietminderung, Schaden mit erwarteten Kosten)

KEIN Hinweis für: Werbung, Newsletter, private Bestellungen, Unzustellbar-Meldungen, Protokolle ohne Zahlen, Baugenehmigungen, Vollmachten, Formulare, Zugangsdaten, Exposés fremder Objekte, allgemeine Korrespondenz.

Dateien aus der OneDrive-Ablage sind oft Verträge, Bescheide, Abrechnungen oder Tabellen, die jemand abgelegt hat. Melde dort nur, was neu ist oder von den Stammdaten abweicht (z. B. Mietvertrag eines Mieters, der fehlt oder eine andere Miete hat; Bescheid mit anderem Betrag als die festen Kosten). Was die Stammdaten schon so enthalten, ist KEIN Hinweis.

Nutze die Stammdaten: nenne objekt (ID wie O-03) und gesellschaft (ID wie G-02), wenn erkennbar. Bei Mieten: mieter (Name), betragAlt = aktueller Wert laut Stammdaten, betrag = neuer Wert. Beträge in Euro als Zahl, Daten als JJJJ-MM-TT. Ein Dokument ergibt meist höchstens einen Hinweis.

Antworte NUR mit JSON:
{"hinweise":[{"art":"…","titel":"kurz, höchstens 80 Zeichen","beschreibung":"1–2 Sätze: was sich ändert, mit Zahlen","aktion":"was im Board nachzutragen ist","objekt":"O-..|null","gesellschaft":"G-..|null","mieter":"…|null","betrag":Zahl|null,"betragAlt":Zahl|null,"gueltigAb":"JJJJ-MM-TT|null","faelligAm":"JJJJ-MM-TT|null","konfidenz":0.0}]}
Ohne Auswirkung auf Zahlen: {"hinweise":[]}
`.trim();

type Zeile = {
  id: string;
  postfach: string;
  graph_nachricht_id: string;
  betreff: string | null;
  absender_name: string | null;
  absender_mail: string | null;
  eingegangen_am: string | null;
  anhang_id: string | null;
  anhang_name: string | null;
  anhang_content_type: string | null;
  email_text: string | null;
  dokument_typ: string | null;
  gesellschaft_id: string | null;
  objekt_id: string | null;
  felder: Record<string, { value?: string | null } | undefined> | null;
};

export type Kontext = {
  text: string;
  objekte: Set<string>;
  gesellschaften: Set<string>;
  objektFirma: Map<string, string>;
};

const euro = (v: unknown) =>
  v == null ? "–" : `${Number(v).toLocaleString("de-DE")} €`;

/** Stammdaten als kompakter Text: Gesellschaften, Objekte, Mieter, Darlehen, feste Kosten */
export async function ladeKontext(): Promise<Kontext> {
  const admin = createServiceRoleClient();
  const heute = new Date().toISOString().slice(0, 10);
  const [g, o, m, d, f] = await Promise.all([
    admin.from("v_gesellschaften").select("id,name,kuerzel").order("id"),
    admin
      .from("objekte")
      .select("id,bezeichnung,strasse,ort,gesellschaft_id")
      .order("id"),
    admin
      .from("v_mieten_vertraege")
      .select(
        "objekt_id,einheit_lage,mieter_name,kaltmiete,nk_vorauszahlung,ende",
      )
      .order("objekt_id"),
    admin
      .from("darlehen")
      .select(
        "id,art,objekt_id,nehmer_gesellschaft_id,betrag,zins_pa,rate_monatlich,status",
      ),
    admin
      .from("objekt_fixkosten")
      .select("objekt_id,kostenart,betrag,rhythmus"),
  ]);
  const zeilen: string[] = ["Gesellschaften:"];
  for (const x of g.data ?? [])
    zeilen.push(`- ${x.id}: ${x.name} (${x.kuerzel})`);
  zeilen.push("", "Objekte:");
  for (const x of o.data ?? [])
    zeilen.push(
      `- ${x.id}: ${x.bezeichnung}, ${x.strasse ?? ""} ${x.ort ?? ""} (Gesellschaft ${x.gesellschaft_id})`,
    );
  zeilen.push(
    "",
    "Laufende Mietverträge (Objekt · Lage · Mieter · kalt + NK):",
  );
  for (const x of m.data ?? []) {
    if (x.ende && x.ende < heute) continue;
    zeilen.push(
      `- ${x.objekt_id} · ${x.einheit_lage ?? ""} · ${x.mieter_name ?? ""} · ${euro(x.kaltmiete)} + ${euro(x.nk_vorauszahlung)}`,
    );
  }
  zeilen.push("", "Darlehen (aktiv):");
  for (const x of d.data ?? []) {
    if (x.status === "beendet") continue;
    zeilen.push(
      `- ${x.id} · ${x.art} · Nehmer ${x.nehmer_gesellschaft_id ?? "–"} · Objekt ${x.objekt_id ?? "–"} · ${euro(x.betrag)} · ${x.zins_pa ?? "–"} % · Rate ${euro(x.rate_monatlich)}`,
    );
  }
  zeilen.push("", "Feste Kosten je Objekt:");
  for (const x of f.data ?? [])
    zeilen.push(
      `- ${x.objekt_id} · ${x.kostenart} · ${euro(x.betrag)} ${x.rhythmus}`,
    );
  return {
    text: zeilen.join("\n"),
    objekte: new Set((o.data ?? []).map((x) => String(x.id))),
    gesellschaften: new Set((g.data ?? []).map((x) => String(x.id))),
    objektFirma: new Map(
      (o.data ?? []).map((x) => [String(x.id), String(x.gesellschaft_id)]),
    ),
  };
}

async function ungepruefteEintraege(limit: number): Promise<Zeile[]> {
  const admin = createServiceRoleClient();
  const ab = new Date(Date.now() - RUECKBLICK_TAGE * 86_400_000).toISOString();
  const { data, error } = await admin
    .from(POSTEINGANG)
    .select(
      "id,postfach,graph_nachricht_id,betreff,absender_name,absender_mail,eingegangen_am,anhang_id,anhang_name,anhang_content_type,email_text,dokument_typ,gesellschaft_id,objekt_id,felder",
    )
    .is("datenwirkung_geprueft_am", null)
    .in("status", ["analysiert", "abgelegt", "gebucht"])
    .or("dokument_typ.is.null,dokument_typ.neq.expose")
    .gte("eingegangen_am", ab)
    .order("eingegangen_am", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Postfach lesen: ${error.message}`);
  return (data ?? []) as Zeile[];
}

export async function zaehleUngeprueft(): Promise<number> {
  const admin = createServiceRoleClient();
  const ab = new Date(Date.now() - RUECKBLICK_TAGE * 86_400_000).toISOString();
  const { count } = await admin
    .from(POSTEINGANG)
    .select("id", { count: "exact", head: true })
    .is("datenwirkung_geprueft_am", null)
    .in("status", ["analysiert", "abgelegt", "gebucht"])
    .or("dokument_typ.is.null,dokument_typ.neq.expose")
    .gte("eingegangen_am", ab);
  return count ?? 0;
}

/** Bereits vorhandene Hinweise der letzten 120 Tage (gegen Doppelte) */
export async function vorhandeneSchluessel(): Promise<Set<string>> {
  const admin = createServiceRoleClient();
  const ab = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const { data } = await admin
    .from(HINWEISE)
    .select("art,objekt_id,mieter,betrag,gueltig_ab,titel")
    .gte("created_at", ab);
  return new Set(
    (data ?? []).map((h) =>
      hinweisSchluessel({
        art: h.art,
        objektId: h.objekt_id,
        mieter: h.mieter,
        betrag: h.betrag == null ? null : Number(h.betrag),
        gueltigAb: h.gueltig_ab,
        titel: h.titel,
      }),
    ),
  );
}

/**
 * KI fragen und Hinweise prüfen. Fehlt der KI Objekt oder Gesellschaft,
 * gelten die Vorgaben (z. B. Zuordnung aus der Postfach-Analyse oder dem Ordner).
 */
export async function kiHinweise(
  teile: Array<string | null | undefined>,
  vision: DokumentVisionBlock[],
  kontext: Kontext,
  vorgabe: { objektId: string | null; gesellschaftId: string | null },
): Promise<HinweisVorschlag[]> {
  const userText = [
    "=== STAMMDATEN ===",
    kontext.text,
    "",
    ...teile.filter((z): z is string => z != null),
  ].join("\n");
  const antwort = await anthropicNachricht(SYSTEM, userText, vision, 1500);
  return hinweiseAusAntwort(antwort, kontext).map((h) => {
    const objektId = h.objektId ?? vorgabe.objektId;
    return {
      ...h,
      objektId,
      gesellschaftId:
        h.gesellschaftId ??
        (objektId ? (kontext.objektFirma.get(objektId) ?? null) : null) ??
        vorgabe.gesellschaftId,
    };
  });
}

/** Spalten eines Hinweises für postfach_datenhinweise (ohne Herkunft) */
export function hinweisSpalten(h: HinweisVorschlag) {
  return {
    art: h.art,
    titel: h.titel,
    beschreibung: h.beschreibung,
    aktion: h.aktion,
    gesellschaft_id: h.gesellschaftId,
    objekt_id: h.objektId,
    mieter: h.mieter,
    betrag: h.betrag,
    betrag_alt: h.betragAlt,
    gueltig_ab: h.gueltigAb,
    faellig_am: h.faelligAm,
    konfidenz: h.konfidenz,
  };
}

async function pruefeEintrag(
  accessToken: string,
  row: Zeile,
  kontext: Kontext,
): Promise<HinweisVorschlag[]> {
  const mail = {
    betreff: row.betreff,
    absenderName: row.absender_name,
    absenderMail: row.absender_mail,
    emailText: row.email_text,
  };
  let mailKontext = baueMailKontext(mail);
  let dokument = "";
  let vision: DokumentVisionBlock[] = [];
  if (row.anhang_id) {
    try {
      const anhang = await graphAnhangBinary(
        accessToken,
        row.postfach,
        row.graph_nachricht_id,
        row.anhang_id,
      );
      if (
        anhang.bytes.byteLength > 0 &&
        anhang.bytes.byteLength <= MAX_ANHANG_BYTES
      ) {
        const k = await baueAnhangAnalyseKontext({
          name: anhang.name || row.anhang_name || "Dokument",
          contentType: anhang.contentType ?? row.anhang_content_type,
          bytes: anhang.bytes,
          mail,
        });
        mailKontext = k.mailKontext;
        dokument = k.modelContext;
        vision = k.vision;
      }
    } catch (err) {
      // Anhang nicht mehr lesbar (verschoben/gelöscht): nur Mail prüfen
      console.error("[datenwirkung] Anhang laden", row.id, err);
    }
  }
  const titel = row.felder?.dokumentTitel?.value;
  const betrag = row.felder?.rechnungsbetrag?.value;
  return kiHinweise(
    [
      "=== MAIL ===",
      mailKontext || "(kein Mailtext)",
      "",
      "=== DOKUMENT ===",
      `Anhang: ${row.anhang_name ?? "–"}`,
      titel ? `Titel laut Analyse: ${titel}` : null,
      betrag ? `Betrag laut Analyse: ${betrag}` : null,
      row.objekt_id ? `Objekt laut Analyse: ${row.objekt_id}` : null,
      dokument || "(kein Dokumenttext)",
    ],
    vision,
    kontext,
    { objektId: row.objekt_id, gesellschaftId: row.gesellschaft_id },
  );
}

export type DatenwirkungErgebnis = {
  geprueft: number;
  neueHinweise: number;
  fehlgeschlagen: number;
  offen: number;
};

/**
 * Ungeprüfte Postfach-Einträge prüfen und Hinweise anlegen.
 * Bricht nach drei Fehlern in Folge ab (vermutlich KI oder Graph gestört).
 */
export async function datenwirkungNachholen(input: {
  max: number;
  deadlineMs?: number;
}): Promise<DatenwirkungErgebnis> {
  const rows = await ungepruefteEintraege(Math.max(0, input.max));
  if (rows.length === 0)
    return { geprueft: 0, neueHinweise: 0, fehlgeschlagen: 0, offen: 0 };
  const admin = createServiceRoleClient();
  const [{ accessToken }, kontext, bekannt] = await Promise.all([
    microsoftAccessToken(),
    ladeKontext(),
    vorhandeneSchluessel(),
  ]);
  let geprueft = 0;
  let neueHinweise = 0;
  let fehlgeschlagen = 0;
  let inFolge = 0;
  for (const row of rows) {
    if (input.deadlineMs && Date.now() >= input.deadlineMs) break;
    try {
      const vorschlaege = await pruefeEintrag(accessToken, row, kontext);
      const neu = vorschlaege.filter((h) => {
        const s = hinweisSchluessel(h);
        if (bekannt.has(s)) return false;
        bekannt.add(s);
        return true;
      });
      if (neu.length) {
        const { error } = await admin.from(HINWEISE).insert(
          neu.map((h) => ({
            ...hinweisSpalten(h),
            quelle: "postfach",
            posteingang_id: row.id,
            betreff: row.betreff,
            absender: row.absender_name ?? row.absender_mail,
            anhang_name: row.anhang_name,
            eingegangen_am: row.eingegangen_am,
          })),
        );
        if (error) throw new Error(`Hinweis speichern: ${error.message}`);
        neueHinweise += neu.length;
      }
      const { error } = await admin
        .from(POSTEINGANG)
        .update({ datenwirkung_geprueft_am: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw new Error(`Prüfung vermerken: ${error.message}`);
      geprueft += 1;
      inFolge = 0;
    } catch (err) {
      fehlgeschlagen += 1;
      inFolge += 1;
      console.error("[datenwirkung] Eintrag", row.id, err);
      if (inFolge >= MAX_FEHLER_IN_FOLGE) break;
    }
  }
  return {
    geprueft,
    neueHinweise,
    fehlgeschlagen,
    offen: await zaehleUngeprueft(),
  };
}

/** Aus der Oberfläche (Datenqualität → „Postfach prüfen“) */
export async function postfachDatenwirkungPruefen(input: {
  supabaseAccessToken: string;
  max?: number;
}): Promise<DatenwirkungErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  return datenwirkungNachholen({
    max: Math.min(Math.max(1, input.max ?? BATCH_UI), BATCH_UI),
  });
}
