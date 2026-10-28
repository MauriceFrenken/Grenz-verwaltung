/**
 * Server-Funktionen Exposé der Mandatsakte. Grundlage sind die Salesforce-Stammdaten und die
 * Unterlagen aus dem OneDrive-Objektordner; die KI füllt daraus die Exposé-Daten (KI-Tool
 * „Exposé-Erstellung“, jede Angabe mit geprüftem Beleg). Die PowerPoint baut der Browser aus der
 * Original-Vorlage von Grenz & Co.; für das PDF wandelt Microsoft 365 genau diese Datei um.
 *
 * Entwürfe liegen in dokument_entwuerfe (typ "expose", inhalt.format "grenz-vorlage").
 * Freigeben kann nur ein Nutzer, die Ablage in Salesforce erfolgt erst nach Bestätigung.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";
import { mitSfZugangOderSitzung, sfSitzungAus } from "@/lib/sf-sync/zugang";
import type { ToolErgebnis, Unterlage } from "@/lib/ki-tools/typen";

import {
  exposeDateiname,
  freigabeGesperrt,
  fotosFuerExpose,
  pflichtangaben,
  salesforceUnterlage,
  unterlagenFuerExpose,
} from "./expose";

type Admin = ReturnType<typeof createServiceRoleClient>;

import {
  PDF_TEIL_BYTES,
  pdfLink,
  pdfTeilHochladen,
  pdfUmwandelnUndAblegen,
  pdfUploadStarten,
} from "./pdf-umwandlung";

const FORMAT = "grenz-vorlage";

function text(wert: unknown, max = 200): string {
  return typeof wert === "string" ? wert.slice(0, max) : "";
}

export type ExposeQuelle = {
  name: string;
  seiten: number;
  webUrl: string | null;
  /** Warum eine Datei nicht gelesen wurde, oder Seitenzahl. */
  hinweis: string | null;
  gelesen: boolean;
};

export type ExposeFoto = { id: string; name: string };

type Inhalt = {
  format: typeof FORMAT;
  unterlagen: Unterlage[];
  quellen: ExposeQuelle[];
  fotos: ExposeFoto[];
  ordner: { name: string; webUrl: string | null } | null;
  ergebnis: ToolErgebnis<"expose"> | null;
  anweisungen: string[];
  pdfUpload?: { url: string; itemId: string | null } | null;
};

export type ExposeStatus =
  | "entwurf"
  | "in_pruefung"
  | "freigegeben"
  | "versendet"
  | "archiviert";

export type ExposeZeile = {
  id: string;
  titel: string;
  status: ExposeStatus;
  version: number;
  updatedAt: string;
  freigegebenAm: string | null;
  hatPdf: boolean;
  sfContentDocumentId: string | null;
};

export type ExposeEntwurf = ExposeZeile & {
  quellen: ExposeQuelle[];
  fotos: ExposeFoto[];
  ordner: Inhalt["ordner"];
  ergebnis: ToolErgebnis<"expose"> | null;
  anweisungen: string[];
};

const SPALTEN =
  "id, titel, status, version, updated_at, freigegeben_am, datei_pfad, sf_content_document_id";

function zeile(r: Record<string, unknown>): ExposeZeile {
  return {
    id: String(r.id),
    titel: String(r.titel),
    status: r.status as ExposeStatus,
    version: Number(r.version ?? 1),
    updatedAt: String(r.updated_at),
    freigegebenAm: (r.freigegeben_am as string) ?? null,
    hatPdf: Boolean(r.datei_pfad),
    sfContentDocumentId: (r.sf_content_document_id as string) ?? null,
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
  if (!data || inhalt?.format !== FORMAT)
    throw new Error("Exposé nicht gefunden.");
  return {
    ...zeile(data),
    mandatSfId: String(data.mandat_sf_id),
    dateiPfad: (data.datei_pfad as string) ?? null,
    inhalt,
  };
}

function dto(roh: Awaited<ReturnType<typeof ladeRoh>>): ExposeEntwurf {
  const { inhalt, mandatSfId: _m, dateiPfad: _d, ...z } = roh;
  return {
    ...z,
    quellen: inhalt.quellen,
    fotos: inhalt.fotos,
    ordner: inhalt.ordner,
    ergebnis: inhalt.ergebnis,
    anweisungen: inhalt.anweisungen,
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

function offen(status: ExposeStatus) {
  if (status !== "entwurf")
    throw new Error(
      "Dieses Exposé ist freigegeben. Für Änderungen bitte eine neue Version erstellen.",
    );
}

export const mandatExposeListeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    mandatSfId: text((data as { mandatSfId?: unknown })?.mandatSfId, 18),
  }))
  .handler(async ({ data }): Promise<ExposeZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const { data: rows, error } = await createServiceRoleClient()
      .from("dokument_entwuerfe")
      .select(SPALTEN)
      .eq("mandat_sf_id", data.mandatSfId)
      .eq("typ", "expose")
      .eq("inhalt->>format", FORMAT)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(zeile);
  });

