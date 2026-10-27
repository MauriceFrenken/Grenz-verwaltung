/**
 * Server-Funktionen Bewertung der Mandatsakte: Vorbelegung aus Salesforce, Vergleichsobjekte aus
 * den Grenz-Vergleichsdaten, Angebotsmarkt des jüngsten Marktberichts, Fotos des Objektordners.
 * Die Wertindikation selbst rechnet bewertung.ts (auch im Browser). Die PowerPoint baut der Browser
 * aus der Original-Vorlage „Vermarktungseinschätzung“, das PDF wandelt Microsoft 365 um.
 *
 * Versionen liegen in dokument_entwuerfe (typ "pitch", inhalt.format "grenz-einschaetzung").
 */

import { createServerFn } from "@tanstack/react-start";

import type { VergleichMitAbstand } from "@/lib/ki-tools/vergleiche";
import type {
  Benchmark,
  MarktberichtKennzahlen,
} from "@/lib/marktbericht/typen";
import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  bewertungDateiname,
  eingabeAusSalesforce,
  FORMAT_BEWERTUNG,
  STANDARD_EINSTELLUNGEN,
  type BewertungsEingabe,
  type BewertungsEinstellungen,
  type BewertungsEntscheidung,
  type Herkunft,
  type MarktReferenz,
} from "./bewertung";
import { fotosFuerExpose } from "./expose";
import type { ExposeFoto } from "./expose-server-fn";
import {
  PDF_TEIL_BYTES,
  pdfLink,
  pdfTeilHochladen,
  pdfUmwandelnUndAblegen,
  pdfUploadStarten,
  type PdfUpload,
} from "./pdf-umwandlung";

type Admin = ReturnType<typeof createServiceRoleClient>;

/** dokument_entwuerfe.typ erlaubt expose, teaser, pitch; die Einschätzung ist der Akquise-Pitch. */
const TYP = "pitch";

type Inhalt = {
  format: typeof FORMAT_BEWERTUNG;
  eingabe: BewertungsEingabe;
  herkunft: Herkunft;
  einstellungen: BewertungsEinstellungen;
  /** Vergleichsobjekte zum Stand der letzten Speicherung (Umkreis, Alter, Nutzungsart). */
  pool: VergleichMitAbstand[];
  ausgeschlossen: string[];
  imPdf: string[] | null;
  markt: MarktReferenz | null;
  entscheidung: BewertungsEntscheidung;
  fotos: ExposeFoto[];
  ordner: { name: string; webUrl: string | null } | null;
  /** Woher die Koordinaten stammen. */
  geo: "salesforce" | "adresse" | null;
  pdfUpload?: PdfUpload | null;
};

export type BewertungZeile = {
  id: string;
  titel: string;
  version: number;
  updatedAt: string;
  hatPdf: boolean;
};

export type Bewertung = BewertungZeile & Omit<Inhalt, "format" | "pdfUpload">;

const SPALTEN = "id, titel, version, updated_at, datei_pfad";

function text(wert: unknown, max = 200): string {
  return typeof wert === "string" ? wert.slice(0, max) : "";
}

function zeile(r: Record<string, unknown>): BewertungZeile {
  return {
    id: String(r.id),
    titel: String(r.titel),
    version: Number(r.version ?? 1),
    updatedAt: String(r.updated_at),
    hatPdf: Boolean(r.datei_pfad),
  };
}

