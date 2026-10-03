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
  /** Outlook-Kategorien (z. B. „ablegen“). */
  categories: string[];
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

async function graphPatch<T>(
  pfad: string,
  accessToken: string,
  body: unknown,
  postfach?: string,
): Promise<T> {
  const res = await fetch(`${GRAPH_BASIS}${pfad}`, {
    method: "PATCH",
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
  categories?: string[];
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
    categories: (roh.categories ?? [])
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter(Boolean),
    vorschau: roh.bodyPreview ?? null,
    webLink: roh.webLink ?? null,
  };
}

export async function graphPosteingangNachrichten(
  accessToken: string,
  postfach: string,
  optionen: {
    anzahl?: number;
    seit?: string;
    nurMitAnhang?: boolean;
    /** Gesamten Posteingang paginiert laden (ignoriere anzahl). */
    alle?: boolean;
    /** Nur mit `alle`: Max. Graph-Seiten à 50. Default 100. */
    maxSeiten?: number;
  } = {},
): Promise<GraphNachricht[]> {
  const alle = optionen.alle === true;
  const seitenGroesse = alle
    ? 50
    : Math.min(Math.max(optionen.anzahl ?? 25, 1), 100);
  const maxSeiten = alle
    ? Math.min(Math.max(optionen.maxSeiten ?? 100, 1), 200)
    : 1;

  const params = new URLSearchParams({
    $select:
      "id,internetMessageId,subject,from,receivedDateTime,hasAttachments,bodyPreview,webLink,categories",
    $expand: "attachments($select=id,name,contentType,size,isInline)",
    $orderby: "receivedDateTime desc",
    $top: String(seitenGroesse),
  });
  if (optionen.seit) {
    params.set("$filter", `receivedDateTime ge ${optionen.seit}`);
  }

  const treffer: GraphNachricht[] = [];
  let url: string | null =
    `${GRAPH_BASIS}/users/${encodeURIComponent(postfach)}/mailFolders/inbox/messages?${params.toString()}`;
  let seite = 0;

  while (url && seite < maxSeiten) {
    seite += 1;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw graphFehler(res.status, json as GraphFehlerJson, postfach);
    }
    const data = json as {
      value?: RohNachricht[];
      "@odata.nextLink"?: string;
    };

    for (const roh of data.value ?? []) {
      const n = mapNachricht(roh);
      if (!n) continue;
      if (optionen.nurMitAnhang && n.anhaenge.length === 0) continue;
      treffer.push(n);
    }

    url = alle ? (data["@odata.nextLink"] ?? null) : null;
  }

  return treffer;
}

/**
 * Alle Inbox-Mails mit einer Outlook-Kategorie (paginiert, ohne Alters-Cutoff).
 * Für Auto-Ablegen: Kategorie „ablegen“, unabhängig vom Top-N-Inbox-Fenster.
 */
export async function graphPosteingangNachrichtenMitKategorie(
  accessToken: string,
  postfach: string,
  kategorie: string,
  optionen: {
    nurMitAnhang?: boolean;
    /** Max. Graph-Seiten à 50. Default 20 (= bis 1000 Mails). */
    maxSeiten?: number;
  } = {},
): Promise<GraphNachricht[]> {
  const name = kategorie.trim();
  if (!name) return [];

  const escaped = name.replace(/'/g, "''");
  const maxSeiten = Math.min(Math.max(optionen.maxSeiten ?? 20, 1), 40);
  // Kein $orderby: Graph lehnt oft Filter auf categories + OrderBy ab.
  const params = new URLSearchParams({
    $select:
      "id,internetMessageId,subject,from,receivedDateTime,hasAttachments,bodyPreview,webLink,categories",
    $expand: "attachments($select=id,name,contentType,size,isInline)",
    $top: "50",
    $filter: `categories/any(c:c eq '${escaped}')`,
  });

  const treffer: GraphNachricht[] = [];
  let url: string | null =
    `${GRAPH_BASIS}/users/${encodeURIComponent(postfach)}/mailFolders/inbox/messages?${params.toString()}`;
  let seite = 0;

  while (url && seite < maxSeiten) {
    seite += 1;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw graphFehler(res.status, json as GraphFehlerJson, postfach);
    }
    const data = json as {
      value?: RohNachricht[];
      "@odata.nextLink"?: string;
    };

    for (const roh of data.value ?? []) {
      const n = mapNachricht(roh);
      if (!n) continue;
      if (optionen.nurMitAnhang && n.anhaenge.length === 0) continue;
      treffer.push(n);
    }

    url = data["@odata.nextLink"] ?? null;
  }

  return treffer;
}

