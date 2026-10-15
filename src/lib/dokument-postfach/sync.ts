/**
 * Dokument-Postfach synchronisieren und KI-Analyse. Server-only.
 */
import { handleAnalyzeDokumentRequest } from "@/lib/dokument-ai";
import {
  ablegenKategorieNachrichtSchluessel,
  microsoftAblegenKategorieMailsLesen,
  microsoftDokumentPosteingangLesenIntern,
  microsoftDokumentPosteingangQuellen,
  istAblageRootOrdner,
  microsoftOneDriveUser,
  type DokumentPosteingangNachricht,
} from "@/lib/microsoft/ablage";
import {
  graphAnhangBinary,
  graphDriveRootKinder,
  graphNachrichtBodyText,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
  microsoftCronAuthToken,
} from "@/lib/microsoft/supabase-admin";

import {
  istTamAusFeldern,
  istTamGesellschaft,
  TRADE_ANY_MACHINE_NAME,
} from "@/lib/trade-any-machine";

import { baueAnhangAnalyseKontext } from "./anhang-kontext";
import { ablageDatenwirkungNachholen } from "./ablage-datenwirkung";
import { datenwirkungNachholen } from "./datenwirkung";
import {
  dokumentPosteingangAblegenKategorieSicherstellen,
  dokumentPosteingangOutlookKategorieAblegen,
  dokumentPosteingangOutlookKategorieAblegenAlle,
} from "./kategorie-ablegen";
import {
  loescheAlteRechnungsHistorie,
  pruefeRechnungsDuplikat,
} from "./rechnung-historie";
import {
  ermittleZielordnerIterativ,
  findeEingangsrechnungenOrdner,
  findeGesellschaftRootDeterministisch,
  ladeStammdatenKontext,
} from "./ablage-kontext";
import {
  claimEintragFuerAnalyse,
  claimNaechsteOffeneMails,
  eintraegeAnlegen,
  gebeVeralteteAnalysenFrei,
  leseAktiveEintraege,
  leseEintrag,
  leseEintraege,
  leseEintraegeFuerNachricht,
  speichereAnalyse,
  speichereAnalyseFehler,
  speichereEmailTextFuerNachricht,
  zaehleOffene,
  zuEintrag,
  type DokumentPosteingangRow,
} from "./store";
import type {
  DokumentPosteingangEintrag,
  DokumentPosteingangSyncErgebnis,
  RechnungDuplikatHinweis,
} from "./typen";
import { ermittleGeschwisterHinweis, finalisiereZuordnung } from "./zuordnung";

const MAX_ANHANG_BYTES = 25 * 1024 * 1024;
/** Max. Analysen pro UI-/Sync-Servercall (innerhalb maxDuration). */
const ANALYSE_BATCH_MAX = 6;
/** Parallele Analysen pro Batch — spart Zeit ohne Anthropic zu überlasten. */
const ANALYSE_CONCURRENCY = 3;

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type StammdatenCache = {
  gesellschaften: Array<{ id: string; name: string; kuerzel: string }>;
  objekte: Array<{
    id: string;
    bezeichnung: string;
    gesellschaft_id: string;
    strasse?: string | null;
    ort?: string | null;
  }>;
  stammdatenKontext: string;
};

async function ladeStammdatenCache(): Promise<StammdatenCache> {
  const admin = createServiceRoleClient();
  const [{ data: gesellschaften }, { data: objekte }, stammdatenKontext] =
    await Promise.all([
      admin.from("v_gesellschaften").select("id,name,kuerzel"),
      admin
        .from("v_objekte")
        .select("id,bezeichnung,gesellschaft_id,strasse,ort"),
      ladeStammdatenKontext(),
    ]);
  return {
    gesellschaften: gesellschaften ?? [],
    objekte: objekte ?? [],
    stammdatenKontext,
  };
}

