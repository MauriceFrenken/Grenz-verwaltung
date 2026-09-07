const GRAPH_BASIS = "https://graph.microsoft.com/v1.0";

export type GraphPostfachInfo = {
  ordnerId: string;
  anzeigename: string | null;
  anzahlNachrichten: number | null;
};

/** Primärer Anhangstyp für Listen-Icons (PDF vor Office vor Bild vor sonstiger Datei). */
export type GraphAnhangArt = "pdf" | "office" | "bild" | "datei" | "keins";

/** Anhang-Metadaten aus der Nachrichtenliste — ohne Inhalt. */
export type GraphAnhangMeta = {
  id: string | null;
  name: string;
  contentType: string | null;
  groesse: number;
};

export type GraphNachricht = {
  id: string;
  internetMessageId: string | null;
  betreff: string | null;
  absenderName: string | null;
  absenderMail: string | null;
  eingegangenAm: string | null;
  hatAnhaenge: boolean;
  anhangArt: GraphAnhangArt;
  /** Erster PDF-Anhang der Nachricht (Exposé-Kandidat). */
  pdfAnhang: GraphAnhangMeta | null;
  /** Primärer Datei-Anhang: PDF > Office > Bild > erste Datei. */
  primaerAnhang: GraphAnhangMeta | null;
  /** Alle Nicht-Inline-Dateianhänge der Nachricht. */
  anhaenge: GraphAnhangMeta[];
  vorschau: string | null;
  webLink: string | null;
};

export type GraphAnhang = {
  id: string;
  name: string;
  contentType: string | null;
  groesse: number;
  istInline: boolean;
  /** Base64-Inhalt, nur bei Datei-Anhängen (`#microsoft.graph.fileAttachment`). */
  contentBytes: string | null;
};

type GraphFehlerJson = {
  error?: { code?: string; message?: string };
};

function graphFehler(
  status: number,
  json: GraphFehlerJson,
  postfach?: string,
): Error {
  const code = json.error?.code ?? "";
  const message = json.error?.message ?? `HTTP ${status}`;

  if (status === 401) {
    return new Error(
      `Microsoft hat den Zugriff abgelehnt (nicht authentifiziert): ${message}`,
    );
  }
  if (status === 403) {
    return new Error(
      `Kein Zugriff auf ${postfach ?? "die Ressource"}. In Entra braucht die App die passende ` +
        `Application-Permission (z. B. Mail.ReadWrite / Files.Read.All) und Admin Consent. Graph: ${message}`,
    );
  }
  if (
    status === 404 ||
    code === "ErrorItemNotFound" ||
    code === "ResourceNotFound"
  ) {
    return new Error(
      `${postfach ?? "Das Postfach"} wurde in diesem Tenant nicht gefunden. Adresse und Tenant prüfen. Graph: ${message}`,
    );
  }
  if (code === "MailboxNotEnabledForRESTAPI") {
    return new Error(
      `${postfach ?? "Das Postfach"} ist nicht über die Graph-API erreichbar (kein Exchange-Online-Postfach).`,
    );
  }
  return new Error(
    `Microsoft Graph Fehler (${status}${code ? ` ${code}` : ""}): ${message}`,
  );
}

async function graphGet<T>(
  pfad: string,
  accessToken: string,
  postfach?: string,
): Promise<T> {
  const res = await fetch(`${GRAPH_BASIS}${pfad}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw graphFehler(res.status, json as GraphFehlerJson, postfach);
  }
  return json as T;
}

async function graphPost<T>(
  pfad: string,
  accessToken: string,
  body: unknown,
  postfach?: string,
): Promise<T> {
  const res = await fetch(`${GRAPH_BASIS}${pfad}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw graphFehler(res.status, json as GraphFehlerJson, postfach);
  }
  return json as T;
}

/**
 * Liest den Posteingang. Mit App-only ist das der Nachweis,
 * dass genau dieses Postfach erreichbar ist.
 */