export const mandatExposeLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<ExposeEntwurf> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return dto(await ladeRoh(createServiceRoleClient(), data.id));
  });

/** Salesforce-Stammdaten und Unterlagen des Objektordners lesen. */
async function grundlagen(admin: Admin, mandatSfId: string) {
  const { data: mandat, error } = await admin
    .from("sf_mandate")
    .select("*")
    .eq("sf_id", mandatSfId)
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
  const { vorbelegungAusSalesforce } =
    await import("@/lib/expose-generator/modell");
  const sf = salesforceUnterlage(
    vorbelegungAusSalesforce(mandat, objekt),
    String(mandat.name),
  );
  const unterlagen: Unterlage[] = sf ? [sf] : [];
  const quellen: ExposeQuelle[] = sf
    ? [
        {
          name: sf.name,
          seiten: 1,
          webUrl: null,
          hinweis: "Stammdaten aus Mandat und Objekt",
          gelesen: true,
        },
      ]
    : [];

  const { mandatOrdnerLaden } = await import("./ordner-server-fn");
  const ordner = await mandatOrdnerLaden(admin, mandatSfId);
  if (ordner.fehler)
    quellen.push({
      name: "Objektordner",
      seiten: 0,
      webUrl: null,
      hinweis: ordner.fehler,
      gelesen: false,
    });
  const auswahl = unterlagenFuerExpose(ordner.dateien);
  if (auswahl.length) {
    const { objektAblageZugang, ablageDateiInhalt } =
      await import("@/lib/microsoft/objekt-ablage");
    const { unterlageAusBytes } =
      await import("@/lib/ki-tools/unterlagen-server");
    const z = await objektAblageZugang();
    const gelesen = await Promise.all(
      auswahl.map(async (d) => {
        try {
          const u = await unterlageAusBytes(
            d.name,
            await ablageDateiInhalt(z, d.id),
          );
          return {
            d,
            u,
            fehler: u ? null : "kein Text lesbar (vermutlich Scan)",
          };
        } catch (e) {
          return {
            d,
            u: null,
            fehler: e instanceof Error ? e.message : "nicht lesbar",
          };
        }
      }),
    );
    for (const { d, u, fehler } of gelesen) {
      const pfad = d.unterordner ? `${d.unterordner}/${d.name}` : d.name;
      if (u)
        unterlagen.push({
          id: d.id,
          name: pfad,
          text: u.text,
          seiten: u.seiten,
        });
      quellen.push({
        name: pfad,
        seiten: u?.seiten ?? 0,
        webUrl: d.webUrl,
        hinweis: fehler,
        gelesen: Boolean(u),
      });
    }
  }
  return {
    mandat,
    objekt,
    unterlagen,
    quellen,
    fotos: fotosFuerExpose(ordner.dateien).map((d) => ({
      id: d.id,
      name: d.name,
    })),
    ordner: ordner.ordner
      ? { name: ordner.ordner.name, webUrl: ordner.ordner.webUrl }
      : null,
  };
}