/**
 * Stellt eine Outlook-Master-Kategorie sicher (Name + Farbe).
 * Braucht Application-Permission MailboxSettings.ReadWrite.
 */
export async function graphMasterKategorieSicherstellen(
  accessToken: string,
  postfach: string,
  displayName: string,
  color: string,
): Promise<{ id: string; displayName: string; color: string; angelegt: boolean }> {
  const name = displayName.trim();
  if (!name) throw new Error("Kategoriename fehlt.");

  const data = await graphGet<{
    value?: Array<{ id?: string; displayName?: string; color?: string }>;
  }>(
    `/users/${encodeURIComponent(postfach)}/outlook/masterCategories?$select=id,displayName,color&$top=100`,
    accessToken,
    postfach,
  );

  const vorhanden = (data.value ?? []).find(
    (c) => (c.displayName ?? "").trim().toLowerCase() === name.toLowerCase(),
  );

  if (vorhanden?.id) {
    if ((vorhanden.color ?? "").toLowerCase() !== color.toLowerCase()) {
      const updated = await graphPatch<{
        id?: string;
        displayName?: string;
        color?: string;
      }>(
        `/users/${encodeURIComponent(postfach)}/outlook/masterCategories/${encodeURIComponent(vorhanden.id)}`,
        accessToken,
        { color },
        postfach,
      );
      return {
        id: updated.id ?? vorhanden.id,
        displayName: updated.displayName ?? vorhanden.displayName ?? name,
        color: updated.color ?? color,
        angelegt: false,
      };
    }
    return {
      id: vorhanden.id,
      displayName: vorhanden.displayName ?? name,
      color: vorhanden.color ?? color,
      angelegt: false,
    };
  }

  const erstellt = await graphPost<{
    id?: string;
    displayName?: string;
    color?: string;
  }>(
    `/users/${encodeURIComponent(postfach)}/outlook/masterCategories`,
    accessToken,
    { displayName: name, color },
    postfach,
  );

  if (!erstellt.id) {
    throw new Error(`Kategorie „${name}“ konnte nicht angelegt werden.`);
  }
  return {
    id: erstellt.id,
    displayName: erstellt.displayName ?? name,
    color: erstellt.color ?? color,
    angelegt: true,
  };
}

/** Prüft ob eine Nachricht die genannte Kategorie trägt (case-insensitive). */
export function graphNachrichtHatKategorie(
  nachricht: { categories?: string[] | null },
  kategorie: string,
): boolean {
  const gesucht = kategorie.trim().toLowerCase();
  if (!gesucht) return false;
  return (nachricht.categories ?? []).some(
    (c) => c.trim().toLowerCase() === gesucht,
  );
}