export async function graphPostfachPruefen(
  accessToken: string,
  postfach: string,
): Promise<GraphPostfachInfo> {
  const data = await graphGet<{
    id?: string;
    displayName?: string;
    totalItemCount?: number;
  }>(
    `/users/${encodeURIComponent(postfach)}/mailFolders/inbox?$select=id,displayName,totalItemCount`,
    accessToken,
    postfach,
  );

  if (!data.id) {
    throw new Error(`Posteingang von ${postfach} konnte nicht gelesen werden.`);
  }
  return {
    ordnerId: data.id,
    anzeigename: data.displayName ?? null,
    anzahlNachrichten:
      typeof data.totalItemCount === "number" ? data.totalItemCount : null,
  };
}

type RohAnhangMeta = {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
};

type RohNachricht = {
  id?: string;
  internetMessageId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  hasAttachments?: boolean;
  bodyPreview?: string;
  webLink?: string;
  attachments?: RohAnhangMeta[];
};

function istPdfAnhang(a: RohAnhangMeta): boolean {
  const ct = (a.contentType ?? "").toLowerCase();
  const name = (a.name ?? "").toLowerCase();
  return ct.includes("pdf") || name.endsWith(".pdf");
}

function istOfficeAnhang(a: RohAnhangMeta): boolean {
  const ct = (a.contentType ?? "").toLowerCase();
  const name = (a.name ?? "").toLowerCase();
  return (
    ct.includes("wordprocessingml") ||
    ct.includes("msword") ||
    ct.includes("spreadsheetml") ||
    ct.includes("ms-excel") ||
    ct.includes("presentationml") ||
    ct.includes("ms-powerpoint") ||
    /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(name)
  );
}

function istBildAnhang(a: RohAnhangMeta): boolean {
  const ct = (a.contentType ?? "").toLowerCase();
  const name = (a.name ?? "").toLowerCase();
  return (
    ct.startsWith("image/") || /\.(jpe?g|png|gif|webp|tiff?|bmp)$/i.test(name)
  );
}

function istDateiAnhang(a: RohAnhangMeta): boolean {
  return !a.isInline && Boolean(a.id);
}

function anhangArtAus(anhaenge: RohAnhangMeta[]): GraphAnhangArt {
  const dateien = anhaenge.filter(istDateiAnhang);
  if (dateien.some(istPdfAnhang)) return "pdf";
  if (dateien.some(istOfficeAnhang)) return "office";
  if (dateien.some(istBildAnhang)) return "bild";
  if (dateien.length > 0) return "datei";
  return "keins";
}

function mapAnhangMeta(roh: RohAnhangMeta): GraphAnhangMeta {
  return {
    id: roh.id ?? null,
    name: roh.name ?? "unbenannt",
    contentType: roh.contentType ?? null,
    groesse: typeof roh.size === "number" ? roh.size : 0,
  };
}

function waehlePrimaerAnhang(
  anhaenge: RohAnhangMeta[],
): GraphAnhangMeta | null {
  const dateien = anhaenge.filter((a) => !a.isInline && a.id);
  const pdf = dateien.find(istPdfAnhang);
  if (pdf) return mapAnhangMeta(pdf);
  const office = dateien.find(istOfficeAnhang);
  if (office) return mapAnhangMeta(office);
  const bild = dateien.find(istBildAnhang);
  if (bild) return mapAnhangMeta(bild);
  const erste = dateien[0];
  return erste ? mapAnhangMeta(erste) : null;
}

function mapNachricht(roh: RohNachricht): GraphNachricht | null {
  if (!roh.id) return null;
  const rohAnhaenge = (roh.attachments ?? []).filter((a) => !a.isInline);
  const dateiAnhaenge = rohAnhaenge
    .filter((a) => Boolean(a.id))
    .map(mapAnhangMeta);
  const pdf = rohAnhaenge.find(istPdfAnhang);
  return {
    id: roh.id,
    internetMessageId: roh.internetMessageId ?? null,
    betreff: roh.subject ?? null,
    absenderName: roh.from?.emailAddress?.name ?? null,
    absenderMail: roh.from?.emailAddress?.address?.toLowerCase() ?? null,
    eingegangenAm: roh.receivedDateTime ?? null,
    hatAnhaenge: roh.hasAttachments === true,
    anhangArt: anhangArtAus(rohAnhaenge),
    pdfAnhang: pdf ? mapAnhangMeta(pdf) : null,
    primaerAnhang: waehlePrimaerAnhang(rohAnhaenge),
    anhaenge: dateiAnhaenge,
    vorschau: roh.bodyPreview ?? null,
    webLink: roh.webLink ?? null,
  };
}