async function ladeRoh(admin: Admin, id: string) {
  const { data, error } = await admin
    .from("dokument_entwuerfe")
    .select(`${SPALTEN}, mandat_sf_id, inhalt`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const inhalt = data?.inhalt as Inhalt | undefined;
  if (!data || inhalt?.format !== FORMAT_BEWERTUNG)
    throw new Error("Bewertung nicht gefunden.");
  return {
    ...zeile(data),
    mandatSfId: String(data.mandat_sf_id),
    dateiPfad: (data.datei_pfad as string) ?? null,
    inhalt,
  };
}

function dto(roh: Awaited<ReturnType<typeof ladeRoh>>): Bewertung {
  const { format: _f, pdfUpload: _p, ...rest } = roh.inhalt;
  return {
    id: roh.id,
    titel: roh.titel,
    version: roh.version,
    updatedAt: roh.updatedAt,
    hatPdf: roh.hatPdf,
    ...rest,
  };
}

async function speichern(
  admin: Admin,
  id: string,
  aenderung: Record<string, unknown>,
) {
  const { error } = await admin
    .from("dokument_entwuerfe")
    .update({ ...aenderung, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Koordinaten aus Salesforce, sonst über die Adresse. */
async function mitKoordinaten(
  eingabe: BewertungsEingabe,
  geo: Inhalt["geo"],
  adresseGeaendert: boolean,
): Promise<{ eingabe: BewertungsEingabe; geo: Inhalt["geo"] }> {
  if (eingabe.lat != null && eingabe.lng != null && !adresseGeaendert)
    return { eingabe, geo };
  if (!eingabe.strasse && !eingabe.plz && !eingabe.ort)
    return { eingabe: { ...eingabe, lat: null, lng: null }, geo: null };
  const { geocodeExpose } = await import("@/lib/expose-karte/geocode");
  const t = await geocodeExpose({
    adresse: eingabe.strasse,
    plz: eingabe.plz,
    stadt: eingabe.ort,
  }).catch(() => null);
  return t
    ? { eingabe: { ...eingabe, lat: t.lat, lng: t.lng }, geo: "adresse" }
    : { eingabe: { ...eingabe, lat: null, lng: null }, geo: null };
}

async function vergleichsPool(
  admin: Admin,
  eingabe: BewertungsEingabe,
  einstellungen: BewertungsEinstellungen,
): Promise<VergleichMitAbstand[]> {
  const { vergleichsdaten } = await import("@/lib/ki-tools/vergleiche-server");
  const { bewerte } = await import("@/lib/ki-tools/vergleiche");
  const { flaecheVon } = await import("./bewertung");
  return bewerte(
    {
      bezeichnung: eingabe.bezeichnung,
      objektart: eingabe.objektart,
      flaeche: flaecheVon(eingabe),
      jahresmiete: eingabe.mieteJahrIst,
      baujahr: eingabe.baujahr,
      einheiten: eingabe.wohneinheiten,
      lat: eingabe.lat,
      lng: eingabe.lng,
    },
    await vergleichsdaten(admin),
    { ...einstellungen, abschlagProzent: null },
  ).vergleiche;
}

const REGION_TEILMARKT: Record<string, RegExp> = {
  Köln: /köln|koeln|cologne/i,
  Düsseldorf: /düsseldorf|duesseldorf/i,
  Bonn: /bonn/i,
};

/** Angebotsmarkt des Teilmarkts aus dem jüngsten Marktbericht (freigegebene bevorzugt). */
async function marktReferenz(
  admin: Admin,
  eingabe: BewertungsEingabe,
): Promise<MarktReferenz | null> {
  const { data, error } = await admin
    .from("marktberichte")
    .select("id, titel, status, stichtag, kennzahlen, inhalt")
    .order("stichtag", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(6);
  if (error || !data?.length) return null;
  const bericht = data.find((b) => b.status === "freigegeben") ?? data[0];
  const k = bericht.kennzahlen as MarktberichtKennzahlen;
  const { teilmarktAus } = await import("@/lib/marktbericht/teilmarkt");
  const tm = teilmarktAus(eingabe.ort, eingabe.plz);
  const zeilen = k.angebot?.zeilen ?? [];
  const z =
    zeilen.find((x) => x.teilmarkt === tm && (x.faktor || x.preisM2)) ??
    zeilen.find((x) => x.teilmarkt === "Gesamt");
  const region = REGION_TEILMARKT[tm];
  const roh = (bericht.inhalt as { benchmarks?: Benchmark[] })?.benchmarks;
  const benchmarks = (Array.isArray(roh) ? roh : [])
    .filter((b) => b.geprueft)
    .filter((b) =>
      region ? region.test(b.region) : /rheinland|nrw/i.test(b.region),
    )
    .sort((a, b) => (b.relevanz ?? 0) - (a.relevanz ?? 0))
    .slice(0, 4)
    .map((b) => ({
      kennzahl: b.kennzahl,
      region: b.region,
      wert: b.wert,
      einheit: b.einheit,
      quelle: b.quelle,
      stichtag: b.stichtag,
    }));
  return {
    berichtId: String(bericht.id),
    titel: String(bericht.titel),
    stichtag: String(bericht.stichtag),
    teilmarkt: z?.teilmarkt === "Gesamt" ? "Rheinland gesamt" : tm,
    faktor: z?.faktor ?? null,
    preisM2: z?.preisM2 ?? null,
    mieteM2: z?.mieteM2 ?? null,
    benchmarks,
  };
}

export const bewertungListeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    mandatSfId: text((data as { mandatSfId?: unknown })?.mandatSfId, 18),
  }))
  .handler(async ({ data }): Promise<BewertungZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const { data: rows, error } = await createServiceRoleClient()
      .from("dokument_entwuerfe")
      .select(SPALTEN)
      .eq("mandat_sf_id", data.mandatSfId)
      .eq("typ", TYP)
      .eq("inhalt->>format", FORMAT_BEWERTUNG)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(zeile);
  });

export const bewertungLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<Bewertung> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return dto(await ladeRoh(createServiceRoleClient(), data.id));
  });

