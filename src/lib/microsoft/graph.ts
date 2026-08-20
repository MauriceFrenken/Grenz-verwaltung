const GRAPH_BASIS = "https://graph.microsoft.com/v1.0";

export type GraphPostfachInfo = {
  ordnerId: string;
  anzeigename: string | null;
  anzahlNachrichten: number | null;
};

/** Primärer Anhangstyp für Listen-Icons (PDF vor Bild). */
export type GraphAnhangArt = "pdf" | "bild" | "keins";

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
      `Kein Zugriff auf ${postfach ?? "das Postfach"}. In Entra braucht die App die Application-Permission ` +
        `„Mail.ReadWrite“ (nicht Delegated) und „Grant admin consent“. Graph: ${message}`,
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

function istBildAnhang(a: RohAnhangMeta): boolean {
  const ct = (a.contentType ?? "").toLowerCase();
  const name = (a.name ?? "").toLowerCase();
  return (
    ct.startsWith("image/") || /\.(jpe?g|png|gif|webp|tiff?|bmp)$/i.test(name)
  );
}

function anhangArtAus(anhaenge: RohAnhangMeta[]): GraphAnhangArt {
  if (anhaenge.some(istPdfAnhang)) return "pdf";
  if (anhaenge.some(istBildAnhang)) return "bild";
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

function mapNachricht(roh: RohNachricht): GraphNachricht | null {
  if (!roh.id) return null;
  const anhaenge = (roh.attachments ?? []).filter((a) => !a.isInline);
  const pdf = anhaenge.find(istPdfAnhang);
  return {
    id: roh.id,
    internetMessageId: roh.internetMessageId ?? null,
    betreff: roh.subject ?? null,
    absenderName: roh.from?.emailAddress?.name ?? null,
    absenderMail: roh.from?.emailAddress?.address?.toLowerCase() ?? null,
    eingegangenAm: roh.receivedDateTime ?? null,
    hatAnhaenge: roh.hasAttachments === true,
    anhangArt: anhangArtAus(anhaenge),
    pdfAnhang: pdf ? mapAnhangMeta(pdf) : null,
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
    ? nachrichten.filter((n) => n.hatAnhaenge)
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

/** Einzelner Anhang mit Inhalt (Base64) — ohne die übrigen Anhänge zu laden. */
export async function graphAnhangInhalt(
  accessToken: string,
  postfach: string,
  nachrichtId: string,
  anhangId: string,
): Promise<GraphAnhang> {
  const a = await graphGet<{
    id?: string;
    name?: string;
    contentType?: string;
    size?: number;
    isInline?: boolean;
    contentBytes?: string;
  }>(
    `/users/${encodeURIComponent(postfach)}/messages/${encodeURIComponent(nachrichtId)}` +
      `/attachments/${encodeURIComponent(anhangId)}`,
    accessToken,
    postfach,
  );

  if (!a.contentBytes) {
    throw new Error(
      `Anhang „${a.name ?? anhangId}“ enthält keine Datei-Daten.`,
    );
  }

  return {
    id: a.id ?? anhangId,
    name: a.name ?? "unbenannt",
    contentType: a.contentType ?? null,
    groesse: typeof a.size === "number" ? a.size : 0,
    istInline: a.isInline === true,
    contentBytes: a.contentBytes,
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