export async function graphPosteingangNachrichten(
  accessToken: string,
  postfach: string,
  optionen: { anzahl?: number; seit?: string; nurMitAnhang?: boolean } = {},
): Promise<GraphNachricht[]> {
  const anzahl = Math.min(Math.max(optionen.anzahl ?? 25, 1), 100);
  const params = new URLSearchParams({
    $select:
      "id,internetMessageId,subject,from,receivedDateTime,hasAttachments,bodyPreview,webLink",
    $expand: "attachments($select=id,name,contentType,size,isInline)",
    $orderby: "receivedDateTime desc",
    $top: String(anzahl),
  });
  if (optionen.seit) {
    params.set("$filter", `receivedDateTime ge ${optionen.seit}`);
  }

  const data = await graphGet<{ value?: RohNachricht[] }>(
    `/users/${encodeURIComponent(postfach)}/mailFolders/inbox/messages?${params.toString()}`,
    accessToken,
    postfach,
  );

  const nachrichten = (data.value ?? [])
    .map(mapNachricht)
    .filter((n): n is GraphNachricht => n !== null);

  return optionen.nurMitAnhang
    ? nachrichten.filter((n) => n.anhaenge.length > 0)
    : nachrichten;
}

export async function graphNachrichtAnhaenge(
  accessToken: string,
  postfach: string,
  nachrichtId: string,
): Promise<GraphAnhang[]> {
  const data = await graphGet<{
    value?: Array<{
      id?: string;
      name?: string;
      contentType?: string;
      size?: number;
      isInline?: boolean;
      contentBytes?: string;
    }>;
  }>(
    `/users/${encodeURIComponent(postfach)}/messages/${encodeURIComponent(nachrichtId)}/attachments`,
    accessToken,
    postfach,
  );

  return (data.value ?? [])
    .filter((a) => Boolean(a.id))
    .map((a) => ({
      id: a.id as string,
      name: a.name ?? "unbenannt",
      contentType: a.contentType ?? null,
      groesse: typeof a.size === "number" ? a.size : 0,
      istInline: a.isInline === true,
      contentBytes: a.contentBytes ?? null,
    }));
}

function anhangPfad(
  postfach: string,
  nachrichtId: string,
  anhangId: string,
): string {
  return (
    `/users/${encodeURIComponent(postfach)}/messages/${encodeURIComponent(nachrichtId)}` +
    `/attachments/${encodeURIComponent(anhangId)}`
  );
}

/**
 * Anhang als Roh-Bytes laden.
 * Nutzt `/$value` statt `contentBytes` — zuverlässiger bei großen PDFs (>3 MB).
 */
export async function graphAnhangBinary(
  accessToken: string,
  postfach: string,
  nachrichtId: string,
  anhangId: string,
): Promise<{
  id: string;
  name: string;
  contentType: string | null;
  groesse: number;
  bytes: Uint8Array;
}> {
  const metaPfad =
    `${anhangPfad(postfach, nachrichtId, anhangId)}` +
    `?$select=id,name,contentType,size`;
  const meta = await graphGet<{
    id?: string;
    name?: string;
    contentType?: string;
    size?: number;
  }>(metaPfad, accessToken, postfach);

  const valueUrl = `${GRAPH_BASIS}${anhangPfad(postfach, nachrichtId, anhangId)}/$value`;
  const res = await fetch(valueUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => ({}));
    throw graphFehler(res.status, json as GraphFehlerJson, postfach);
  }

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error(
      `Anhang „${meta.name ?? anhangId}“ enthält keine Datei-Daten.`,
    );
  }

  return {
    id: meta.id ?? anhangId,
    name: meta.name ?? "unbenannt",
    contentType: meta.contentType ?? null,
    groesse:
      typeof meta.size === "number" && meta.size > 0
        ? meta.size
        : buffer.byteLength,
    bytes: buffer,
  };
}

