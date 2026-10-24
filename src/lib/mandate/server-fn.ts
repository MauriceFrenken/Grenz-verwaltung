/**
 * Server-Funktionen Mandate und Eigentümer-Report (Masterplan 4.3).
 * Zahlen kommen aus den sf_*-Caches und werden beim Anlegen eines Reports eingefroren.
 * Freigabe nur durch Nutzer; der Versand wird nach Bestätigung als Salesforce-Task protokolliert.
 */

import { createServerFn } from "@tanstack/react-start";

import { createServiceRoleClient, pruefeAufrufer, tokenAus } from "@/lib/server/aufrufer";
import { mitSfZugangOderSitzung, sfSitzungAus } from "@/lib/sf-sync/zugang";
import type { DateiErgebnis, DateiFormat } from "@/lib/vorlagen/export";

import { ladeMandatRohdaten, ladeMandatsliste, type MandatListenEintrag, type MandatRohdaten } from "./daten";
import { berechneReportKennzahlen, reportDokument, type ReportKennzahlen, type ReportTexte } from "./report";

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

function tagOder(wert: unknown, ersatz: string): string {
  return typeof wert === "string" && ISO_TAG.test(wert) ? wert : ersatz;
}

function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

function vorTagen(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function text(wert: unknown, max = 2000): string {
  return typeof wert === "string" ? wert.slice(0, max) : "";
}

export type ReportZeile = {
  id: string;
  titel: string | null;
  zeitraumVon: string;
  zeitraumBis: string;
  status: "entwurf" | "freigegeben" | "versendet";
  createdAt: string;
  freigegebenAm: string | null;
  versendetAm: string | null;
  versendetAn: string | null;
  sfTaskId: string | null;
};

function reportZeile(r: Record<string, unknown>): ReportZeile {
  return {
    id: String(r.id),
    titel: (r.titel as string) ?? null,
    zeitraumVon: String(r.zeitraum_von),
    zeitraumBis: String(r.zeitraum_bis),
    status: r.status as ReportZeile["status"],
    createdAt: String(r.created_at),
    freigegebenAm: (r.freigegeben_am as string) ?? null,
    versendetAm: (r.versendet_am as string) ?? null,
    versendetAn: (r.versendet_an as string) ?? null,
    sfTaskId: (r.sf_task_id as string) ?? null,
  };
}

const REPORT_SPALTEN =
  "id, titel, zeitraum_von, zeitraum_bis, status, created_at, freigegeben_am, versendet_am, versendet_an, sf_task_id";

export const mandateListeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<MandatListenEintrag[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return ladeMandatsliste(createServiceRoleClient());
  });

export type MandatDetail = {
  mandat: MandatRohdaten["mandat"];
  objekt: {
    objektart: string | null;
    baujahr: number | null;
    wohnflaeche: number | null;
    gewerbeflaeche: number | null;
    einheiten: number | null;
    jahresmiete: number | null;
  } | null;
  vorschau: ReportKennzahlen;
  reports: ReportZeile[];
};

export const mandatDetailFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { sfId?: unknown; von?: unknown; bis?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      sfId: text(d.sfId, 18),
      von: tagOder(d.von, vorTagen(30)),
      bis: tagOder(d.bis, heute()),
    };
  })
  .handler(async ({ data }): Promise<MandatDetail> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const roh = await ladeMandatRohdaten(admin, data.sfId);
    const { data: reports, error } = await admin
      .from("eigentuemer_reports")
      .select(REPORT_SPALTEN)
      .eq("mandat_sf_id", data.sfId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const o = roh.objekt;
    const n = (v: unknown) => (v == null ? null : Number(v));
    return {
      mandat: roh.mandat,
      objekt: o
        ? {
            objektart: (o.objektart as string) ?? null,
            baujahr: n(o.baujahr),
            wohnflaeche: n(o.wohnflaeche_m2),
            gewerbeflaeche: n(o.gewerbeflaeche_m2),
            einheiten: n(o.einheiten),
            jahresmiete: n(o.jahresnettokaltmiete),
          }
        : null,
      vorschau: berechneReportKennzahlen({ ...roh, von: data.von, bis: data.bis }),
      reports: (reports ?? []).map(reportZeile),
    };
  });

export type ReportVoll = ReportZeile & {
  mandatSfId: string;
  kennzahlen: ReportKennzahlen;
  texte: ReportTexte;
  eigentuemerEmail: string | null;
};

