/**
 * Dokument-Postfach synchronisieren und KI-Analyse. Server-only.
 */
import { handleAnalyzeDokumentRequest } from "@/lib/dokument-ai";
import {
  microsoftDokumentPosteingangLesenIntern,
  microsoftDokumentPosteingangQuellen,
  istAblageRootOrdner,
  microsoftOneDriveUser,
} from "@/lib/microsoft/ablage";
import { graphAnhangBinary, graphDriveRootKinder } from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { microsoftCallerAusJwt, createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

import {
  istTamAusFeldern,
  istTamGesellschaft,
  TRADE_ANY_MACHINE_NAME,
} from "@/lib/trade-any-machine";

import { baueAnhangAnalyseKontext } from "./anhang-kontext";
import {
  loescheAlteRechnungsHistorie,
  pruefeRechnungsDuplikat,
} from "./rechnung-historie";
import {
  ermittleZielordnerIterativ,
  findeEingangsrechnungenOrdner,
  findeGesellschaftId,
  findeGesellschaftRootDeterministisch,
  findeObjektIdAusKontext,
  findeObjektIdGlobalAusKontext,
  ladeStammdatenKontext,
} from "./ablage-kontext";
import {
  eintraegeAnlegen,
  leseAktiveEintraege,
  leseEintrag,
  leseEintraege,
  naechsteOffeneMail,
  speichereAnalyse,
  speichereAnalyseFehler,
  setzeStatusNeu,
  zaehleOffene,
  zuEintrag,
  type DokumentPosteingangRow,
} from "./store";
import type {
  DokumentPosteingangSyncErgebnis,
  RechnungDuplikatHinweis,
} from "./typen";

const MAX_ANHANG_BYTES = 25 * 1024 * 1024;

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** @returns true bei Erfolg, false wenn der Eintrag als Fehler gespeichert wurde. */
async function analysiereEintrag(
  accessToken: string,
  row: DokumentPosteingangRow,
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
      throw new Error("Anhang ist größer als 25 MB und wurde nicht analysiert.");
    }

    const kontext = await baueAnhangAnalyseKontext({
      name: anhang.name || row.anhang_name || "Dokument",
      contentType: anhang.contentType ?? row.anhang_content_type,
      bytes,
      mail: {
        betreff: row.betreff,
        absenderName: row.absender_name,
        absenderMail: row.absender_mail,
        emailText: row.email_text,
      },
    });

    const stammdatenKontext = await ladeStammdatenKontext();

    const ergebnis = await handleAnalyzeDokumentRequest({
      documentTitle: kontext.titel,
      mailKontext: kontext.mailKontext,
      modelContext: kontext.modelContext,
      vision: kontext.vision,
      stammdatenKontext,
    });

    ergebnis.felder.ordnerPfad = {
      ...ergebnis.felder.ordnerPfad,
      value: null,
    };

    const admin = createServiceRoleClient();
    const [{ data: gesellschaften }, { data: objekte }] = await Promise.all([
      admin.from("v_gesellschaften").select("id,name,kuerzel"),
      admin
        .from("v_objekte")
        .select("id,bezeichnung,gesellschaft_id,strasse,ort"),
    ]);

    const kiObjektAusScan =
      ergebnis.felder.objektBezeichnung?.value?.trim() || null;
    const kiAdressenAusScan = [
      ergebnis.felder.zahlungsempfaengerAdresse?.value,
      ergebnis.felder.zahlungsempfaenger?.value,
      ergebnis.felder.rechnungsstellerAdresse?.value,
    ]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);

    // Text-PDF: Objekt weiterhin nur serverseitig aus Dokumenttext matchen.
    // Scan-Vision: KI-Adresse vor dem Match merken (unten in kontextTexte).
    ergebnis.felder.objektBezeichnung = {
      ...ergebnis.felder.objektBezeichnung,
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

    const kontextTexte = [kontext.modelContext, kontext.mailKontext];
    if (kontext.istScanVision) {
      // Scan hat keinen PDF-Text — Adresse/Objekt aus der Bildanalyse einbeziehen.
      if (kiObjektAusScan) kontextTexte.push(kiObjektAusScan);
      kontextTexte.push(...kiAdressenAusScan);
      const gsName = ergebnis.felder.gesellschaftName?.value?.trim();
      if (gsName) kontextTexte.push(gsName);
    }

    // Objektadresse zuerst (z. B. Alt-Pempelfort) — korrigiert falsche Holding-Zuordnung
    let gesellschaftId: string | null = null;
    let objektId: string | null = null;

    if (!istTam && ergebnis.dokumentTyp !== "expose") {
      const globalObjekt = findeObjektIdGlobalAusKontext(
        kontextTexte,
        objekte ?? [],
      );
      if (globalObjekt) {
        objektId = globalObjekt.objektId;
        gesellschaftId = globalObjekt.gesellschaftId;
      }
    }

    if (!gesellschaftId && !istTam) {
      gesellschaftId = findeGesellschaftId(
        ergebnis.felder.gesellschaftName.value,
        gesellschaften ?? [],
      );
    }

    if (
      !objektId &&
      gesellschaftId &&
      ergebnis.dokumentTyp !== "expose" &&
      !istTam
    ) {
      objektId = findeObjektIdAusKontext(
        kontextTexte,
        gesellschaftId,
        objekte ?? [],
      );
    }

    const gematchtesObjekt =
      objekte?.find((o) => o.id === objektId) ?? null;

    if (gematchtesObjekt) {
      gesellschaftId = gematchtesObjekt.gesellschaft_id;
      ergebnis.felder.gesellschaftName = {
        ...ergebnis.felder.gesellschaftName,
        value:
          gesellschaften?.find((g) => g.id === gematchtesObjekt.gesellschaft_id)
            ?.name ?? ergebnis.felder.gesellschaftName.value,
      };
      ergebnis.felder.objektBezeichnung = {
        ...ergebnis.felder.objektBezeichnung,
        value: gematchtesObjekt.bezeichnung,
      };
    }

    const gesellschaftName =
      gesellschaften?.find((g) => g.id === gesellschaftId)?.name ??
      ergebnis.felder.gesellschaftName.value ??
      "";

    if (gesellschaftName && !gematchtesObjekt) {
      ergebnis.felder.gesellschaftName = {
        ...ergebnis.felder.gesellschaftName,
        value: gesellschaftName || ergebnis.felder.gesellschaftName.value,
      };
    }

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
        gesellschaften ?? [],
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
    row.status !== "fehler" &&
    row.status !== "analysiert"
  ) {
    throw new Error(
      "Nur offene, analysierte oder fehlgeschlagene Einträge können analysiert werden.",
    );
  }

  // Bereits analysiert / Fehler: Status zurücksetzen, dann erneut laufen lassen.
  // Status „neu“: gezielt genau diese Mail analysieren (ohne Warteschlange).
  if (row.status !== "neu") {
    await setzeStatusNeu(row.id);
  }
  const bereit = await leseEintrag(row.id);
  await analysiereEintrag(accessToken, bereit);
  return zuEintrag(await leseEintrag(row.id));
}