/** Einzelner Anhang mit Inhalt (Base64) — ohne die übrigen Anhänge zu laden. */
export async function graphAnhangInhalt(
  accessToken: string,
  postfach: string,
  nachrichtId: string,
  anhangId: string,
): Promise<GraphAnhang> {
  const anhang = await graphAnhangBinary(
    accessToken,
    postfach,
    nachrichtId,
    anhangId,
  );

  // Base64 für Client-Transport (Exposé-Import / Draft); serverseitig lieber Binary nutzen.
  const contentBytes = Buffer.from(
    anhang.bytes.buffer,
    anhang.bytes.byteOffset,
    anhang.bytes.byteLength,
  ).toString("base64");

  return {
    id: anhang.id,
    name: anhang.name,
    contentType: anhang.contentType,
    groesse: anhang.groesse,
    istInline: false,
    contentBytes,
  };
}

/**
 * Findet einen bestehenden Ordner „anzeigename“ — zuerst unter dem Posteingang,
 * sonst unter den Stammordnern. Wird nicht angelegt.
 */
export async function graphPosteingangUnterordner(
  accessToken: string,
  postfach: string,
  anzeigename: string,
): Promise<string> {
  const filter = new URLSearchParams({
    $select: "id,displayName",
    $filter: `displayName eq '${anzeigename.replace(/'/g, "''")}'`,
  });
  const basis = `/users/${encodeURIComponent(postfach)}`;

  for (const pfad of [
    `${basis}/mailFolders/inbox/childFolders?${filter.toString()}`,
    `${basis}/mailFolders?${filter.toString()}`,
  ]) {
    const gefunden = await graphGet<{ value?: Array<{ id?: string }> }>(
      pfad,
      accessToken,
      postfach,
    );
    const id = gefunden.value?.find((f) => f.id)?.id;
    if (id) return id;
  }

  throw new Error(
    `Ordner „${anzeigename}“ wurde im Postfach nicht gefunden. Bitte manuell anlegen.`,
  );
}

/** Verschiebt eine Nachricht in einen anderen Ordner. Graph gibt eine neue ID zurück. */
export async function graphNachrichtVerschieben(
  accessToken: string,
  postfach: string,
  nachrichtId: string,
  zielOrdnerId: string,
): Promise<string> {
  const verschoben = await graphPost<{ id?: string }>(
    `/users/${encodeURIComponent(postfach)}/messages/${encodeURIComponent(nachrichtId)}/move`,
    accessToken,
    { destinationId: zielOrdnerId },
    postfach,
  );
  return verschoben.id ?? nachrichtId;
}

/** Posteingangs-Ordner-ID eines Postfachs. */
export async function graphPosteingangOrdnerId(
  accessToken: string,
  postfach: string,
): Promise<string> {
  const data = await graphGet<{ id?: string }>(
    `/users/${encodeURIComponent(postfach)}/mailFolders/inbox?$select=id`,
    accessToken,
    postfach,
  );
  if (!data.id) {
    throw new Error(`Posteingang von ${postfach} konnte nicht gelesen werden.`);
  }
  return data.id;
}

/** Kopiert eine Nachricht in einen Ordner (auch anderes Postfach). */
export async function graphNachrichtKopieren(
  accessToken: string,
  quellPostfach: string,
  nachrichtId: string,
  zielOrdnerId: string,
): Promise<string> {
  const kopie = await graphPost<{ id?: string }>(
    `/users/${encodeURIComponent(quellPostfach)}/messages/${encodeURIComponent(nachrichtId)}/copy`,
    accessToken,
    { destinationId: zielOrdnerId },
    quellPostfach,
  );
  return kopie.id ?? "";
}

async function graphDelete(
  pfad: string,
  accessToken: string,
  postfach?: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_BASIS}${pfad}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    const json: unknown = await res.json().catch(() => ({}));
    throw graphFehler(res.status, json as GraphFehlerJson, postfach);
  }
}

