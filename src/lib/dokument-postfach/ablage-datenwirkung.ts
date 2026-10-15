/**
 * Datenhinweise aus der OneDrive-Ablage. Server-only.
 *
 * Liest die Änderungen der Ablage über das OneDrive-Delta, merkt sich neue
 * oder geänderte Dateien der Gesellschaftsordner (letzte 30 Tage) in
 * `ablage_dateien` und lässt sie wie Postfach-Mails von der KI auf
 * Auswirkungen auf die Zahlen prüfen. Treffer landen in
 * `postfach_datenhinweise` mit `quelle = 'ablage'`.
 */
import {
  istAblageRootOrdner,
  microsoftOneDriveUser,
} from "@/lib/microsoft/ablage";
import {
  graphDriveDateiInhalt,
  graphDriveDelta,
  type GraphDriveDeltaItem,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";

import { baueAnhangAnalyseKontext } from "./anhang-kontext";
import {
  HINWEISE,
  hinweisSpalten,
  kiHinweise,
  ladeKontext,
  MAX_ANHANG_BYTES,
  MAX_FEHLER_IN_FOLGE,
  vorhandeneSchluessel,
} from "./datenwirkung";
import { ablageDateiRelevant, hinweisSchluessel } from "./datenwirkung-logik";

const DATEIEN = "ablage_dateien";
const STAND = "ablage_sync_stand";
const STAND_ID = "onedrive";
/** Dateien je Aufruf aus der Oberfläche (innerhalb maxDuration) */
const BATCH_UI = 4;
/** Delta-Seiten je Aufruf aus der Oberfläche */
const SEITEN_UI = 20;

type DateiZeile = {
  onedrive_id: string;
  name: string;
  pfad: string | null;
  web_url: string | null;
  geaendert_am: string | null;
  ctag: string | null;
};

export type AblageErgebnis = {
  /** Delta vollständig gelesen (Erstaufnahme fertig) */
  aktuell: boolean;
  geprueft: number;
  neueHinweise: number;
  fehlgeschlagen: number;
  offen: number;
};

/** IDs in Stücken, damit die Abfrage-URL kurz bleibt */
function stuecke<T>(liste: T[], groesse = 100): T[][] {
  const teile: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse)
    teile.push(liste.slice(i, i + groesse));
  return teile;
}

/** „/MTF Capital GmbH/05_Immobilien“ + „Bescheid.pdf“ */
const vollerPfad = (pfad: string | null, name: string) =>
  `${(pfad ?? "").replace(/\/$/, "")}/${name}`;

/**
 * OneDrive-Delta lesen und relevante Dateien vormerken. Der Fortsetzungslink
 * steht in `ablage_sync_stand`; die Erstaufnahme läuft über mehrere Läufe.
 */
export async function ablageAenderungenLesen(input: {
  accessToken: string;
  maxSeiten: number;
  deadlineMs?: number;
}): Promise<{ aktuell: boolean; vorgemerkt: number }> {
  const admin = createServiceRoleClient();
  const benutzer = microsoftOneDriveUser();
  const { data: stand } = await admin
    .from(STAND)
    .select("link,erstaufnahme_fertig")
    .eq("id", STAND_ID)
    .maybeSingle();
  let link: string | null = stand?.link ?? null;
  let erstaufnahmeFertig = Boolean(stand?.erstaufnahme_fertig);
  let vorgemerkt = 0;
  let aktuell = false;

  for (let seite = 0; seite < input.maxSeiten; seite++) {
    if (input.deadlineMs && Date.now() >= input.deadlineMs) break;
    const antwort = await graphDriveDelta(input.accessToken, benutzer, link);
    vorgemerkt += await seiteVormerken(antwort.items);
    if (antwort.nextLink) {
      link = antwort.nextLink;
    } else {
      // deltaLink: alles gelesen, ab jetzt nur noch Änderungen
      link = antwort.deltaLink ?? link;
      erstaufnahmeFertig = true;
      aktuell = true;
    }
    const { error } = await admin.from(STAND).upsert({
      id: STAND_ID,
      link,
      erstaufnahme_fertig: erstaufnahmeFertig,
      aktualisiert_am: new Date().toISOString(),
    });
    if (error) throw new Error(`Ablage-Stand speichern: ${error.message}`);
    if (aktuell) break;
  }
  return { aktuell, vorgemerkt };
}