/** Schnelles Erstladen nur aus Supabase — ohne Graph. */
export async function dokumentPosteingangAusDbLaden(input: {
  supabaseAccessToken: string;
}): Promise<DokumentPosteingangSyncErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const rows = await leseAktiveEintraege(100);
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
  const maxAnalysen = Math.max(0, Math.min(input.maxAnalysen ?? 1, 1));

  if (maxAnalysen > 0) {
    const { accessToken } = await microsoftAccessToken();
    const offen = await naechsteOffeneMail();
    let aktualisiert: ReturnType<typeof zuEintrag>[] = [];
    if (offen) {
      await analysiereEintrag(accessToken, offen);
      aktualisiert = [zuEintrag(await leseEintrag(offen.id))];
    }

    return {
      postfaecher: [],
      nachrichten: [],
      eintraege: aktualisiert,
      offen: await zaehleOffene(),
    };
  }

  const { postfaecher, nachrichten } =
    await microsoftDokumentPosteingangLesenIntern({ anzahl: 50 });

  await eintraegeAnlegen(nachrichten);

  const rows = await leseEintraege(
    nachrichten.map((n) => ({ postfach: n.postfach, id: n.id })),
  );

  return {
    postfaecher,
    nachrichten,
    eintraege: rows.map(zuEintrag),
    offen: await zaehleOffene(),
  };
}