/** Neue Version anlegen: liest Salesforce und den Objektordner, noch ohne KI. */
export const mandatExposeAnlegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    mandatSfId: text((data as { mandatSfId?: unknown })?.mandatSfId, 18),
  }))
  .handler(async ({ data }): Promise<ExposeEntwurf> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    const g = await grundlagen(admin, data.mandatSfId);
    const { data: letzte } = await admin
      .from("dokument_entwuerfe")
      .select("version")
      .eq("mandat_sf_id", data.mandatSfId)
      .eq("typ", "expose")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const inhalt: Inhalt = {
      format: FORMAT,
      unterlagen: g.unterlagen,
      quellen: g.quellen,
      fotos: g.fotos,
      ordner: g.ordner,
      ergebnis: null,
      anweisungen: [],
    };
    const ort = [g.objekt?.strasse, g.objekt?.ort].filter(Boolean).join(", ");
    const { data: neu, error } = await admin
      .from("dokument_entwuerfe")
      .insert({
        typ: "expose",
        titel: `Exposé ${ort || g.mandat.name}`,
        mandat_sf_id: data.mandatSfId,
        inhalt,
        status: "entwurf",
        version: Number(letzte?.version ?? 0) + 1,
        erstellt_von: aufrufer.userId === "cron" ? null : aufrufer.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return dto(await ladeRoh(admin, String(neu.id)));
  });

/**
 * KI füllt die Exposé-Daten aus Salesforce und Unterlagen; mit Anweisung wird das bisherige
 * Ergebnis angepasst. Hochgeladene Unterlagen kommen dauerhaft zum Entwurf dazu.
 */
export const mandatExposeAuswertenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const zusatz = Array.isArray(d.zusatz)
      ? (d.zusatz as Record<string, unknown>[]).slice(0, 10).flatMap((u) => {
          const t = text(u?.text, 400_000);
          return t.includes("<<<PAGE")
            ? [
                {
                  id: `upload-${Date.now().toString(36)}-${text(u?.id, 30)}`,
                  name: text(u?.name, 200) || "Unterlage",
                  text: t,
                  seiten:
                    Number(u?.seiten) ||
                    (t.match(/<<<PAGE \d+>>>/g) ?? []).length,
                },
              ]
            : [];
        })
      : [];
    return {
      supabaseAccessToken: tokenAus(data),
      id: text(d.id, 40),
      anweisung: text(d.anweisung, 6000),
      bildnamen: Array.isArray(d.bildnamen)
        ? d.bildnamen.slice(0, 60).map((b) => text(b, 200))
        : [],
      zusatz,
    };
  })
  .handler(async ({ data }): Promise<ExposeEntwurf> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    offen(roh.status);
    const unterlagen = [...roh.inhalt.unterlagen, ...data.zusatz];
    if (!unterlagen.length && !data.anweisung.trim())
      throw new Error(
        "Keine Unterlagen gefunden. Bitte Unterlagen hochladen oder Angaben in die Anweisung schreiben.",
      );
    const { auswerten } = await import("@/lib/ki-tools/ki");
    const ergebnis = (await auswerten(
      {
        tool: "expose",
        unterlagen,
        anweisung: data.anweisung,
        bildnamen: data.bildnamen,
        vorher: roh.inhalt.ergebnis,
      },
      null,
    )) as ToolErgebnis<"expose">;
    const inhalt: Inhalt = {
      ...roh.inhalt,
      unterlagen,
      quellen: [
        ...roh.inhalt.quellen,
        ...data.zusatz.map((u) => ({
          name: u.name,
          seiten: u.seiten,
          webUrl: null,
          hinweis: "hochgeladen",
          gelesen: true,
        })),
      ],
      ergebnis,
      anweisungen: data.anweisung.trim()
        ? [...roh.inhalt.anweisungen, data.anweisung.trim()]
        : roh.inhalt.anweisungen,
      pdfUpload: null,
    };
    // Neue Daten machen ein vorhandenes PDF ungültig.
    await speichern(admin, data.id, { inhalt, datei_pfad: null });
    return dto(await ladeRoh(admin, data.id));
  });

/** Foto aus dem Objektordner, verkleinert auf 1600 px (JPEG). */
export const mandatExposeFotoFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    itemId: text((data as { itemId?: unknown })?.itemId, 200),
  }))
  .handler(async ({ data }): Promise<{ base64: string }> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const { objektAblageZugang, ablageVorschau } =
      await import("@/lib/microsoft/objekt-ablage");
    const bytes = await ablageVorschau(await objektAblageZugang(), data.itemId);
    return { base64: Buffer.from(bytes).toString("base64") };
  });

/** PDF-Umwandlung, Schritt 1: Upload-Session im OneDrive der Dokumentenablage. */
export const mandatExposePdfStartFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<{ teilBytes: number }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    offen(roh.status);
    if (!roh.inhalt.ergebnis) throw new Error("Noch keine Exposé-Daten.");
    const pdfUpload = await pdfUploadStarten(`${roh.id}_v${roh.version}.pptx`);
    await speichern(admin, data.id, { inhalt: { ...roh.inhalt, pdfUpload } });
    return { teilBytes: PDF_TEIL_BYTES };
  });

