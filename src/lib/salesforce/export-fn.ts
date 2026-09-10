import { createServerFn } from "@tanstack/react-start";

import type { ExposeFeldId } from "@/lib/expose-ai";
import { graphAnhangBinary } from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";
import { leseEintrag } from "@/lib/postfach/store";

import {
  buildContentVersionMultipart,
  EXPOSE_PDF_TEMP_BUCKET,
  MAX_EXPOSE_PDF_BYTES,
} from "./content-version";
import { mitRechteDiagnose } from "./describe";
import { anreichereAdressFelderWerte } from "./address-format";
import { buildRealEstatePayload, buildTransaktionPayload } from "./field-map";
import { salesforceDataApiPath, salesforceRestJson } from "./query";
import { resolveVerifiedSalesforceCredentials } from "./server-credentials";

export type ExportExposeToSalesforceInput = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
  /** Vorhandenes Real-Estate-Objekt; fehlt → neues Objekt anlegen */
  realEstateId?: string | null;
  felder: Partial<Record<ExposeFeldId, string>>;
  /**
   * Ankauf-Postfach: PDF wird serverseitig aus Graph geladen und angehängt
   * (kein großes PDF im Client→Vercel-Request).
   */
  postfachEintragId?: string | null;
};

export type ExportExposeToSalesforceResult = {
  realEstateId: string;
  transactionId: string;
  mode: "update" | "create";
  authSource: "env" | "session";
  /** Exposé-PDF wurde am Objekt hinterlegt (Graph-Pfad). */
  pdfAngehaengt: boolean;
  /** Grund, falls das PDF serverseitig nicht hinterlegt werden konnte. */
  pdfFehler?: string;
  /** Serverseitig erneuerter Access Token — Client übernimmt ihn. */
  erneuerteSession?: {
    accessToken: string;
    instanceUrl: string;
    refreshToken: string;
  };
};

export type AttachPdfFromPostfachInput = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
  realEstateId: string;
  postfachEintragId: string;
};

export type AttachPdfFromPostfachResult = {
  ok: true;
  erneuerteSession?: ExportExposeToSalesforceResult["erneuerteSession"];
};

export type AttachPdfFromStorageInput = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
  /** Supabase Access Token — Pfad-Ownership prüfen */
  supabaseAccessToken: string;
  realEstateId: string;
  storagePath: string;
  fileName: string;
};

export type AttachPdfFromStorageResult = {
  ok: true;
  erneuerteSession?: ExportExposeToSalesforceResult["erneuerteSession"];
};

type CreateResult = { id: string; success: boolean; errors: unknown[] };

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function createRealEstate(
  accessToken: string,
  instanceUrl: string,
  felder: Partial<Record<ExposeFeldId, string>>,
): Promise<string> {
  const payload = buildRealEstatePayload(felder, { includeName: true });
  if (!payload.Name && !payload.Street_Name__c) {
    throw new Error(
      "Objektadresse fehlt — neues Objekt kann nicht angelegt werden.",
    );
  }
  const created = await salesforceRestJson<CreateResult>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/Real_Estate__c`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!created?.id) {
    throw new Error("Salesforce hat keine Objekt-ID zurückgegeben.");
  }
  return created.id;
}

async function updateRealEstate(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  felder: Partial<Record<ExposeFeldId, string>>,
): Promise<void> {
  const payload = buildRealEstatePayload(felder, { includeName: false });
  if (Object.keys(payload).length === 0) return;

  await salesforceRestJson<void>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/Real_Estate__c/${encodeURIComponent(realEstateId)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

/**
 * Nach dem Anlegen alle Exposé-Felder per PATCH nachsetzen.
 * Manche Orgs/Flows lassen Felder (v. a. Street/City/ZIP) beim Insert leer —
 * derselbe Write wie beim Aktualisieren eines bestehenden Objekts greift dann.
 */
async function ensureFelderNachCreate(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  felder: Partial<Record<ExposeFeldId, string>>,
): Promise<void> {
  // Volle Payload inkl. Name — gleiche Werte, die der User im Exposé geprüft hat.
  const payload = buildRealEstatePayload(felder, { includeName: true });
  if (Object.keys(payload).length === 0) return;

  await salesforceRestJson<void>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/Real_Estate__c/${encodeURIComponent(realEstateId)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

async function createTransaktion(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  felder: Partial<Record<ExposeFeldId, string>>,
): Promise<string> {
  const payload = buildTransaktionPayload(felder, realEstateId);
  const created = await salesforceRestJson<CreateResult>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/Transaktion__c`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!created?.id) {
    throw new Error("Salesforce hat keine Transaktions-ID zurückgegeben.");
  }
  return created.id;
}