/**
 * Mindestabstand zwischen Anthropic-Starts (~5 Requests/Minute).
 * Dauert eine Analyse schon länger, wird nicht extra gewartet.
 */
const ANTHROPIC_MIN_ABSTAND_MS = 12_000;
/** Nach so vielen Fehlern in Folge: Lauf stoppen (vermutlich systemisch). */
const NACHTLAUF_MAX_FEHLER_IN_FOLGE = 3;
/**
 * Sicherheitslimit pro Invocation (zusätzlich zum Zeitbudget).
 * Reicht für große Posteingänge; echte Grenze ist deadlineMs / maxDuration.
 */
const NACHTLAUF_MAX_ANALYSEN_PRO_LAUF = 200;
/** Max. Selbst-Fortsetzungen nach dem ersten Cron-Trigger. */
export const NACHTLAUF_MAX_RUNDEN = 40;
/**
 * ~4,5 Min. unter Hobby-maxDuration 300s — Rest geht über Folge-Invocations.
 */
export const NACHTLAUF_DEFAULT_BUDGET_MS = 270_000;

function warteMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DokumentPosteingangNachtlaufErgebnis = {
  analysiert: number;
  fehlgeschlagen: number;
  offen: number;
  fortsetzen: boolean;
  abgebrochen?: "zu_viele_fehler" | "persistenz";
  inboxSyncFehler?: string;
};

/**
 * Nachtlauf ohne User-JWT: Posteingang listen, dann nacheinander analysieren
 * bis keine offenen Mails mehr da sind oder das Zeitbudget endet.
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

  if (inboxSync) {
    try {
      await loescheAlteRechnungsHistorie();
    } catch (err) {
      console.error("[dokument-postfach] Rechnungshistorie aufräumen", err);
    }

    try {
      const { nachrichten } = await microsoftDokumentPosteingangLesenIntern({
        anzahl: 50,
      });
      await eintraegeAnlegen(nachrichten);
    } catch (err) {
      inboxSyncFehler = fehlerText(err);
      console.error("[dokument-postfach] Inbox-Sync im Nachtlauf", err);
      // Bestehende „neu“-Einträge trotzdem analysieren.
    }
  }

  const { accessToken } = await microsoftAccessToken();
  let analysiert = 0;
  let fehlgeschlagen = 0;
  let fehlerInFolge = 0;
  let naechsterStartErlaubt = 0;
  let abgebrochen: DokumentPosteingangNachtlaufErgebnis["abgebrochen"];

  for (let i = 0; i < NACHTLAUF_MAX_ANALYSEN_PRO_LAUF; i++) {
    if (Date.now() >= deadlineMs) break;

    const offen = await naechsteOffeneMail();
    if (!offen) break;

    const warte = naechsterStartErlaubt - Date.now();
    if (warte > 0) {
      if (Date.now() + warte >= deadlineMs) break;
      await warteMs(warte);
    }
    naechsterStartErlaubt = Date.now() + ANTHROPIC_MIN_ABSTAND_MS;

    let ok: boolean;
    try {
      ok = await analysiereEintrag(accessToken, offen);
    } catch (err) {
      console.error(
        "[dokument-postfach] Unerwarteter Analysefehler",
        offen.id,
        err,
      );
      abgebrochen = "persistenz";
      break;
    }

    if (ok) {
      analysiert += 1;
      fehlerInFolge = 0;
    } else {
      fehlgeschlagen += 1;
      fehlerInFolge += 1;
      console.error(
        "[dokument-postfach] Analyse fehlgeschlagen, überspringe",
        offen.id,
        `(${fehlerInFolge}/${NACHTLAUF_MAX_FEHLER_IN_FOLGE} in Folge)`,
      );
      if (fehlerInFolge >= NACHTLAUF_MAX_FEHLER_IN_FOLGE) {
        abgebrochen = "zu_viele_fehler";
        break;
      }
    }
  }

  const nochOffen = await zaehleOffene();
  return {
    analysiert,
    fehlgeschlagen,
    offen: nochOffen,
    fortsetzen: !abgebrochen && nochOffen > 0,
    abgebrochen,
    inboxSyncFehler,
  };
}
