/**
 * Server-Funktionen Mandate und Eigentümer-Report (Masterplan 4.3).
 * Zahlen kommen aus den sf_*-Caches und werden beim Anlegen eines Reports eingefroren.
 * Freigabe nur durch Nutzer; der Versand wird nach Bestätigung als Salesforce-Task protokolliert.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";
import { mitSfZugangOderSitzung, sfSitzungAus } from "@/lib/sf-sync/zugang";
import type { DateiErgebnis, DateiFormat } from "@/lib/vorlagen/export";

import {
  ladeMandatRohdaten,
  ladeMandatsliste,
  ladeVermarktung,
  type MandatListenEintrag,
  type MandatRohdaten,
} from "./daten";
import {
  berechneReportKennzahlen,
  reportDokument,
  type ReportKennzahlen,
  type ReportTexte,
} from "./report";
import {
  KUNDENGRUPPEN,
  STATUS_STUFEN,
  standardVorgehen,
  type BerichtWerte,
} from "./vermarktungsbericht";

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
      vorschau: berechneReportKennzahlen({
        ...roh,
        von: data.von,
        bis: data.bis,
      }),
      reports: (reports ?? []).map(reportZeile),
    };
  });

export type ReportVoll = ReportZeile & {
  mandatSfId: string;
  kennzahlen: ReportKennzahlen;
  texte: ReportTexte;
  eigentuemerEmail: string | null;
  /** Signierte Links (1 Stunde) für die Vorschau der Fotos. */
  fotoUrls: { titel: string | null; objekt: string | null };
};

async function fotoUrl(
  pfad: string | null | undefined,
): Promise<string | null> {
  if (!pfad) return null;
  const { data } = await createServiceRoleClient()
    .storage.from("dokumente")
    .createSignedUrl(pfad, 3600);
  return data?.signedUrl ?? null;
}

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
    ? await admin
        .from("sf_kontakte")
        .select("email")
        .eq("sf_id", m.eigentuemer_kontakt_sf_id)
        .maybeSingle()
    : { data: null };
  const texte = (r.inhalt ?? {}) as ReportTexte;
  const [titel, objekt] = await Promise.all([
    fotoUrl(texte.fotos?.titel),
    fotoUrl(texte.fotos?.objekt),
  ]);
  return {
    ...reportZeile(r),
    mandatSfId: String(r.mandat_sf_id),
    kennzahlen: r.kennzahlen as ReportKennzahlen,
    texte,
    eigentuemerEmail: (k?.email as string) ?? null,
    fotoUrls: { titel, objekt },
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
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    if (data.von > data.bis) throw new Error("Der Zeitraum ist ungültig.");
    const admin = createServiceRoleClient();
    const roh = await ladeMandatRohdaten(admin, data.sfId);
    const kennzahlen: ReportKennzahlen = {
      ...berechneReportKennzahlen({ ...roh, von: data.von, bis: data.bis }),
      vermarktung: await ladeVermarktung(admin, roh),
    };
    const { data: neu, error } = await admin
      .from("eigentuemer_reports")
      .insert({
        mandat_sf_id: data.sfId,
        zeitraum_von: data.von,
        zeitraum_bis: data.bis,
        titel: `Vermarktungsbericht ${roh.mandat.objekt ?? roh.mandat.name}`,
        kennzahlen,
        inhalt: {
          naechsteSchritte: standardVorgehen(kennzahlen.vermarktung?.status),
        } satisfies ReportTexte,
        status: "entwurf",
        erstellt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(neu.id) };
  });

export const reportLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<ReportVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return ladeReport(data.id);
  });