async function attachPdfBinary(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  fileName: string,
  binary: Uint8Array,
): Promise<void> {
  if (binary.byteLength === 0) return;
  if (binary.byteLength > MAX_EXPOSE_PDF_BYTES) {
    throw new Error(
      "Das Exposé-PDF ist größer als 40 MB und kann nicht angehängt werden.",
    );
  }

  const multipart = buildContentVersionMultipart({
    realEstateId,
    fileName,
    binary,
  });

  // Uint8Array direkt — Buffer-Cast kann in manchen Runtimes den Body leeren.
  const body = new Uint8Array(multipart.body);

  await salesforceRestJson<CreateResult>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/ContentVersion`,
    {
      method: "POST",
      headers: { "Content-Type": multipart.contentType },
      body: body as unknown as BodyInit,
    },
  );
}

/** PDF aus Ankauf-Postfach (Graph) laden und an Real Estate hängen. */
export async function attachPdfFromPostfach(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  postfachEintragId: string,
): Promise<void> {
  const row = await leseEintrag(postfachEintragId);
  if (!row.anhang_id) {
    throw new Error("Zu dieser Mail ist kein PDF-Anhang gespeichert.");
  }
  if (
    typeof row.anhang_groesse === "number" &&
    row.anhang_groesse > MAX_EXPOSE_PDF_BYTES
  ) {
    throw new Error(
      "Das Exposé-PDF ist größer als 40 MB und kann nicht angehängt werden.",
    );
  }

  const { accessToken: graphToken } = await microsoftAccessToken();
  const anhang = await graphAnhangBinary(
    graphToken,
    row.postfach,
    row.graph_nachricht_id,
    row.anhang_id,
  );

  await attachPdfBinary(
    accessToken,
    instanceUrl,
    realEstateId,
    anhang.name || row.anhang_name || "Expose.pdf",
    anhang.bytes,
  );
}

export async function exportExposeToSalesforce(
  data: ExportExposeToSalesforceInput,
): Promise<ExportExposeToSalesforceResult> {
  // Token vorab prüfen und ggf. erneuern: ein Retry mitten in der Sequenz
  // würde Objekt und Transaktion doppelt anlegen.
  const creds = await resolveVerifiedSalesforceCredentials({
    accessToken: data.accessToken,
    instanceUrl: data.instanceUrl,
    refreshToken: data.refreshToken,
  });

  const existingId = data.realEstateId?.trim() || null;
  const felderRoh = Object.fromEntries(
    Object.entries(data.felder ?? {}).map(([k, v]) => [
      k,
      v == null ? "" : String(v),
    ]),
  ) as Partial<Record<ExposeFeldId, string>>;
  // Stadt/PLZ aus Adresszeile nachziehen — sonst fehlen sie beim Anlegen.
  const adresse = anreichereAdressFelderWerte({
    objektadresse: felderRoh.objektadresse,
    stadt: felderRoh.stadt,
    plz: felderRoh.plz,
  });
  const felder: Partial<Record<ExposeFeldId, string>> = {
    ...felderRoh,
    objektadresse: adresse.objektadresse || felderRoh.objektadresse,
    stadt: adresse.stadt || felderRoh.stadt,
    plz: adresse.plz || felderRoh.plz,
  };
  const postfachEintragId = data.postfachEintragId?.trim() || null;

  let realEstateId: string;
  let mode: "update" | "create";

  if (existingId) {
    try {
      await updateRealEstate(
        creds.accessToken,
        creds.instanceUrl,
        existingId,
        felder,
      );
    } catch (err) {
      throw new Error(
        `Objekt konnte nicht aktualisiert werden: ${await mitRechteDiagnose(
          creds.accessToken,
          creds.instanceUrl,
          "Real_Estate__c",
          "aktualisieren",
          fehlerText(err),
        )}`,
      );
    }
    realEstateId = existingId;
    mode = "update";
  } else {
    try {
      realEstateId = await createRealEstate(
        creds.accessToken,
        creds.instanceUrl,
        felder,
      );
      // Geprüfte Exposé-Felder nachziehen — Insert lässt sie in manchen Orgs leer.
      await ensureFelderNachCreate(
        creds.accessToken,
        creds.instanceUrl,
        realEstateId,
        felder,
      );
    } catch (err) {
      throw new Error(
        `Objekt konnte nicht angelegt werden: ${await mitRechteDiagnose(
          creds.accessToken,
          creds.instanceUrl,
          "Real_Estate__c",
          "anlegen",
          fehlerText(err),
        )}`,
      );
    }
    mode = "create";
  }

  let transactionId: string;
  try {
    transactionId = await createTransaktion(
      creds.accessToken,
      creds.instanceUrl,
      realEstateId,
      felder,
    );
  } catch (err) {
    throw new Error(
      `Objekt wurde ${mode === "create" ? "angelegt" : "aktualisiert"}, aber die Transaktion konnte nicht angelegt werden: ${await mitRechteDiagnose(
        creds.accessToken,
        creds.instanceUrl,
        "Transaktion__c",
        "anlegen",
        fehlerText(err),
      )}`,
    );
  }

  // Anhang optional — Fehler hier verwerfen den Export nicht.
  // Kein PDF im Client→Vercel-Body; bei Postfach holt der Server aus Graph.
  let pdfAngehaengt = false;
  let pdfFehler: string | undefined;
  if (postfachEintragId) {
    try {
      await attachPdfFromPostfach(
        creds.accessToken,
        creds.instanceUrl,
        realEstateId,
        postfachEintragId,
      );
      pdfAngehaengt = true;
    } catch (err) {
      pdfFehler = fehlerText(err);
    }
  }

  return {
    realEstateId,
    transactionId,
    mode,
    authSource: creds.source,
    pdfAngehaengt,
    pdfFehler,
    erneuerteSession: creds.erneuert,
  };
}

export const exportExposeToSalesforceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as ExportExposeToSalesforceInput)
  .handler(({ data }) => exportExposeToSalesforce(data));

/**
 * Separater PDF-Attach (frische Server-Fn, volles Timeout).
 * Wird vom Client genutzt, wenn der Attach im Export fehlgeschlagen ist.
 */
export const attachExposePdfFromPostfachFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as AttachPdfFromPostfachInput)
  .handler(async ({ data }): Promise<AttachPdfFromPostfachResult> => {
    const realEstateId = data.realEstateId?.trim();
    const postfachEintragId = data.postfachEintragId?.trim();
    if (!realEstateId) throw new Error("realEstateId fehlt.");
    if (!postfachEintragId) throw new Error("postfachEintragId fehlt.");

    const creds = await resolveVerifiedSalesforceCredentials({
      accessToken: data.accessToken,
      instanceUrl: data.instanceUrl,
      refreshToken: data.refreshToken,
    });

    await attachPdfFromPostfach(
      creds.accessToken,
      creds.instanceUrl,
      realEstateId,
      postfachEintragId,
    );

    return { ok: true, erneuerteSession: creds.erneuert };
  });

/**
 * Manuelles PDF: Client hat nach Storage hochgeladen; Server lädt herunter,
 * hängt an Salesforce und löscht die Temp-Datei.
 */
export const attachExposePdfFromStorageFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as AttachPdfFromStorageInput)
  .handler(async ({ data }): Promise<AttachPdfFromStorageResult> => {
    const realEstateId = data.realEstateId?.trim();
    const storagePath = data.storagePath?.trim();
    const fileName = data.fileName?.trim() || "Expose.pdf";
    const supabaseAccessToken = data.supabaseAccessToken?.trim();

    if (!realEstateId) throw new Error("realEstateId fehlt.");
    if (!storagePath) throw new Error("storagePath fehlt.");
    if (!supabaseAccessToken) throw new Error("Nicht angemeldet.");

    const admin = createServiceRoleClient();
    const { data: authData, error: authError } =
      await admin.auth.getUser(supabaseAccessToken);
    if (authError || !authData.user?.id) {
      throw new Error("Sitzung ungültig. Bitte neu anmelden.");
    }

    const userId = authData.user.id;
    if (!storagePath.startsWith(`${userId}/`)) {
      throw new Error("Kein Zugriff auf diese PDF-Datei.");
    }

    const { data: file, error: downloadError } = await admin.storage
      .from(EXPOSE_PDF_TEMP_BUCKET)
      .download(storagePath);

    if (downloadError || !file) {
      throw new Error(
        `PDF konnte nicht aus dem Zwischenspeicher geladen werden: ${
          downloadError?.message ?? "Datei fehlt"
        }`,
      );
    }

    const binary = new Uint8Array(await file.arrayBuffer());

    try {
      const creds = await resolveVerifiedSalesforceCredentials({
        accessToken: data.accessToken,
        instanceUrl: data.instanceUrl,
        refreshToken: data.refreshToken,
      });

      await attachPdfBinary(
        creds.accessToken,
        creds.instanceUrl,
        realEstateId,
        fileName,
        binary,
      );

      return { ok: true, erneuerteSession: creds.erneuert };
    } finally {
      await admin.storage.from(EXPOSE_PDF_TEMP_BUCKET).remove([storagePath]);
    }
  });