async function seiteVormerken(items: GraphDriveDeltaItem[]): Promise<number> {
  const admin = createServiceRoleClient();
  const jetzt = new Date();
  const relevant = items.filter((d) =>
    ablageDateiRelevant(d, jetzt, istAblageRootOrdner),
  );
  const geloescht = items.filter((d) => d.geloescht).map((d) => d.id);

  // Gelöscht, bevor sie geprüft wurde: nicht mehr prüfen
  for (const teil of stuecke(geloescht)) {
    await admin
      .from(DATEIEN)
      .update({ status: "uebersprungen", fehler: "gelöscht" })
      .in("onedrive_id", teil)
      .eq("status", "offen");
  }
  if (!relevant.length) return 0;

  const ctagJe = new Map<string, string | null>();
  for (const teil of stuecke(relevant.map((d) => d.id))) {
    const { data } = await admin
      .from(DATEIEN)
      .select("onedrive_id,ctag")
      .in("onedrive_id", teil);
    for (const z of data ?? []) ctagJe.set(z.onedrive_id, z.ctag);
  }
  // Nur neue Dateien oder geänderter Inhalt (cTag); Umbenennen/Verschieben nicht
  const neu = relevant.filter(
    (d) => !ctagJe.has(d.id) || (d.cTag && ctagJe.get(d.id) !== d.cTag),
  );
  if (!neu.length) return 0;
  const { error } = await admin.from(DATEIEN).upsert(
    neu.map((d) => ({
      onedrive_id: d.id,
      name: d.name,
      pfad: d.pfad,
      web_url: d.webUrl,
      groesse: d.groesse,
      geaendert_am: d.geaendertAm,
      ctag: d.cTag,
      status: "offen",
      fehler: null,
      geprueft_am: null,
    })),
  );
  if (error) throw new Error(`Ablage-Dateien vormerken: ${error.message}`);
  return neu.length;
}

async function zaehleOffen(): Promise<number> {
  const admin = createServiceRoleClient();
  const { count } = await admin
    .from(DATEIEN)
    .select("onedrive_id", { count: "exact", head: true })
    .eq("status", "offen");
  return count ?? 0;
}

async function dateiPruefen(
  accessToken: string,
  datei: DateiZeile,
  kontext: Awaited<ReturnType<typeof ladeKontext>>,
) {
  const bytes = await graphDriveDateiInhalt(
    accessToken,
    microsoftOneDriveUser(),
    datei.onedrive_id,
  );
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ANHANG_BYTES) return [];
  const k = await baueAnhangAnalyseKontext({
    name: datei.name,
    contentType: null,
    bytes,
    mail: {},
  });
  return kiHinweise(
    [
      "=== DATEI AUS DER ABLAGE ===",
      `Pfad: ${vollerPfad(datei.pfad, datei.name)}`,
      datei.geaendert_am
        ? `Geändert: ${datei.geaendert_am.slice(0, 10)}`
        : null,
      "Der Ordnerpfad nennt oft Gesellschaft und Objekt.",
      "",
      k.modelContext || "(kein Dokumenttext)",
    ],
    k.vision,
    kontext,
    { objektId: null, gesellschaftId: null },
  );
}

/**
 * Vorgemerkte Dateien prüfen. Dateien, die das Postfach selbst abgelegt
 * hat, sind über die Mail schon geprüft und werden übersprungen.
 */