function texteAus(wert: unknown): ReportTexte {
  const t = (wert ?? {}) as Record<string, unknown>;
  const liste = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => text(x, 600)).filter((x) => x.trim()) : [];
  const zahlen = <K extends string>(v: unknown, schluessel: readonly K[]) => {
    const o = (v ?? {}) as Record<string, unknown>;
    const r: Partial<Record<K, number>> = {};
    for (const k of schluessel) {
      const n = o[k];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0)
        r[k] = Math.round(Math.min(n, 1_000_000));
    }
    return r;
  };
  const w = (t.werte ?? {}) as Record<string, unknown>;
  const werte: BerichtWerte = {};
  for (const feld of [
    "titel",
    "objektbezeichnung",
    "objektanschrift",
    "objekttyp",
    "auftraggeber",
    "vermarktungsbeginn",
    "berichtsdatum",
  ] as const)
    if (typeof w[feld] === "string" && (w[feld] as string).trim())
      werte[feld] = text(w[feld], 300);
  if (w.status)
    werte.status = zahlen(
      w.status,
      STATUS_STUFEN.map((x) => x.key),
    );
  if (w.kundengruppen)
    werte.kundengruppen = zahlen(
      w.kundengruppen,
      KUNDENGRUPPEN.map((x) => x.key),
    );
  if (Array.isArray(w.absagegruende))
    werte.absagegruende = w.absagegruende
      .map((g: { grund?: unknown; anzahl?: unknown }) => ({
        grund: text(g?.grund, 120),
        anzahl:
          typeof g?.anzahl === "number" && Number.isFinite(g.anzahl)
            ? Math.max(0, Math.round(g.anzahl))
            : 0,
      }))
      .slice(0, 15);
  const f = (t.fotos ?? {}) as Record<string, unknown>;
  const pfad = (v: unknown) =>
    typeof v === "string" && v.startsWith("eigentuemer-reports/")
      ? v.slice(0, 300)
      : null;
  return {
    werte,
    herausforderungen: Array.isArray(t.herausforderungen)
      ? liste(t.herausforderungen).slice(0, 12)
      : undefined,
    fotos: { titel: pfad(f.titel), objekt: pfad(f.objekt) },
    einleitung: text(t.einleitung, 3000),
    kommentar: text(t.kommentar, 3000),
    naechsteSchritte: liste(t.naechsteSchritte).slice(0, 12),
    marktfeedbackLuecken: liste(t.marktfeedbackLuecken).slice(0, 12),
    marktfeedback: Array.isArray(t.marktfeedback)
      ? t.marktfeedback
          .map((a: { text?: unknown; quellen?: unknown }) => ({
            text: text(a?.text, 800),
            quellen: Array.isArray(a?.quellen)
              ? a.quellen.map((q) => text(q, 18)).filter(Boolean)
              : [],
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
    if (vorher.status === "versendet")
      throw new Error(
        "Ein versendeter Report kann nicht mehr geändert werden.",
      );
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
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(
    async ({
      data,
    }): Promise<
      Pick<ReportTexte, "marktfeedback" | "marktfeedbackLuecken">
    > => {
      await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
      const report = await ladeReport(data.id);
      const admin = createServiceRoleClient();
      const roh = await ladeMandatRohdaten(admin, report.mandatSfId);
      const { imZeitraum } = await import("./report");
      const { marktfeedbackEntwurf } = await import("./marktfeedback-ki");
      return marktfeedbackEntwurf({
        objekt: roh.mandat.objekt ?? roh.mandat.name,
        aktivitaeten: imZeitraum(
          roh.aktivitaeten,
          report.zeitraumVon,
          report.zeitraumBis,
        ).filter((a) =>
          report.kennzahlen.aktivitaetsListe.some((x) => x.sfId === a.sf_id),
        ),
        mitglieder: roh.mitglieder,
      });
    },
  );

export const reportFreigebenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<ReportVoll> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    if (aufrufer.userId === "cron")
      throw new Error("Freigeben kann nur ein Nutzer.");
    const report = await ladeReport(data.id);
    if (report.status !== "entwurf") return report;
    const admin = createServiceRoleClient();
    const { berichtDatei } = await import("./bericht-export");
    const inhalt = reportDokument(report.kennzahlen, report.texte, {
      titel: report.titel ?? undefined,
      freigegeben: true,
    });
    const { datei, dateiname, mime } = await berichtDatei(
      admin,
      { ...report, status: "freigegeben" },
      "pdf",
    );
    const pfad = `eigentuemer-reports/${report.mandatSfId}/${report.id}/${dateiname}`;
    const { error: e1 } = await admin.storage
      .from("dokumente")
      .upload(pfad, datei, { contentType: mime, upsert: true });
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
    format: ((data as { format?: unknown })?.format === "pptx"
      ? "pptx"
      : "pdf") as DateiFormat,
  }))
  .handler(async ({ data }): Promise<DateiErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const report = await ladeReport(data.id);
    const { berichtDatei } = await import("./bericht-export");
    const { datei, dateiname, mime } = await berichtDatei(
      createServiceRoleClient(),
      report,
      data.format,
    );
    return { dateiname, mime, base64: datei.toString("base64") };
  });