/** Löscht eine Nachricht endgültig aus dem Postfach. */
export async function graphNachrichtLoeschen(
  accessToken: string,
  postfach: string,
  nachrichtId: string,
): Promise<void> {
  await graphDelete(
    `/users/${encodeURIComponent(postfach)}/messages/${encodeURIComponent(nachrichtId)}`,
    accessToken,
    postfach,
  );
}

export type GraphDriveItem = {
  id: string;
  name: string;
  istOrdner: boolean;
  groesse: number;
  geaendertAm: string | null;
  webUrl: string | null;
  childCount: number | null;
};

type RohDriveItem = {
  id?: string;
  name?: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
  folder?: { childCount?: number };
  file?: unknown;
};

function mapDriveItem(roh: RohDriveItem): GraphDriveItem | null {
  if (!roh.id || !roh.name) return null;
  const istOrdner = roh.folder != null;
  return {
    id: roh.id,
    name: roh.name,
    istOrdner,
    groesse: typeof roh.size === "number" ? roh.size : 0,
    geaendertAm: roh.lastModifiedDateTime ?? null,
    webUrl: roh.webUrl ?? null,
    childCount:
      istOrdner && typeof roh.folder?.childCount === "number"
        ? roh.folder.childCount
        : null,
  };
}

function driveItemsSortieren(items: GraphDriveItem[]): GraphDriveItem[] {
  return [...items].sort((a, b) => {
    if (a.istOrdner !== b.istOrdner) return a.istOrdner ? -1 : 1;
    return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
  });
}

async function graphDriveKinderSeite(
  pfad: string,
  accessToken: string,
  benutzer: string,
): Promise<GraphDriveItem[]> {
  const select =
    "id,name,folder,file,size,lastModifiedDateTime,webUrl";
  const params = new URLSearchParams({
    $select: select,
    $top: "200",
  });

  const items: GraphDriveItem[] = [];
  let url: string | null = `${GRAPH_BASIS}${pfad}?${params.toString()}`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw graphFehler(res.status, json as GraphFehlerJson, benutzer);
    }
    const data = json as {
      value?: RohDriveItem[];
      "@odata.nextLink"?: string;
    };
    for (const roh of data.value ?? []) {
      const item = mapDriveItem(roh);
      if (item) items.push(item);
    }
    url = data["@odata.nextLink"] ?? null;
  }

  return driveItemsSortieren(items);
}

/** Kinder des OneDrive-Root eines Benutzers. */
export async function graphDriveRootKinder(
  accessToken: string,
  benutzer: string,
): Promise<GraphDriveItem[]> {
  return graphDriveKinderSeite(
    `/users/${encodeURIComponent(benutzer)}/drive/root/children`,
    accessToken,
    benutzer,
  );
}

/** Kinder eines OneDrive-Ordners. */
export async function graphDriveItemKinder(
  accessToken: string,
  benutzer: string,
  itemId: string,
): Promise<GraphDriveItem[]> {
  return graphDriveKinderSeite(
    `/users/${encodeURIComponent(benutzer)}/drive/items/${encodeURIComponent(itemId)}/children`,
    accessToken,
    benutzer,
  );
}

/** Legt einen Unterordner an (schlägt fehl, wenn der Name schon existiert). */
export async function graphDriveOrdnerAnlegen(
  accessToken: string,
  benutzer: string,
  parentItemId: string,
  name: string,
): Promise<GraphDriveItem> {
  const roh = await graphPost<RohDriveItem>(
    `/users/${encodeURIComponent(benutzer)}/drive/items/${encodeURIComponent(parentItemId)}/children`,
    accessToken,
    {
      name: name.trim(),
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    },
    benutzer,
  );
  const item = mapDriveItem(roh);
  if (!item) {
    throw new Error(`Ordner „${name}“ konnte nicht angelegt werden.`);
  }
  return item;
}

const GRAPH_SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024;