export async function graphNachrichtAnhaenge(
  accessToken: string,
  postfach: string,
  nachrichtId: string,
): Promise<GraphAnhang[]> {
  const params = new URLSearchParams({
    $select: "id,name,contentType,size,isInline",
  });
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
    `/users/${encodeURIComponent(postfach)}/messages/${encodeURIComponent(nachrichtId)}/attachments?${params.toString()}`,
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

  // Deutscher Standardordner „Archiv“ oft nur als well-known folder erreichbar
  if (/^archiv$/i.test(anzeigename.trim())) {
    try {
      const wellKnown = await graphGet<{ id?: string }>(
        `${basis}/mailFolders/archive?$select=id`,
        accessToken,
        postfach,
      );
      if (wellKnown.id) return wellKnown.id;
    } catch {
      /* weiter zum Fehler unten */
    }
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

function normalisiereMailOrdnerName(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mailOrdnerNameScore(gesucht: string, vorhanden: string): number {
  const a = normalisiereMailOrdnerName(gesucht);
  const b = normalisiereMailOrdnerName(vorhanden);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 90;

  const ta = a.split(" ").filter((t) => t.length > 2);
  const tb = b.split(" ").filter((t) => t.length > 2);
  if (ta.length === 0 || tb.length === 0) return 0;

  let treffer = 0;
  for (const t of ta) {
    const prefix = t.slice(0, Math.min(5, t.length));
    if (tb.some((u) => u === t || u.startsWith(prefix) || t.startsWith(u.slice(0, 5)))) {
      treffer += 1;
    }
  }
  return Math.round((treffer / ta.length) * 80);
}

/**
 * Findet den Gesellschafts-Unterordner im Posteingang (exakt, sonst fuzzy —
 * z. B. Tippfehler „Invesment“ vs. „Investment“).
 */
export async function graphPosteingangGesellschaftsOrdner(
  accessToken: string,
  postfach: string,
  gesellschaftName: string,
): Promise<{ id: string; name: string }> {
  const name = gesellschaftName.trim();
  if (!name) {
    throw new Error("Gesellschaftsname für den Postfach-Ordner fehlt.");
  }

  try {
    const id = await graphPosteingangUnterordner(accessToken, postfach, name);
    return { id, name };
  } catch {
    /* fuzzy */
  }

  const basis = `/users/${encodeURIComponent(postfach)}`;
  const params = new URLSearchParams({
    $select: "id,displayName",
    $top: "200",
  });
  const data = await graphGet<{
    value?: Array<{ id?: string; displayName?: string }>;
  }>(`${basis}/mailFolders/inbox/childFolders?${params.toString()}`, accessToken, postfach);

  let best: { id: string; name: string; score: number } | null = null;
  for (const roh of data.value ?? []) {
    if (!roh.id || !roh.displayName) continue;
    const score = mailOrdnerNameScore(name, roh.displayName);
    if (!best || score > best.score) {
      best = { id: roh.id, name: roh.displayName, score };
    }
  }

  if (!best || best.score < 50) {
    throw new Error(
      `Ordner „${name}“ wurde im Posteingang von ${postfach} nicht gefunden. Bitte manuell anlegen.`,
    );
  }
  return { id: best.id, name: best.name };
}

/** Inline-Anhang in sendMail — Graph-Limit ca. 3 MB. */
const GRAPH_INLINE_MAIL_ATTACHMENT_MAX = 3 * 1024 * 1024;

function mailSendZugriffFehler(postfach: string, cause: unknown): Error {
  const basis =
    cause instanceof Error ? cause.message : String(cause);
  if (/Access is denied|ErrorAccessDenied|403/i.test(basis)) {
    return new Error(
      `Kein Versand aus ${postfach}: In Entra fehlt die Application-Permission „Mail.Send“ (Admin Consent). ${basis}`,
    );
  }
  return cause instanceof Error ? cause : new Error(basis);
}

/**
 * Sendet eine neue Mail mit genau einem Dateianhang (DATEV / TAM).
 * Benötigt Application-Permission Mail.Send.
 */
export async function graphAnhangAlsMailSenden(
  accessToken: string,
  postfach: string,
  input: {
    an: string;
    betreff: string;
    text?: string;
    dateiname: string;
    contentType: string | null;
    bytes: Uint8Array;
  },
): Promise<void> {
  const an = input.an.trim();
  if (!an) throw new Error("Empfänger-Adresse fehlt.");
  if (input.bytes.byteLength === 0) {
    throw new Error("Anhang ist leer und kann nicht versendet werden.");
  }

  const dateiname = graphDriveDateinameSaeubern(input.dateiname);
  const contentType = input.contentType || "application/octet-stream";
  const betreff = input.betreff.trim() || dateiname;
  const text = input.text ?? "";
  const basis = `/users/${encodeURIComponent(postfach)}`;

  try {
    if (input.bytes.byteLength <= GRAPH_INLINE_MAIL_ATTACHMENT_MAX) {
      const contentBytes = Buffer.from(
        input.bytes.buffer,
        input.bytes.byteOffset,
        input.bytes.byteLength,
      ).toString("base64");

      await graphPost(
        `${basis}/sendMail`,
        accessToken,
        {
          message: {
            subject: betreff,
            body: { contentType: "Text", content: text },
            toRecipients: [{ emailAddress: { address: an } }],
            attachments: [
              {
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: dateiname,
                contentType,
                contentBytes,
              },
            ],
          },
          saveToSentItems: true,
        },
        postfach,
      );
      return;
    }

    const draft = await graphPost<{ id?: string }>(
      `${basis}/messages`,
      accessToken,
      {
        subject: betreff,
        body: { contentType: "Text", content: text },
        toRecipients: [{ emailAddress: { address: an } }],
      },
      postfach,
    );
    if (!draft.id) {
      throw new Error("Entwurf für den Versand konnte nicht angelegt werden.");
    }

    const session = await graphPost<{ uploadUrl?: string }>(
      `${basis}/messages/${encodeURIComponent(draft.id)}/attachments/createUploadSession`,
      accessToken,
      {
        AttachmentItem: {
          attachmentType: "file",
          name: dateiname,
          size: input.bytes.byteLength,
          contentType,
        },
      },
      postfach,
    );
    if (!session.uploadUrl) {
      throw new Error("Upload-Session für den Mail-Anhang konnte nicht gestartet werden.");
    }

    const total = input.bytes.byteLength;
    const chunkSize = 320 * 1024 * 10;
    let offset = 0;
    while (offset < total) {
      const ende = Math.min(offset + chunkSize, total);
      const chunk = input.bytes.subarray(offset, ende);
      const res = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${offset}-${ende - 1}/${total}`,
        },
        body: new Uint8Array(chunk),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 201 && res.status !== 200) {
        throw graphFehler(res.status, json as GraphFehlerJson, postfach);
      }
      offset = ende;
    }

    await graphPost(
      `${basis}/messages/${encodeURIComponent(draft.id)}/send`,
      accessToken,
      {},
      postfach,
    );
  } catch (err) {
    throw mailSendZugriffFehler(postfach, err);
  }
}

export type GraphGesendeterAnhang = {
  nachrichtId: string;
  anhangName: string;
  empfaenger: string[];
  gesendetAm: string;
};

type RohGesendetNachricht = {
  id?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  attachments?: RohAnhangMeta[];
};

/**
 * Liest Anhänge aus dem Ordner „Gesendete Elemente“, optional nur an bestimmte
 * Empfänger (z. B. DATEV-Postfächer) und nur seit einem Datum.
 */
export async function graphGesendeteAnhaenge(
  accessToken: string,
  postfach: string,
  optionen: {
    seit: string;
    /** Nur Mails an diese Adressen (kleingeschrieben). Leer = alle. */
    empfaenger?: string[];
    /** Max. Graph-Seiten (je 50). Default 4. */
    maxSeiten?: number;
  },
): Promise<GraphGesendeterAnhang[]> {
  const empfaengerFilter = new Set(
    (optionen.empfaenger ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  const maxSeiten = Math.min(Math.max(optionen.maxSeiten ?? 4, 1), 10);
  const params = new URLSearchParams({
    $select: "id,sentDateTime,hasAttachments,toRecipients",
    $expand: "attachments($select=id,name,contentType,size,isInline)",
    $orderby: "sentDateTime desc",
    $top: "50",
    $filter: `sentDateTime ge ${optionen.seit} and hasAttachments eq true`,
  });

  const treffer: GraphGesendeterAnhang[] = [];
  let url: string | null =
    `${GRAPH_BASIS}/users/${encodeURIComponent(postfach)}/mailFolders/sentitems/messages?${params.toString()}`;
  let seite = 0;

  while (url && seite < maxSeiten) {
    seite += 1;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw graphFehler(res.status, json as GraphFehlerJson, postfach);
    }
    const data = json as {
      value?: RohGesendetNachricht[];
      "@odata.nextLink"?: string;
    };

    for (const roh of data.value ?? []) {
      if (!roh.id || !roh.sentDateTime) continue;
      const empfaenger = (roh.toRecipients ?? [])
        .map((r) => r.emailAddress?.address?.trim().toLowerCase() ?? "")
        .filter(Boolean);
      if (
        empfaengerFilter.size > 0 &&
        !empfaenger.some((e) => empfaengerFilter.has(e))
      ) {
        continue;
      }
      for (const anhang of roh.attachments ?? []) {
        if (anhang.isInline || !anhang.name?.trim()) continue;
        treffer.push({
          nachrichtId: roh.id,
          anhangName: anhang.name.trim(),
          empfaenger,
          gesendetAm: roh.sentDateTime,
        });
      }
    }

    url = data["@odata.nextLink"] ?? null;
  }

  return treffer;
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

/**
 * Kopiert eine Nachricht in einen Ordner.
 * Gleicher Postfach: Graph `/copy`.
 * Anderes Postfach: MIME-Export + Base64-Import (Graph `/copy` kann keine
 * Ordner-IDs fremder Mailboxen — ErrorInvalidMailboxItemId).
 */
export async function graphNachrichtKopieren(
  accessToken: string,
  quellPostfach: string,
  nachrichtId: string,
  zielOrdnerId: string,
  zielPostfach?: string,
): Promise<string> {
  const quell = quellPostfach.trim();
  const ziel = (zielPostfach ?? quellPostfach).trim();
  const gleicheMailbox = quell.toLowerCase() === ziel.toLowerCase();

  if (gleicheMailbox) {
    const kopie = await graphPost<{ id?: string }>(
      `/users/${encodeURIComponent(quell)}/messages/${encodeURIComponent(nachrichtId)}/copy`,
      accessToken,
      { destinationId: zielOrdnerId },
      quell,
    );
    return kopie.id ?? "";
  }

  const mimeRes = await fetch(
    `${GRAPH_BASIS}/users/${encodeURIComponent(quell)}/messages/${encodeURIComponent(nachrichtId)}/$value`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!mimeRes.ok) {
    const json: unknown = await mimeRes.json().catch(() => ({}));
    throw graphFehler(mimeRes.status, json as GraphFehlerJson, quell);
  }
  const mimeBase64 = Buffer.from(await mimeRes.arrayBuffer()).toString("base64");

  const importRes = await fetch(
    `${GRAPH_BASIS}/users/${encodeURIComponent(ziel)}/mailFolders/${encodeURIComponent(zielOrdnerId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/plain",
      },
      body: mimeBase64,
    },
  );
  const importJson: unknown = await importRes.json().catch(() => ({}));
  if (!importRes.ok) {
    throw graphFehler(importRes.status, importJson as GraphFehlerJson, ziel);
  }
  const id = (importJson as { id?: string }).id;
  if (!id) {
    throw new Error(
      `Kopie nach ${ziel} fehlgeschlagen: Graph lieferte keine Nachrichten-ID.`,
    );
  }
  return id;
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