/**
 * Zahlen aus Salesforce neu laden (gleicher Zeitraum). Händische Werte und Texte bleiben,
 * sie haben weiter Vorrang. Setzt den Report auf Entwurf zurück.
 */
export const reportAktualisierenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<ReportVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const report = await ladeReport(data.id);
    if (report.status === "versendet")
      throw new Error(
        "Ein versendeter Report kann nicht mehr geändert werden.",
      );
    const admin = createServiceRoleClient();
    const roh = await ladeMandatRohdaten(admin, report.mandatSfId);
    const kennzahlen: ReportKennzahlen = {
      ...berechneReportKennzahlen({
        ...roh,
        von: report.zeitraumVon,
        bis: report.zeitraumBis,
      }),
      vermarktung: await ladeVermarktung(admin, roh),
    };
    const texte = report.texte.naechsteSchritte?.length
      ? report.texte
      : {
          ...report.texte,
          naechsteSchritte: standardVorgehen(kennzahlen.vermarktung?.status),
        };
    const { error } = await admin
      .from("eigentuemer_reports")
      .update({
        kennzahlen,
        inhalt: texte,
        status: "entwurf",
        freigegeben_von: null,
        freigegeben_am: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return ladeReport(data.id);
  });

/**
 * Foto für Titelseite oder Zielgruppen-Seite hochladen (leeres base64 entfernt es).
 * Speichert nur den Pfad in inhalt.fotos; andere ungespeicherte Texte bleiben unberührt.
 */
export const reportFotoFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      id?: unknown;
      rolle?: unknown;
      base64?: unknown;
    };
    return {
      supabaseAccessToken: tokenAus(data),
      id: text(d.id, 40),
      rolle: (d.rolle === "objekt" ? "objekt" : "titel") as "titel" | "objekt",
      base64: typeof d.base64 === "string" ? d.base64 : "",
    };
  })
  .handler(
    async ({ data }): Promise<{ pfad: string | null; url: string | null }> => {
      await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
      const report = await ladeReport(data.id);
      if (report.status === "versendet")
        throw new Error(
          "Ein versendeter Report kann nicht mehr geändert werden.",
        );
      const admin = createServiceRoleClient();
      let pfad: string | null = null;
      if (data.base64) {
        const datei = Buffer.from(data.base64, "base64");
        if (datei.length > 4 * 1024 * 1024)
          throw new Error("Das Foto ist größer als 4 MB.");
        const { bildGroesse } = await import("./bericht-export");
        if (!bildGroesse(datei))
          throw new Error("Bitte ein JPEG- oder PNG-Foto wählen.");
        const png = datei[0] === 0x89;
        pfad = `eigentuemer-reports/${report.mandatSfId}/${report.id}/foto-${data.rolle}-${Date.now()}.${png ? "png" : "jpg"}`;
        const { error } = await admin.storage
          .from("dokumente")
          .upload(pfad, datei, {
            contentType: png ? "image/png" : "image/jpeg",
          });
        if (error) throw new Error(error.message);
      }
      const alt = report.texte.fotos?.[data.rolle];
      const { error } = await admin
        .from("eigentuemer_reports")
        .update({
          inhalt: {
            ...report.texte,
            fotos: { ...report.texte.fotos, [data.rolle]: pfad },
          },
          status: "entwurf",
          freigegeben_von: null,
          freigegeben_am: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      if (alt && alt !== pfad)
        await admin.storage.from("dokumente").remove([alt]);
      return { pfad, url: await fotoUrl(pfad) };
    },
  );

/**
 * Versand protokollieren: legt nach Bestätigung in der UI eine erledigte Aufgabe am Mandat in
 * Salesforce an (Masterplan: nichts in Salesforce ohne Bestätigung) und setzt den Report auf versendet.
 */
export const reportVersandProtokollierenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      id?: unknown;
      empfaenger?: unknown;
      bestaetigt?: unknown;
    };
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
    if (!data.bestaetigt)
      throw new Error("Der Schritt muss in der App bestätigt werden.");
    if (!data.empfaenger) throw new Error("Bitte den Empfänger angeben.");
    const report = await ladeReport(data.id);
    if (report.status !== "freigegeben")
      throw new Error(
        "Nur freigegebene Reports können als versendet protokolliert werden.",
      );
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
        ...(m?.eigentuemer_kontakt_sf_id
          ? { WhoId: m.eigentuemer_kontakt_sf_id }
          : {}),
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