/**
 * Geclaimte Einträge analysieren.
 * Anhänge derselben Mail nacheinander (Sibling-Kontext), verschiedene Mails parallel.
 */
async function analysiereClaimedBatch(
  accessToken: string,
  rows: DokumentPosteingangRow[],
  concurrency = ANALYSE_CONCURRENCY,
): Promise<ReturnType<typeof zuEintrag>[]> {
  if (rows.length === 0) return [];

  const stammdaten = await ladeStammdatenCache();
  const indexById = new Map(rows.map((r, i) => [r.id, i]));
  const ergebnisse: ReturnType<typeof zuEintrag>[] = new Array(rows.length);

  const gruppen = new Map<string, DokumentPosteingangRow[]>();
  for (const row of rows) {
    const key = `${row.postfach.toLowerCase()}|${row.graph_nachricht_id}`;
    const liste = gruppen.get(key) ?? [];
    liste.push(row);
    gruppen.set(key, liste);
  }

  const mailGruppen = [...gruppen.values()];
  let next = 0;
  const workers = Math.min(Math.max(1, concurrency), mailGruppen.length);

  async function worker(): Promise<void> {
    for (;;) {
      const gi = next;
      next += 1;
      if (gi >= mailGruppen.length) return;
      const gruppe = mailGruppen[gi]!;
      // Geschwister strikt nacheinander — spätere Anhänge sehen frühere Zuordnung.
      for (const row of gruppe) {
        try {
          await analysiereEintrag(accessToken, row, stammdaten);
        } catch (err) {
          console.error(
            "[dokument-postfach] Unerwarteter Analysefehler",
            row.id,
            err,
          );
        }
        const idx = indexById.get(row.id);
        if (idx != null) {
          ergebnisse[idx] = zuEintrag(await leseEintrag(row.id));
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ergebnisse;
}

async function ladeVollenMailText(
  accessToken: string,
  row: DokumentPosteingangRow,
): Promise<string | null> {
  const vorhanden = row.email_text?.trim() ?? "";
  // bodyPreview ist typisch ~255 Zeichen — vollen Body nachladen.
  if (vorhanden.length >= 600) return vorhanden;

  try {
    const body = await graphNachrichtBodyText(
      accessToken,
      row.postfach,
      row.graph_nachricht_id,
    );
    const text = body?.trim() || null;
    if (text && text.length > vorhanden.length) {
      try {
        await speichereEmailTextFuerNachricht(
          row.postfach,
          row.graph_nachricht_id,
          text,
        );
      } catch (err) {
        console.error("[dokument-postfach] E-Mail-Text speichern", row.id, err);
      }
      return text;
    }
  } catch (err) {
    console.error("[dokument-postfach] E-Mail-Body laden", row.id, err);
  }
  return vorhanden || null;
}

/** @returns true bei Erfolg, false wenn der Eintrag als Fehler gespeichert wurde. */
async function analysiereEintrag(
  accessToken: string,
  row: DokumentPosteingangRow,
  stammdaten?: StammdatenCache,
): Promise<boolean> {
  try {
    if (!row.anhang_id) {
      throw new Error("Kein Anhang an der Mail gefunden.");
    }

    const anhang = await graphAnhangBinary(
      accessToken,
      row.postfach,
      row.graph_nachricht_id,
      row.anhang_id,
    );
    const bytes = anhang.bytes;
    if (bytes.byteLength === 0) {
      throw new Error("Der Anhang enthält keine Daten.");
    }
    if (bytes.byteLength > MAX_ANHANG_BYTES) {
      throw new Error(
        "Anhang ist größer als 25 MB und wurde nicht analysiert.",
      );
    }

    const emailText = await ladeVollenMailText(accessToken, row);
    const cache = stammdaten ?? (await ladeStammdatenCache());

    const siblings = await leseEintraegeFuerNachricht(
      row.postfach,
      row.graph_nachricht_id,
    );
    const geschwister = ermittleGeschwisterHinweis(
      siblings,
      row.id,
      cache.gesellschaften,
      cache.objekte,
    );

    const kontext = await baueAnhangAnalyseKontext({
      name: anhang.name || row.anhang_name || "Dokument",
      contentType: anhang.contentType ?? row.anhang_content_type,
      bytes,
      mail: {
        betreff: row.betreff,
        absenderName: row.absender_name,
        absenderMail: row.absender_mail,
        emailText,
      },
      geschwisterHinweis: geschwister?.hinweisText ?? null,
    });

    const ergebnis = await handleAnalyzeDokumentRequest({
      documentTitle: kontext.titel,
      mailKontext: kontext.mailKontext,
      modelContext: kontext.modelContext,
      vision: kontext.vision,
      stammdatenKontext: cache.stammdatenKontext,
      istScanVision: kontext.istScanVision,
    });

    ergebnis.felder.ordnerPfad = {
      ...ergebnis.felder.ordnerPfad,
      value: null,
    };

    const istTam = istTamAusFeldern(ergebnis.felder);

    if (istTam) {
      ergebnis.felder.gesellschaftName = {
        ...ergebnis.felder.gesellschaftName,
        value: TRADE_ANY_MACHINE_NAME,
      };
      ergebnis.felder.objektBezeichnung = {
        ...ergebnis.felder.objektBezeichnung,
        value: null,
      };
    }

    const zuordnung = finalisiereZuordnung({
      felder: ergebnis.felder,
      dokumentTyp: ergebnis.dokumentTyp,
      istScanVision: kontext.istScanVision,
      istTam,
      betreff: row.betreff,
      anhangName: row.anhang_name ?? anhang.name,
      mailKontext: kontext.mailKontext,
      modelContext: kontext.modelContext,
      geschwister,
      gesellschaften: cache.gesellschaften,
      objekte: cache.objekte,
    });

    ergebnis.felder = zuordnung.felder;
    const gesellschaftId = zuordnung.gesellschaftId;
    const objektId = zuordnung.objektId;
    const gematchtesObjekt =
      cache.objekte.find((o) => o.id === objektId) ?? null;

    const gesellschaftName =
      cache.gesellschaften.find((g) => g.id === gesellschaftId)?.name ??
      ergebnis.felder.gesellschaftName.value ??
      "";

    let ablageOrdnerId: string | null = null;
    let ablageOrdnerPfad: string | null = null;

    if (ergebnis.dokumentTyp === "rechnung") {
      const zielName = istTam
        ? TRADE_ANY_MACHINE_NAME
        : gesellschaftName.trim() || null;
      if (zielName) {
        const ziel = await findeEingangsrechnungenOrdner(accessToken, zielName);
        if (ziel) {
          ablageOrdnerId = ziel.id;
          ablageOrdnerPfad = ziel.pfad;
          ergebnis.felder.ordnerPfad = {
            ...ergebnis.felder.ordnerPfad,
            value: ziel.pfad,
          };
        }
      }
    } else if (istTam) {
      const benutzer = microsoftOneDriveUser();
      const root = await graphDriveRootKinder(accessToken, benutzer);
      const kandidaten = root.filter(
        (item) => item.istOrdner && istAblageRootOrdner(item.name),
      );
      const treffer = findeGesellschaftRootDeterministisch(
        kandidaten,
        TRADE_ANY_MACHINE_NAME,
      );
      if (treffer) {
        ablageOrdnerId = treffer.id;
        ablageOrdnerPfad = treffer.name;
        ergebnis.felder.ordnerPfad = {
          ...ergebnis.felder.ordnerPfad,
          value: treffer.name,
        };
      }
    } else if (
      ergebnis.dokumentTyp !== "expose" &&
      gesellschaftId &&
      gesellschaftName &&
      !istTamGesellschaft(gesellschaftName)
    ) {
      const ziel = await ermittleZielordnerIterativ(
        accessToken,
        {
          gesellschaftId,
          gesellschaftName,
          objektBezeichnung: gematchtesObjekt?.bezeichnung ?? null,
          dokumentTyp: ergebnis.dokumentTyp,
          documentTitle: kontext.titel,
          mailKontext: kontext.mailKontext,
          modelContext: kontext.modelContext,
        },
        cache.gesellschaften,
      );
      if (ziel) {
        ablageOrdnerId = ziel.id;
        ablageOrdnerPfad = ziel.pfad;
        ergebnis.felder.ordnerPfad = {
          ...ergebnis.felder.ordnerPfad,
          value: ziel.pfad,
        };
      }
    }

    let duplikatHinweis: RechnungDuplikatHinweis | null = null;
    if (ergebnis.dokumentTyp === "rechnung") {
      try {
        duplikatHinweis = await pruefeRechnungsDuplikat({
          rechnungsnummer: ergebnis.felder.rechnungsnummer?.value,
          eintragId: row.id,
          anhangName: row.anhang_name,
          betreff: row.betreff,
          felder: ergebnis.felder,
        });
      } catch (err) {
        // Hinweis ist optional — Analyse darf daran nicht scheitern.
        console.error("[dokument-postfach] Dublettenprüfung", row.id, err);
      }
    }

    await speichereAnalyse(row.id, {
      dokumentTyp: ergebnis.dokumentTyp,
      felder: ergebnis.felder,
      gesellschaftId,
      objektId,
      ablageOrdnerId,
      ablageOrdnerPfad,
      duplikatHinweis,
    });
    return true;
  } catch (err) {
    try {
      await speichereAnalyseFehler(row.id, fehlerText(err));
    } catch (speicherErr) {
      console.error(
        "[dokument-postfach] Analysefehler konnte nicht gespeichert werden",
        row.id,
        speicherErr,
      );
      // Eintrag bleibt ggf. „neu“ → Aufrufer muss abbrechen, sonst Endlosschleife.
      throw speicherErr;
    }
    return false;
  }
}

export async function dokumentPosteingangAnalyseWiederholen(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<ReturnType<typeof zuEintrag>> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const { accessToken } = await microsoftAccessToken();

  const row = await leseEintrag(input.eintragId);
  if (
    row.status !== "neu" &&
    row.status !== "in_analyse" &&
    row.status !== "fehler" &&
    row.status !== "analysiert"
  ) {
    throw new Error(
      "Nur offene, analysierte oder fehlgeschlagene Einträge können analysiert werden.",
    );
  }

  const bereit = await claimEintragFuerAnalyse(row.id);
  await analysiereEintrag(accessToken, bereit);
  return zuEintrag(await leseEintrag(row.id));
}

function mitAblegenKategorie(
  eintraege: DokumentPosteingangEintrag[],
  nachrichten: DokumentPosteingangNachricht[],
): DokumentPosteingangEintrag[] {
  const tagged = ablegenKategorieNachrichtSchluessel(nachrichten);
  if (tagged.size === 0) return eintraege;
  return eintraege.map((e) => ({
    ...e,
    hatAblegenKategorie: tagged.has(
      `${e.postfach.toLowerCase()}|${e.graphNachrichtId}`,
    ),
  }));
}

/** Schnelles Erstladen nur aus Supabase — ohne Graph. */
export async function dokumentPosteingangAusDbLaden(input: {
  supabaseAccessToken: string;
}): Promise<DokumentPosteingangSyncErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const rows = await leseAktiveEintraege();
  return {
    postfaecher: microsoftDokumentPosteingangQuellen().map((q) => q.postfach),
    nachrichten: [],
    eintraege: rows.map(zuEintrag),
    offen: await zaehleOffene(),
  };
}

export async function dokumentPosteingangSynchronisieren(input: {
  supabaseAccessToken: string;
  maxAnalysen?: number;
}): Promise<DokumentPosteingangSyncErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const maxAnalysen = Math.max(
    0,
    Math.min(input.maxAnalysen ?? 1, ANALYSE_BATCH_MAX),
  );

  if (maxAnalysen > 0) {
    try {
      await gebeVeralteteAnalysenFrei();
    } catch (err) {
      console.error("[dokument-postfach] Veraltete Claims freigeben", err);
    }

    const { accessToken } = await microsoftAccessToken();
    const claimed = await claimNaechsteOffeneMails(maxAnalysen);
    const aktualisiert = await analysiereClaimedBatch(
      accessToken,
      claimed,
      ANALYSE_CONCURRENCY,
    );

    return {
      postfaecher: [],
      nachrichten: [],
      eintraege: aktualisiert,
      offen: await zaehleOffene(),
    };
  }

  try {
    await gebeVeralteteAnalysenFrei();
  } catch (err) {
    console.error("[dokument-postfach] Veraltete Claims freigeben", err);
  }

  const { postfaecher, nachrichten } =
    await microsoftDokumentPosteingangLesenIntern();

  await dokumentPosteingangAblegenKategorieSicherstellen();
  await eintraegeAnlegen(nachrichten);

  try {
    // Beim Sync: gelb markierte Mails aus dem geladenen Posteingang ablegen.
    // Vollständige Kategorie-Suche (auch außerhalb Top-Fenster) über Button/Cron.
    await dokumentPosteingangOutlookKategorieAblegen({
      supabaseAccessToken: input.supabaseAccessToken,
      nachrichten,
    });
  } catch (err) {
    console.error("[dokument-postfach] Outlook-Kategorie-Ablegen", err);
  }

  const rows = await leseEintraege(
    nachrichten.map((n) => ({ postfach: n.postfach, id: n.id })),
  );

  return {
    postfaecher,
    nachrichten,
    eintraege: mitAblegenKategorie(rows.map(zuEintrag), nachrichten),
    offen: await zaehleOffene(),
  };
}

/** Nach so vielen Fehlern in Folge: Lauf stoppen (vermutlich systemisch). */
const NACHTLAUF_MAX_FEHLER_IN_FOLGE = 3;
/**
 * Sicherheitslimit pro Invocation (zusätzlich zum Zeitbudget).
 * Reicht für große Posteingänge; echte Grenze ist deadlineMs / maxDuration.
 */
const NACHTLAUF_MAX_ANALYSEN_PRO_LAUF = 200;
/** OneDrive-Delta-Seiten (je 500 Einträge) pro Lauf; Erstaufnahme über mehrere Läufe */
const NACHTLAUF_ABLAGE_MAX_SEITEN = 200;
/** Max. Selbst-Fortsetzungen nach dem ersten Cron-Trigger. */
export const NACHTLAUF_MAX_RUNDEN = 40;
/**
 * ~4,5 Min. unter Hobby-maxDuration 300s — Rest geht über Folge-Invocations.
 */
export const NACHTLAUF_DEFAULT_BUDGET_MS = 270_000;

export type DokumentPosteingangNachtlaufErgebnis = {
  analysiert: number;
  fehlgeschlagen: number;
  offen: number;
  fortsetzen: boolean;
  abgebrochen?: "zu_viele_fehler" | "persistenz";
  inboxSyncFehler?: string;
  /** Auto-Ablegen via Outlook-Kategorie „ablegen“. */
  kategorieAblegenVerarbeitet?: number;
  kategorieAblegenFehlgeschlagen?: number;
  /** Datenqualität: geprüfte Einträge und neue Hinweise mit Wirkung auf Zahlen */
  datenwirkungGeprueft?: number;
  datenwirkungHinweise?: number;
  /** Datenqualität: geprüfte Ablage-Dateien und neue Hinweise daraus */
  ablageGeprueft?: number;
  ablageHinweise?: number;
};

async function nachtlaufAblegenMailsSeeden(): Promise<number> {
  await dokumentPosteingangAblegenKategorieSicherstellen();
  const nachrichten = await microsoftAblegenKategorieMailsLesen();
  await eintraegeAnlegen(nachrichten);
  console.info(
    "[dokument-postfach] Nachtlauf Ablegen-Mails geladen",
    nachrichten.length,
  );
  return nachrichten.length;
}

async function nachtlaufOutlookKategorieAblegen(): Promise<{
  verarbeitet: number;
  fehlgeschlagen: number;
  mailsGefunden?: number;
} | null> {
  try {
    const ergebnis = await dokumentPosteingangOutlookKategorieAblegenAlle({
      supabaseAccessToken: microsoftCronAuthToken(),
    });
    console.info("[dokument-postfach] Nachtlauf Kategorie-Ablegen", ergebnis);
    return ergebnis;
  } catch (err) {
    console.error("[dokument-postfach] Nachtlauf Kategorie-Ablegen", err);
    return null;
  }
}

/**
 * Nachtlauf ohne User-JWT:
 * 1) Posteingang listen + offene Mails analysieren
 * 2) erst danach alle Mails mit Kategorie „ablegen“ laden/analysieren/ablegen
 * Einzelne Eintrag-Fehler werden übersprungen; nach 3 Fehlern in Folge Stopp.
 */
export async function dokumentPosteingangNachtlauf(input?: {
  /** Erste Runde: Inbox von Graph laden. Folgerunden: nur analysieren. */
  inboxSync?: boolean;
  /**
   * Absolute Deadline (Date.now()-ms). Danach keine neue Analyse mehr starten;
   * Caller kann mit einer neuen Invocation fortsetzen.
   */
  deadlineMs?: number;
}): Promise<DokumentPosteingangNachtlaufErgebnis> {
  const inboxSync = input?.inboxSync !== false;
  const deadlineMs =
    input?.deadlineMs ?? Date.now() + NACHTLAUF_DEFAULT_BUDGET_MS;
  let inboxSyncFehler: string | undefined;
  let kategorieAblegenVerarbeitet = 0;
  let kategorieAblegenFehlgeschlagen = 0;

  if (inboxSync) {
    try {
      await loescheAlteRechnungsHistorie();
    } catch (err) {
      console.error("[dokument-postfach] Rechnungshistorie aufräumen", err);
    }

    try {
      const { nachrichten } = await microsoftDokumentPosteingangLesenIntern();
      await dokumentPosteingangAblegenKategorieSicherstellen();
      await eintraegeAnlegen(nachrichten);
    } catch (err) {
      inboxSyncFehler = fehlerText(err);
      console.error("[dokument-postfach] Inbox-Sync im Nachtlauf", err);
      // Bestehende „neu“-Einträge trotzdem analysieren.
    }
  }

  try {
    await gebeVeralteteAnalysenFrei();
  } catch (err) {
    console.error("[dokument-postfach] Veraltete Claims freigeben", err);
  }

  const { accessToken } = await microsoftAccessToken();
  let analysiert = 0;
  let fehlgeschlagen = 0;
  let fehlerInFolge = 0;
  let abgebrochen: DokumentPosteingangNachtlaufErgebnis["abgebrochen"];
  let analysenRest = NACHTLAUF_MAX_ANALYSEN_PRO_LAUF;

  async function analysiereOffene(): Promise<void> {
    while (analysenRest > 0 && !abgebrochen) {
      if (Date.now() >= deadlineMs) break;

      const batchSize = Math.min(ANALYSE_BATCH_MAX, analysenRest);
      const claimed = await claimNaechsteOffeneMails(batchSize);
      if (claimed.length === 0) break;

      analysenRest -= claimed.length;

      const ergebnisse = await analysiereClaimedBatch(
        accessToken,
        claimed,
        ANALYSE_CONCURRENCY,
      );

      for (const eintrag of ergebnisse) {
        if (eintrag.status === "analysiert") {
          analysiert += 1;
          fehlerInFolge = 0;
        } else if (eintrag.status === "fehler") {
          fehlgeschlagen += 1;
          fehlerInFolge += 1;
          console.error(
            "[dokument-postfach] Analyse fehlgeschlagen, überspringe",
            eintrag.id,
            `(${fehlerInFolge}/${NACHTLAUF_MAX_FEHLER_IN_FOLGE} in Folge)`,
          );
          if (fehlerInFolge >= NACHTLAUF_MAX_FEHLER_IN_FOLGE) {
            abgebrochen = "zu_viele_fehler";
            break;
          }
        } else if (eintrag.status === "in_analyse") {
          // Persistenzfehler: Claim hängt — Lauf stoppen, Stale-Reclaim räumt auf.
          abgebrochen = "persistenz";
          break;
        }
      }
    }
  }

  // Phase 1: offene Inbox-Mails analysieren.
  await analysiereOffene();

  let nochOffen = await zaehleOffene();
  let fortsetzen = !abgebrochen && nochOffen > 0;

  // Phase 2: erst wenn die normale Warteschlange leer ist —
  // alle „ablegen“-Mails laden (egal wie alt), ggf. analysieren, dann ablegen.
  if (!fortsetzen) {
    try {
      await nachtlaufAblegenMailsSeeden();
    } catch (err) {
      console.error("[dokument-postfach] Ablegen-Mails seeden", err);
    }

    if (!abgebrochen) {
      await analysiereOffene();
    }

    nochOffen = await zaehleOffene();
    fortsetzen = !abgebrochen && nochOffen > 0;

    if (!fortsetzen) {
      const spaet = await nachtlaufOutlookKategorieAblegen();
      if (spaet) {
        kategorieAblegenVerarbeitet += spaet.verarbeitet;
        kategorieAblegenFehlgeschlagen += spaet.fehlgeschlagen;
      }
    }
  }

  // Phase 3: analysierte Post auf Auswirkungen auf die Zahlen prüfen
  // (Datenqualität). Nur mit Restzeit; der Rest folgt im nächsten Lauf.
  let datenwirkungGeprueft = 0;
  let datenwirkungHinweise = 0;
  if (!fortsetzen && Date.now() < deadlineMs - 30_000) {
    try {
      const dw = await datenwirkungNachholen({
        max: NACHTLAUF_MAX_ANALYSEN_PRO_LAUF,
        deadlineMs: deadlineMs - 15_000,
      });
      datenwirkungGeprueft = dw.geprueft;
      datenwirkungHinweise = dw.neueHinweise;
    } catch (err) {
      console.error("[dokument-postfach] Datenwirkung prüfen", err);
    }
  }

  // Phase 4: neue oder geänderte Dateien der OneDrive-Ablage ebenso prüfen
  let ablageGeprueft = 0;
  let ablageHinweise = 0;
  if (!fortsetzen && Date.now() < deadlineMs - 30_000) {
    try {
      const ab = await ablageDatenwirkungNachholen({
        max: NACHTLAUF_MAX_ANALYSEN_PRO_LAUF,
        maxSeiten: NACHTLAUF_ABLAGE_MAX_SEITEN,
        deadlineMs: deadlineMs - 15_000,
      });
      ablageGeprueft = ab.geprueft;
      ablageHinweise = ab.neueHinweise;
    } catch (err) {
      console.error("[dokument-postfach] Ablage prüfen", err);
    }
  }

  return {
    analysiert,
    fehlgeschlagen,
    offen: nochOffen,
    fortsetzen,
    abgebrochen,
    inboxSyncFehler,
    kategorieAblegenVerarbeitet,
    kategorieAblegenFehlgeschlagen,
    datenwirkungGeprueft,
    datenwirkungHinweise,
    ablageGeprueft,
    ablageHinweise,
  };
}