/** Unzulässige Zeichen in OneDrive-Dateinamen ersetzen. */
export function graphDriveDateinameSaeubern(name: string): string {
  const bereinigt = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return bereinigt || "datei";
}

function driveUploadPfad(
  benutzer: string,
  dateiname: string,
  parentItemId?: string | null,
): string {
  const safe = encodeURIComponent(graphDriveDateinameSaeubern(dateiname));
  if (parentItemId) {
    return `/users/${encodeURIComponent(benutzer)}/drive/items/${encodeURIComponent(parentItemId)}:/${safe}:/content`;
  }
  return `/users/${encodeURIComponent(benutzer)}/drive/root:/${safe}:/content`;
}

async function graphDriveSimpleUpload(
  accessToken: string,
  benutzer: string,
  pfad: string,
  bytes: Uint8Array,
  contentType: string | null,
): Promise<GraphDriveItem> {
  const res = await fetch(`${GRAPH_BASIS}${pfad}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw graphFehler(res.status, json as GraphFehlerJson, benutzer);
  }
  const item = mapDriveItem(json as RohDriveItem);
  if (!item) {
    throw new Error("OneDrive-Upload: Antwort ohne Datei-Metadaten.");
  }
  return item;
}

/** Upload-Session für Dateien > 4 MB (Graph-Limit für Simple Upload). */
async function graphDriveSessionUpload(
  accessToken: string,
  benutzer: string,
  dateiname: string,
  bytes: Uint8Array,
  parentItemId?: string | null,
): Promise<GraphDriveItem> {
  const safeName = graphDriveDateinameSaeubern(dateiname);
  const createPfad = parentItemId
    ? `/users/${encodeURIComponent(benutzer)}/drive/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(safeName)}:/createUploadSession`
    : `/users/${encodeURIComponent(benutzer)}/drive/root:/${encodeURIComponent(safeName)}:/createUploadSession`;

  const session = await graphPost<{ uploadUrl?: string }>(
    createPfad,
    accessToken,
    {
      item: {
        "@microsoft.graph.conflictBehavior": "rename",
        name: safeName,
      },
    },
    benutzer,
  );

  if (!session.uploadUrl) {
    throw new Error("OneDrive-Upload-Session konnte nicht gestartet werden.");
  }

  const total = bytes.byteLength;
  const chunkSize = 320 * 1024 * 10; // 3,2 MB — Vielfaches von 320 KiB
  let offset = 0;
  let zuletzt: unknown = {};

  while (offset < total) {
    const ende = Math.min(offset + chunkSize, total);
    const chunk = bytes.subarray(offset, ende);
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${offset}-${ende - 1}/${total}`,
      },
      body: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
    });
    zuletzt = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202) {
      throw graphFehler(res.status, zuletzt as GraphFehlerJson, benutzer);
    }
    offset = ende;
  }

  const item = mapDriveItem(zuletzt as RohDriveItem);
  if (!item) {
    throw new Error(`Upload von „${safeName}“ abgeschlossen, aber ohne Datei-Metadaten.`);
  }
  return item;
}

/** Datei in OneDrive hochladen (Root oder Unterordner). Bei Namenskonflikt: umbenennen. */
export async function graphDriveDateiHochladen(
  accessToken: string,
  benutzer: string,
  dateiname: string,
  bytes: Uint8Array,
  optionen: { parentItemId?: string | null; contentType?: string | null } = {},
): Promise<GraphDriveItem> {
  if (bytes.byteLength === 0) {
    throw new Error(`Datei „${dateiname}“ ist leer.`);
  }

  if (bytes.byteLength <= GRAPH_SIMPLE_UPLOAD_MAX) {
    const pfad =
      driveUploadPfad(benutzer, dateiname, optionen.parentItemId) +
      "?@microsoft.graph.conflictBehavior=rename";
    return graphDriveSimpleUpload(
      accessToken,
      benutzer,
      pfad,
      bytes,
      optionen.contentType ?? null,
    );
  }

  return graphDriveSessionUpload(
    accessToken,
    benutzer,
    dateiname,
    bytes,
    optionen.parentItemId,
  );
}