/**
 * Neue Version. Die erste kommt aus Salesforce; jede weitere übernimmt Objektdaten, Einstellungen
 * und Entscheidung der Vorversion und sucht Vergleiche und Marktbericht neu.
 */
export const bewertungAnlegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    mandatSfId: text((data as { mandatSfId?: unknown })?.mandatSfId, 18),
  }))
  .handler(async ({ data }): Promise<Bewertung> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    const { data: mandat, error } = await admin
      .from("sf_mandate")
      .select("*")
      .eq("sf_id", data.mandatSfId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!mandat)
      throw new Error(
        "Mandat nicht gefunden. Bitte den Salesforce-Sync ausführen.",
      );
    const objekt = mandat.real_estate_sf_id
      ? ((
          await admin
            .from("sf_real_estate")
            .select("*")
            .eq("sf_id", mandat.real_estate_sf_id)
            .maybeSingle()
        ).data ?? null)
      : null;

    const { data: letzte } = await admin
      .from("dokument_entwuerfe")
      .select("version, inhalt")
      .eq("mandat_sf_id", data.mandatSfId)
      .eq("typ", TYP)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const vorher =
      (letzte?.inhalt as Inhalt | undefined)?.format === FORMAT_BEWERTUNG
        ? (letzte!.inhalt as Inhalt)
        : null;

    const sf = eingabeAusSalesforce(mandat, objekt);
    const eigentuemerId =
      objekt?.eigentuemer_kontakt_sf_id ?? objekt?.eigentuemer_account_sf_id;
    const eigentuemer = eigentuemerId
      ? ((
          await admin
            .from("sf_kontakte")
            .select("name")
            .eq("sf_id", eigentuemerId)
            .maybeSingle()
        ).data?.name as string | undefined)
      : undefined;
    const basis = vorher
      ? { eingabe: vorher.eingabe, geo: vorher.geo }
      : {
          eingabe: sf.eingabe,
          geo: sf.eingabe.lat != null ? ("salesforce" as const) : null,
        };
    const { eingabe, geo } = await mitKoordinaten(
      basis.eingabe,
      basis.geo,
      false,
    );
    const einstellungen = vorher?.einstellungen ?? STANDARD_EINSTELLUNGEN;

    const { mandatOrdnerLaden } = await import("./ordner-server-fn");
    const ordner = await mandatOrdnerLaden(admin, data.mandatSfId).catch(
      () => null,
    );
    const inhalt: Inhalt = {
      format: FORMAT_BEWERTUNG,
      eingabe,
      herkunft: vorher?.herkunft ?? sf.herkunft,
      einstellungen,
      pool: await vergleichsPool(admin, eingabe, einstellungen),
      ausgeschlossen: vorher?.ausgeschlossen ?? [],
      imPdf: vorher?.imPdf ?? null,
      markt: await marktReferenz(admin, eingabe).catch(() => null),
      entscheidung: vorher
        ? {
            ...vorher.entscheidung,
            datum: new Date().toISOString().slice(0, 10),
          }
        : {
            empfaenger: eigentuemer ?? "",
            datum: new Date().toISOString().slice(0, 10),
            preisGrenz: null,
            preisAnmerkung: "",
            preisEigentuemer: sf.preisEigentuemer,
            zusammenfassung: null,
            vorgehen: null,
          },
      fotos: ordner
        ? fotosFuerExpose(ordner.dateien).map((d) => ({
            id: d.id,
            name: d.name,
          }))
        : [],
      ordner: ordner?.ordner
        ? { name: ordner.ordner.name, webUrl: ordner.ordner.webUrl }
        : null,
      geo,
      pdfUpload: null,
    };
    const { data: neu, error: e2 } = await admin
      .from("dokument_entwuerfe")
      .insert({
        typ: TYP,
        titel: `Einschätzung ${eingabe.bezeichnung}`,
        mandat_sf_id: data.mandatSfId,
        inhalt,
        status: "entwurf",
        version: Number(letzte?.version ?? 0) + 1,
        erstellt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    return dto(await ladeRoh(admin, String(neu.id)));
  });

function zahlOderNull(wert: unknown): number | null {
  if (wert === "" || wert == null) return null;
  const n = Number(wert);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function eingabeAus(roh: unknown): BewertungsEingabe {
  const d = (roh ?? {}) as Record<string, unknown>;
  const t = (k: string) => text(d[k], 200).trim() || null;
  const n = (k: string) => zahlOderNull(d[k]);
  return {
    bezeichnung: text(d.bezeichnung, 200).trim() || "Liegenschaft",
    strasse: t("strasse"),
    plz: t("plz"),
    ort: t("ort"),
    objektart: t("objektart"),
    baujahr: n("baujahr"),
    grundstueck: n("grundstueck"),
    wohneinheiten: n("wohneinheiten"),
    gewerbeeinheiten: n("gewerbeeinheiten"),
    flaecheWohnen: n("flaecheWohnen"),
    flaecheGewerbe: n("flaecheGewerbe"),
    flaecheGesamt: n("flaecheGesamt"),
    mieteJahrIst: n("mieteJahrIst"),
    mieteJahrSoll: n("mieteJahrSoll"),
    besonderheiten: Array.isArray(d.besonderheiten)
      ? d.besonderheiten
          .slice(0, 6)
          .map((b) => text(b, 300))
          .filter(Boolean)
      : [],
    lat: typeof d.lat === "number" ? d.lat : null,
    lng: typeof d.lng === "number" ? d.lng : null,
  };
}

function zeilenAus(roh: unknown, max: number): string[] | null {
  return Array.isArray(roh)
    ? roh
        .slice(0, max)
        .map((z) => text(z, 400))
        .filter((z) => z.trim())
    : null;
}

/** Änderungen speichern; Vergleiche und Marktbericht werden neu gesucht, ein PDF verfällt. */
export const bewertungSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const s = (d.einstellungen ?? {}) as Record<string, unknown>;
    const e = (d.entscheidung ?? {}) as Record<string, unknown>;
    const abschlag = Number(s.abschlagProzent);
    return {
      supabaseAccessToken: tokenAus(data),
      id: text(d.id, 40),
      eingabe: eingabeAus(d.eingabe),
      geaendert: Array.isArray(d.geaendert)
        ? d.geaendert.slice(0, 20).map((f) => text(f, 40))
        : [],
      einstellungen: {
        radiusKm: Math.min(50, Math.max(1, Number(s.radiusKm) || 10)),
        maxAlterMonate: Math.min(
          120,
          Math.max(6, Number(s.maxAlterMonate) || 36),
        ),
        abschlagProzent:
          Number.isFinite(abschlag) && abschlag > 0
            ? Math.min(40, abschlag)
            : null,
        abschlagGesetztVon: null as string | null,
      },
      ausgeschlossen: Array.isArray(d.ausgeschlossen)
        ? d.ausgeschlossen.slice(0, 200).map((x) => text(x, 60))
        : [],
      imPdf: Array.isArray(d.imPdf)
        ? d.imPdf.slice(0, 3).map((x) => text(x, 60))
        : null,
      entscheidung: {
        empfaenger: text(e.empfaenger, 200),
        datum: /^\d{4}-\d{2}-\d{2}$/.test(text(e.datum, 10))
          ? text(e.datum, 10)
          : new Date().toISOString().slice(0, 10),
        preisGrenz: zahlOderNull(e.preisGrenz),
        preisAnmerkung: text(e.preisAnmerkung, 200),
        preisEigentuemer: zahlOderNull(e.preisEigentuemer),
        zusammenfassung: zeilenAus(e.zusammenfassung, 7),
        vorgehen: zeilenAus(e.vorgehen, 6),
      } satisfies BewertungsEntscheidung,
    };
  })
  .handler(async ({ data }): Promise<Bewertung> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    const alt = roh.inhalt;
    const adresseGeaendert = (["strasse", "plz", "ort"] as const).some(
      (k) => (alt.eingabe[k] ?? "") !== (data.eingabe[k] ?? ""),
    );
    const { eingabe, geo } = await mitKoordinaten(
      { ...data.eingabe, lat: alt.eingabe.lat, lng: alt.eingabe.lng },
      alt.geo,
      adresseGeaendert,
    );
    const herkunft: Herkunft = { ...alt.herkunft };
    for (const f of data.geaendert)
      if (f in eingabe) herkunft[f as keyof Herkunft] = "Eingabe in der App";
    const einstellungen: BewertungsEinstellungen = {
      ...data.einstellungen,
      abschlagGesetztVon:
        data.einstellungen.abschlagProzent == null
          ? null
          : data.einstellungen.abschlagProzent ===
              alt.einstellungen.abschlagProzent
            ? alt.einstellungen.abschlagGesetztVon
            : aufrufer.userId === "cron"
              ? "System"
              : await nutzerName(admin, aufrufer.userId),
    };
    const inhalt: Inhalt = {
      ...alt,
      eingabe,
      herkunft,
      einstellungen,
      geo,
      pool: await vergleichsPool(admin, eingabe, einstellungen),
      ausgeschlossen: data.ausgeschlossen,
      imPdf: data.imPdf,
      markt: await marktReferenz(admin, eingabe).catch(() => alt.markt),
      entscheidung: data.entscheidung,
      pdfUpload: null,
    };
    await speichern(admin, data.id, {
      inhalt,
      titel: `Einschätzung ${eingabe.bezeichnung}`,
      datei_pfad: null,
    });
    return dto(await ladeRoh(admin, data.id));
  });