export async function ablageDateienPruefen(input: {
  accessToken: string;
  max: number;
  deadlineMs?: number;
}): Promise<Omit<AblageErgebnis, "aktuell">> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from(DATEIEN)
    .select("onedrive_id,name,pfad,web_url,geaendert_am,ctag")
    .eq("status", "offen")
    .order("geaendert_am", { ascending: false })
    .limit(Math.max(0, input.max));
  const dateien = (data ?? []) as DateiZeile[];
  let geprueft = 0;
  let neueHinweise = 0;
  let fehlgeschlagen = 0;
  if (!dateien.length)
    return { geprueft, neueHinweise, fehlgeschlagen, offen: 0 };

  const { data: ausPostfach } = await admin
    .from("dokument_posteingang")
    .select("abgelegt_onedrive_id")
    .in(
      "abgelegt_onedrive_id",
      dateien.map((d) => d.onedrive_id),
    );
  const schonGeprueft = new Set(
    (ausPostfach ?? []).map((z) => z.abgelegt_onedrive_id as string),
  );
  const [kontext, bekannt] = await Promise.all([
    ladeKontext(),
    vorhandeneSchluessel(),
  ]);

  let inFolge = 0;
  for (const datei of dateien) {
    if (input.deadlineMs && Date.now() >= input.deadlineMs) break;
    if (schonGeprueft.has(datei.onedrive_id)) {
      await admin
        .from(DATEIEN)
        .update({ status: "uebersprungen", fehler: "aus dem Postfach" })
        .eq("onedrive_id", datei.onedrive_id);
      continue;
    }
    try {
      const vorschlaege = await dateiPruefen(input.accessToken, datei, kontext);
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
            quelle: "ablage",
            onedrive_id: datei.onedrive_id,
            pfad: vollerPfad(datei.pfad, datei.name),
            web_url: datei.web_url,
            anhang_name: datei.name,
            eingegangen_am: datei.geaendert_am,
          })),
        );
        if (error) throw new Error(`Hinweis speichern: ${error.message}`);
        neueHinweise += neu.length;
      }
      await admin
        .from(DATEIEN)
        .update({
          status: "geprueft",
          fehler: null,
          geprueft_am: new Date().toISOString(),
        })
        .eq("onedrive_id", datei.onedrive_id);
      geprueft += 1;
      inFolge = 0;
    } catch (err) {
      fehlgeschlagen += 1;
      inFolge += 1;
      console.error("[ablage-datenwirkung] Datei", datei.onedrive_id, err);
      await admin
        .from(DATEIEN)
        .update({
          status: "fehler",
          fehler: String(err instanceof Error ? err.message : err).slice(
            0,
            500,
          ),
        })
        .eq("onedrive_id", datei.onedrive_id);
      if (inFolge >= MAX_FEHLER_IN_FOLGE) break;
    }
  }
  return { geprueft, neueHinweise, fehlgeschlagen, offen: await zaehleOffen() };
}

/** Nachtlauf: Änderungen lesen, dann prüfen, solange Zeit bleibt */
export async function ablageDatenwirkungNachholen(input: {
  max: number;
  maxSeiten: number;
  deadlineMs?: number;
}): Promise<AblageErgebnis> {
  const { accessToken } = await microsoftAccessToken();
  const { aktuell } = await ablageAenderungenLesen({
    accessToken,
    maxSeiten: input.maxSeiten,
    deadlineMs: input.deadlineMs,
  });
  const ergebnis = await ablageDateienPruefen({
    accessToken,
    max: input.max,
    deadlineMs: input.deadlineMs,
  });
  return { aktuell, ...ergebnis };
}

/** Aus der Oberfläche (Datenqualität → „Jetzt prüfen“) */
export async function ablageDatenwirkungPruefen(input: {
  supabaseAccessToken: string;
}): Promise<AblageErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  return ablageDatenwirkungNachholen({
    max: BATCH_UI,
    maxSeiten: SEITEN_UI,
    deadlineMs: Date.now() + 45_000,
  });
}