async function ladeReport(id: string): Promise<ReportVoll> {
  const admin = createServiceRoleClient();
  const { data: r, error } = await admin
    .from("eigentuemer_reports")
    .select(`${REPORT_SPALTEN}, mandat_sf_id, kennzahlen, inhalt`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) throw new Error("Report nicht gefunden.");
  const { data: m } = await admin
    .from("sf_mandate")
    .select("eigentuemer_kontakt_sf_id")
    .eq("sf_id", r.mandat_sf_id)
    .maybeSingle();
  const { data: k } = m?.eigentuemer_kontakt_sf_id
    ? await admin.from("sf_kontakte").select("email").eq("sf_id", m.eigentuemer_kontakt_sf_id).maybeSingle()
    : { data: null };
  return {
    ...reportZeile(r),
    mandatSfId: String(r.mandat_sf_id),
    kennzahlen: r.kennzahlen as ReportKennzahlen,
    texte: (r.inhalt ?? {}) as ReportTexte,
    eigentuemerEmail: (k?.email as string) ?? null,
  };
}

export const reportAnlegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { sfId?: unknown; von?: unknown; bis?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      sfId: text(d.sfId, 18),
      von: tagOder(d.von, vorTagen(30)),
      bis: tagOder(d.bis, heute()),
    };
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const aufrufer = await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    if (data.von > data.bis) throw new Error("Der Zeitraum ist ungültig.");
    const admin = createServiceRoleClient();
    const roh = await ladeMandatRohdaten(admin, data.sfId);
    const kennzahlen = berechneReportKennzahlen({ ...roh, von: data.von, bis: data.bis });
    const { data: neu, error } = await admin
      .from("eigentuemer_reports")
      .insert({
        mandat_sf_id: data.sfId,
        zeitraum_von: data.von,
        zeitraum_bis: data.bis,
        titel: `Vermarktungsbericht ${roh.mandat.objekt ?? roh.mandat.name}`,
        kennzahlen,
        inhalt: {},
        status: "entwurf",
        erstellt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(neu.id) };
  });

export const reportLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data), id: text((data as { id?: unknown })?.id, 40) }))
  .handler(async ({ data }): Promise<ReportVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return ladeReport(data.id);
  });

function texteAus(wert: unknown): ReportTexte {
  const t = (wert ?? {}) as Record<string, unknown>;
  const liste = (v: unknown) => (Array.isArray(v) ? v.map((x) => text(x, 600)).filter((x) => x.trim()) : []);
  return {
    einleitung: text(t.einleitung, 3000),
    kommentar: text(t.kommentar, 3000),
    naechsteSchritte: liste(t.naechsteSchritte).slice(0, 12),
    marktfeedbackLuecken: liste(t.marktfeedbackLuecken).slice(0, 12),
    marktfeedback: Array.isArray(t.marktfeedback)
      ? t.marktfeedback
          .map((a: { text?: unknown; quellen?: unknown }) => ({
            text: text(a?.text, 800),
            quellen: Array.isArray(a?.quellen) ? a.quellen.map((q) => text(q, 18)).filter(Boolean) : [],
          }))
          .filter((a) => a.text.trim())
          .slice(0, 12)
      : [],
  };
}

/** Texte speichern. Eine Änderung nach der Freigabe setzt den Report auf Entwurf zurück. */
export const reportTexteSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
    texte: texteAus((data as { texte?: unknown })?.texte),
  }))
  .handler(async ({ data }): Promise<ReportVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const vorher = await ladeReport(data.id);
    if (vorher.status === "versendet") throw new Error("Ein versendeter Report kann nicht mehr geändert werden.");
    const { error } = await createServiceRoleClient()
      .from("eigentuemer_reports")
      .update({
        inhalt: data.texte,
        status: "entwurf",
        freigegeben_von: null,
        freigegeben_am: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return ladeReport(data.id);
  });

/** KI-Entwurf für das Marktfeedback. Ergebnis wird als Entwurf vorgeschlagen, nicht gespeichert. */
export const reportMarktfeedbackFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data), id: text((data as { id?: unknown })?.id, 40) }))
  .handler(async ({ data }): Promise<Pick<ReportTexte, "marktfeedback" | "marktfeedbackLuecken">> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const report = await ladeReport(data.id);
    const admin = createServiceRoleClient();
    const roh = await ladeMandatRohdaten(admin, report.mandatSfId);
    const { imZeitraum } = await import("./report");
    const { marktfeedbackEntwurf } = await import("./marktfeedback-ki");
    return marktfeedbackEntwurf({
      objekt: roh.mandat.objekt ?? roh.mandat.name,
      aktivitaeten: imZeitraum(roh.aktivitaeten, report.zeitraumVon, report.zeitraumBis).filter((a) =>
        report.kennzahlen.aktivitaetsListe.some((x) => x.sfId === a.sf_id),
      ),
      mitglieder: roh.mitglieder,
    });
  });