async function nutzerName(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();
  return (data?.name as string) || (data?.email as string) || "Nutzer";
}

/** PDF-Umwandlung, Schritt 1: Upload-Session im OneDrive der Dokumentenablage. */
export const bewertungPdfStartFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<{ teilBytes: number }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    const pdfUpload = await pdfUploadStarten(`${roh.id}_v${roh.version}.pptx`);
    await speichern(admin, data.id, { inhalt: { ...roh.inhalt, pdfUpload } });
    return { teilBytes: PDF_TEIL_BYTES };
  });

/** PDF-Umwandlung, Schritt 2: ein Teil der PowerPoint (Base64). */
export const bewertungPdfTeilFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      supabaseAccessToken: tokenAus(data),
      id: text(d.id, 40),
      offset: Math.max(0, Math.floor(Number(d.offset) || 0)),
      gesamt: Math.max(0, Math.floor(Number(d.gesamt) || 0)),
      base64: text(d.base64, Math.ceil((PDF_TEIL_BYTES * 4) / 3) + 8),
    };
  })
  .handler(async ({ data }): Promise<{ fertig: boolean }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    const upload = roh.inhalt.pdfUpload;
    const itemId = await pdfTeilHochladen(
      upload,
      data.base64,
      data.offset,
      data.gesamt,
    );
    if (itemId && upload)
      await speichern(admin, data.id, {
        inhalt: { ...roh.inhalt, pdfUpload: { url: upload.url, itemId } },
      });
    return { fertig: Boolean(itemId) };
  });

/** PDF-Umwandlung, Schritt 3: Microsoft 365 wandelt um, das PDF kommt in die Ablage der App. */
export const bewertungPdfFertigFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<{ url: string }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    const dateiname = bewertungDateiname(
      roh.inhalt.eingabe,
      roh.version,
      "pdf",
    );
    const pfad = `einschaetzungen/${roh.mandatSfId}/${roh.id}/${dateiname}`;
    const url = await pdfUmwandelnUndAblegen(
      admin,
      roh.inhalt.pdfUpload?.itemId,
      pfad,
    );
    await speichern(admin, data.id, {
      datei_pfad: pfad,
      inhalt: { ...roh.inhalt, pdfUpload: null },
    });
    return { url };
  });

/** Gespeichertes PDF herunterladen (Link 10 Minuten gültig). */
export const bewertungPdfLinkFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<{ url: string }> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    if (!roh.dateiPfad)
      throw new Error("Für diese Version gibt es noch kein PDF.");
    return { url: await pdfLink(admin, roh.dateiPfad) };
  });