/** PDF-Umwandlung, Schritt 2: ein Teil der PowerPoint (Base64). */
export const mandatExposePdfTeilFn = createServerFn({ method: "POST" })
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
export const mandatExposePdfFertigFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<{ url: string; dateiname: string }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    const dateiname = exposeDateiname(roh.inhalt.ergebnis, roh.version, "pdf");
    const pfad = `exposes/${roh.mandatSfId}/${roh.id}/${dateiname}`;
    const url = await pdfUmwandelnUndAblegen(
      admin,
      roh.inhalt.pdfUpload?.itemId,
      pfad,
    );
    await speichern(admin, data.id, {
      datei_pfad: pfad,
      inhalt: { ...roh.inhalt, pdfUpload: null },
    });
    return { url, dateiname };
  });

/** Gespeichertes PDF herunterladen (Link 10 Minuten gültig). */
export const mandatExposePdfLinkFn = createServerFn({ method: "POST" })
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

/** Freigabe durch den Nutzer: Pflichtangaben erfüllt und PDF erstellt. */
export const mandatExposeFreigebenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
  }))
  .handler(async ({ data }): Promise<ExposeEntwurf> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    if (aufrufer.userId === "cron")
      throw new Error("Freigeben kann nur ein Nutzer.");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    offen(roh.status);
    if (!roh.inhalt.ergebnis) throw new Error("Noch keine Exposé-Daten.");
    const punkte = pflichtangaben(roh.inhalt.ergebnis.daten);
    const fehlt = freigabeGesperrt(punkte);
    if (fehlt.length)
      throw new Error(`Freigabe gesperrt. Es fehlt: ${fehlt.join(", ")}.`);
    if (!roh.dateiPfad)
      throw new Error(
        "Bitte zuerst das PDF erstellen, damit genau dieses freigegeben wird.",
      );
    await speichern(admin, data.id, {
      status: "freigegeben",
      freigegeben_von: aufrufer.userId,
      freigegeben_am: new Date().toISOString(),
      pruefung: { ok: true, punkte },
    });
    return dto(await ladeRoh(admin, data.id));
  });

/** Freigegebenes PDF als Datei am Mandat in Salesforce ablegen (nach Bestätigung in der App). */
export const mandatExposeSalesforceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: text((data as { id?: unknown })?.id, 40),
    bestaetigt: (data as { bestaetigt?: unknown })?.bestaetigt === true,
    sfSitzung: sfSitzungAus(data),
  }))
  .handler(async ({ data }): Promise<ExposeEntwurf> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    if (!data.bestaetigt)
      throw new Error("Der Schritt muss in der App bestätigt werden.");
    const admin = createServiceRoleClient();
    const roh = await ladeRoh(admin, data.id);
    if (roh.status !== "freigegeben" || !roh.dateiPfad)
      throw new Error(
        "Nur freigegebene Exposés werden in Salesforce abgelegt.",
      );
    const { data: blob, error: e1 } = await admin.storage
      .from("dokumente")
      .download(roh.dateiPfad);
    if (e1 || !blob) throw new Error(e1?.message ?? "PDF nicht gefunden.");
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const dateiname = roh.dateiPfad.split("/").pop() ?? "Expose.pdf";
    const { sfCreate } = await import("@/lib/sf-sync/schreiben");
    const { sfAbfrage } = await import("@/lib/sf-sync/client");
    const dokumentId = await mitSfZugangOderSitzung(
      data.sfSitzung,
      async () => {
        const versionId = await sfCreate(admin, "ContentVersion", {
          Title: `${roh.titel} (v${roh.version})`,
          PathOnClient: dateiname,
          VersionData: base64,
          FirstPublishLocationId: roh.mandatSfId,
        });
        if (!/^[A-Za-z0-9]{15,18}$/.test(versionId))
          throw new Error("Unerwartete Antwort von Salesforce.");
        const [v] = await sfAbfrage(
          `SELECT ContentDocumentId FROM ContentVersion WHERE Id = '${versionId}'`,
        );
        return String(v?.ContentDocumentId ?? "");
      },
    );
    await speichern(admin, data.id, {
      sf_content_document_id: dokumentId || null,
    });
    return dto(await ladeRoh(admin, data.id));
  });