export const reportFreigebenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data), id: text((data as { id?: unknown })?.id, 40) }))
  .handler(async ({ data }): Promise<ReportVoll> => {
    const aufrufer = await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    if (aufrufer.userId === "cron") throw new Error("Freigeben kann nur ein Nutzer.");
    const report = await ladeReport(data.id);
    if (report.status !== "entwurf") return report;
    const admin = createServiceRoleClient();
    const { dokumentErzeugen } = await import("@/lib/vorlagen/export");
    const inhalt = reportDokument(report.kennzahlen, report.texte, { titel: report.titel ?? undefined, freigegeben: true });
    const { datei, dateiname, mime } = await dokumentErzeugen(admin, inhalt, "pdf");
    const pfad = `eigentuemer-reports/${report.mandatSfId}/${report.id}/${dateiname}`;
    const { error: e1 } = await admin.storage.from("dokumente").upload(pfad, datei, { contentType: mime, upsert: true });
    if (e1) throw new Error(e1.message);
    const { error } = await admin
      .from("eigentuemer_reports")
      .update({
        status: "freigegeben",
        freigegeben_von: aufrufer.userId,
        freigegeben_am: new Date().toISOString(),
        datei_pfad: pfad,
        quellen: inhalt.quellen,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return ladeReport(data.id);
  });

export const reportDateiFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
    format: ((data as { format?: unknown })?.format === "pptx" ? "pptx" : "pdf") as DateiFormat,
  }))
  .handler(async ({ data }): Promise<DateiErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const report = await ladeReport(data.id);
    const { dokumentAlsDownload } = await import("@/lib/vorlagen/export");
    const inhalt = reportDokument(report.kennzahlen, report.texte, {
      titel: report.titel ?? undefined,
      freigegeben: report.status !== "entwurf",
    });
    return dokumentAlsDownload(createServiceRoleClient(), inhalt, data.format);
  });

/**
 * Versand protokollieren: legt nach Bestätigung in der UI eine erledigte Aufgabe am Mandat in
 * Salesforce an (Masterplan: nichts in Salesforce ohne Bestätigung) und setzt den Report auf versendet.
 */
export const reportVersandProtokollierenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown; empfaenger?: unknown; bestaetigt?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      id: text(d.id, 40),
      empfaenger: text(d.empfaenger, 300).trim(),
      bestaetigt: d.bestaetigt === true,
      sfSitzung: sfSitzungAus(data),
    };
  })
  .handler(async ({ data }): Promise<ReportVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    if (!data.bestaetigt) throw new Error("Der Schritt muss in der App bestätigt werden.");
    if (!data.empfaenger) throw new Error("Bitte den Empfänger angeben.");
    const report = await ladeReport(data.id);
    if (report.status !== "freigegeben") throw new Error("Nur freigegebene Reports können als versendet protokolliert werden.");
    const admin = createServiceRoleClient();
    const { data: m } = await admin
      .from("sf_mandate")
      .select("eigentuemer_kontakt_sf_id")
      .eq("sf_id", report.mandatSfId)
      .maybeSingle();
    const zeitraum = `${report.zeitraumVon} bis ${report.zeitraumBis}`;
    const { sfCreate } = await import("@/lib/sf-sync/schreiben");
    const taskId = await mitSfZugangOderSitzung(data.sfSitzung, () =>
      sfCreate(admin, "Task", {
        Subject: `Vermarktungsbericht versendet (${zeitraum})`,
        WhatId: report.mandatSfId,
        ...(m?.eigentuemer_kontakt_sf_id ? { WhoId: m.eigentuemer_kontakt_sf_id } : {}),
        Status: "Completed",
        ActivityDate: heute(),
        Description: `Vermarktungsbericht für den Zeitraum ${zeitraum} an ${data.empfaenger} versendet. Erstellt in der Grenz & Co. App.`,
      }),
    );
    const { error } = await admin
      .from("eigentuemer_reports")
      .update({
        status: "versendet",
        versendet_am: new Date().toISOString(),
        versendet_an: data.empfaenger,
        sf_task_id: taskId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return ladeReport(data.id);
  });
