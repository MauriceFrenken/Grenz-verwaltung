import {
  MICROSOFT_ABLAGE_ROOT_AUSSCHLUSS,
  MICROSOFT_ABLAGE_ROOT_MUSTER,
  MICROSOFT_DOKUMENT_POSTEINGANG_SEIT,
  MICROSOFT_ONEDRIVE_USER,
  MICROSOFT_POST_MAILBOX,
  MICROSOFT_POST_MAILBOX_ZWEIT,
} from "./config";
import {
  graphAnhangBinary,
  graphDriveDateiHochladen,
  graphDriveItemKinder,
  graphDriveRootKinder,
  graphNachrichtAnhaenge,
  graphNachrichtAnhangMetas,
  graphNachrichtAnhaengeAnwenden,
  graphPosteingangNachrichten,
  type GraphDriveItem,
  type GraphNachricht,
} from "./graph";
import { microsoftAccessToken } from "./postfach";
import { microsoftCallerAusJwt } from "./supabase-admin";

/** Kurzer In-Memory-Cache für OneDrive-Ordnerlisten (Server-Instanz). */
const DRIVE_KINDER_CACHE_TTL_MS = 60_000;
const driveKinderCache = new Map<
  string,
  { expires: number; items: GraphDriveItem[] }
>();

async function mapMitLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(items[idx]!);
    }
  }
  const workers = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export function dokumentPosteingangSchluessel(
  postfach: string,
  graphNachrichtId: string,
): string {
  return `${postfach.toLowerCase()}|${graphNachrichtId}`;
}

function readEnv(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return (process.env[name] ?? "").trim();
}

/** OneDrive-UPN für Dokumentenablage (Env überschreibt Default). */
export function microsoftOneDriveUser(): string {
  return (
    readEnv("MICROSOFT_ONEDRIVE_USER") || MICROSOFT_ONEDRIVE_USER
  ).trim().toLowerCase();
}

/** Shared Postfach für Dokumente › Postfach. */
export function microsoftPostMailbox(): string {
  return (
    readEnv("MICROSOFT_POST_MAILBOX") || MICROSOFT_POST_MAILBOX
  ).trim().toLowerCase();
}

/** Zweites Postfach für Dokumente › Postfach. */
export function microsoftPostMailboxZweit(): string {
  return (
    readEnv("MICROSOFT_POST_MAILBOX_ZWEIT") || MICROSOFT_POST_MAILBOX_ZWEIT
  ).trim().toLowerCase();
}

export type DokumentPosteingangQuelle = {
  postfach: string;
  seit?: string;
};

/** Alle Postfächer für Dokumente › Postfach (Reihenfolge = Anzeige). */
export function microsoftDokumentPosteingangQuellen(): DokumentPosteingangQuelle[] {
  const primaer = microsoftPostMailbox();
  const zweit = microsoftPostMailboxZweit();
  const seit =
    readEnv("MICROSOFT_DOKUMENT_POSTEINGANG_SEIT") ||
    MICROSOFT_DOKUMENT_POSTEINGANG_SEIT;

  const quellen: DokumentPosteingangQuelle[] = [{ postfach: primaer }];
  if (zweit && zweit !== primaer) {
    quellen.push({ postfach: zweit, seit });
  }
  return quellen;
}

export type DokumentPosteingangNachricht = GraphNachricht & { postfach: string };

function dokumentPosteingangSortieren(
  nachrichten: DokumentPosteingangNachricht[],
): DokumentPosteingangNachricht[] {
  return [...nachrichten].sort((a, b) => {
    const da = a.eingegangenAm ? new Date(a.eingegangenAm).getTime() : 0;
    const db = b.eingegangenAm ? new Date(b.eingegangenAm).getTime() : 0;
    return db - da;
  });
}

/** Root-Filter: nur Gesellschaftsordner laut Kundenliste. */
export function istAblageRootOrdner(name: string): boolean {
  const n = name.trim();
  if (MICROSOFT_ABLAGE_ROOT_AUSSCHLUSS.some((m) => m.test(n))) return false;
  return MICROSOFT_ABLAGE_ROOT_MUSTER.some((muster) => muster.test(n));
}

export async function microsoftOneDriveKinderLesen(input: {
  supabaseAccessToken: string;
  /** Leer / fehlend = Root. */
  itemId?: string | null;
  /** Cache umgehen (manuelles Aktualisieren). */
  frisch?: boolean;
}): Promise<{ benutzer: string; items: GraphDriveItem[] }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const { accessToken } = await microsoftAccessToken();
  const benutzer = microsoftOneDriveUser();
  const itemId = input.itemId?.trim() || null;
  const cacheKey = `${benutzer}:${itemId ?? "root"}`;

  if (!input.frisch) {
    const hit = driveKinderCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return { benutzer, items: hit.items };
    }
  }

  let items: GraphDriveItem[];
  if (itemId) {
    items = await graphDriveItemKinder(accessToken, benutzer, itemId);
  } else {
    const root = await graphDriveRootKinder(accessToken, benutzer);
    // Nur nach Namen filtern — kein istOrdner-Zwang (Graph liefert facet manchmal nicht).
    items = root.filter((item) => istAblageRootOrdner(item.name));
  }

  driveKinderCache.set(cacheKey, {
    expires: Date.now() + DRIVE_KINDER_CACHE_TTL_MS,
    items,
  });
  return { benutzer, items };
}

/**
 * Leichte Inbox-Liste ohne Anhang-`$expand` (schnell).
 */
export async function microsoftDokumentPosteingangLeichtLesen(
  anzahl = 50,
): Promise<{ postfaecher: string[]; nachrichten: DokumentPosteingangNachricht[] }> {
  const { accessToken } = await microsoftAccessToken();
  const quellen = microsoftDokumentPosteingangQuellen();
  const top = Math.min(Math.max(anzahl, 1), 100);

  const bloecke = await Promise.all(
    quellen.map(async ({ postfach, seit }) => {
      const liste = await graphPosteingangNachrichten(accessToken, postfach, {
        anzahl: top,
        seit,
        nurMitAnhang: true,
        mitAnhangMetas: false,
      });
      return liste.map((n) => ({ ...n, postfach }));
    }),
  );

  return {
    postfaecher: quellen.map((q) => q.postfach),
    nachrichten: dokumentPosteingangSortieren(bloecke.flat()).slice(0, top),
  };
}

/**
 * Lädt Anhang-Metadaten nur für unbekannte Nachrichten.
 * `bekannteNachrichtSchluessel`: `postfach|graphNachrichtId`.
 */
export async function microsoftDokumentPosteingangAnreichern(
  nachrichten: DokumentPosteingangNachricht[],
  bekannteNachrichtSchluessel: Set<string>,
): Promise<DokumentPosteingangNachricht[]> {
  const neu = nachrichten.filter(
    (n) =>
      !bekannteNachrichtSchluessel.has(
        dokumentPosteingangSchluessel(n.postfach, n.id),
      ),
  );
  if (neu.length === 0) return nachrichten;

  const { accessToken } = await microsoftAccessToken();
  const angereichert = await mapMitLimit(neu, 4, async (n) => {
    const metas = await graphNachrichtAnhangMetas(
      accessToken,
      n.postfach,
      n.id,
    );
    return {
      ...graphNachrichtAnhaengeAnwenden(n, metas),
      postfach: n.postfach,
    };
  });
  const byKey = new Map(
    angereichert.map((n) => [
      dokumentPosteingangSchluessel(n.postfach, n.id),
      n,
    ]),
  );

  return nachrichten
    .map((n) => byKey.get(dokumentPosteingangSchluessel(n.postfach, n.id)) ?? n)
    .filter((n) => {
      if (
        bekannteNachrichtSchluessel.has(
          dokumentPosteingangSchluessel(n.postfach, n.id),
        )
      ) {
        return true;
      }
      return n.anhaenge.length > 0;
    });
}

/**
 * Posteingang lesen (ohne User-Auth — für Cron / Sync).
 * Leichte Graph-Liste; Anhang-Metas nur für unbekannte Mails.
 */
export async function microsoftDokumentPosteingangLesenIntern(input?: {
  anzahl?: number;
  bekannteNachrichtSchluessel?: Set<string>;
}): Promise<{ postfaecher: string[]; nachrichten: DokumentPosteingangNachricht[] }> {
  const { postfaecher, nachrichten: leicht } =
    await microsoftDokumentPosteingangLeichtLesen(input?.anzahl ?? 50);
  const bekannt = input?.bekannteNachrichtSchluessel ?? new Set<string>();
  const nachrichten = await microsoftDokumentPosteingangAnreichern(
    leicht,
    bekannt,
  );
  return { postfaecher, nachrichten };
}

/** Liest den Posteingang aller Dokument-Postfächer (Dokumente › Postfach). */
export async function microsoftDokumentPosteingangLesen(input: {
  supabaseAccessToken: string;
  anzahl?: number;
}): Promise<{ postfaecher: string[]; nachrichten: DokumentPosteingangNachricht[] }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  return microsoftDokumentPosteingangLesenIntern({ anzahl: input.anzahl });
}

export type AblegenErgebnis = {
  postfach: string;
  onedriveUser: string;
  hochgeladen: Array<{ name: string; id: string; webUrl: string | null }>;
};

function dokumentPostfachAufloesen(postfach?: string | null): string {
  const erlaubt = new Set(
    microsoftDokumentPosteingangQuellen().map((q) => q.postfach),
  );
  const gewaehlt = (postfach?.trim() || microsoftPostMailbox()).toLowerCase();
  if (!erlaubt.has(gewaehlt)) {
    throw new Error("Postfach für diese Nachricht ist nicht konfiguriert.");
  }
  return gewaehlt;
}

export type EinzelAnhangAblegenErgebnis = {
  postfach: string;
  onedriveUser: string;
  hochgeladen: { name: string; id: string; webUrl: string | null };
};

/** Einen Nicht-Inline-Anhang nach OneDrive (Root oder Ordner) ablegen. */
export async function microsoftAnhangNachOneDriveAblegen(input: {
  supabaseAccessToken: string;
  nachrichtId: string;
  anhangId: string;
  postfach?: string | null;
  /** Optional: Zielordner in OneDrive. */
  parentItemId?: string | null;
  /** Optional: Zieldateiname (sonst Originalname des Anhangs). */
  dateiname?: string | null;
}): Promise<EinzelAnhangAblegenErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  if (!input.nachrichtId?.trim()) {
    throw new Error("nachrichtId ist erforderlich.");
  }
  if (!input.anhangId?.trim()) {
    throw new Error("anhangId ist erforderlich.");
  }

  const { accessToken } = await microsoftAccessToken();
  const postfach = dokumentPostfachAufloesen(input.postfach);
  const onedriveUser = microsoftOneDriveUser();
  const nachrichtId = input.nachrichtId.trim();
  const anhangId = input.anhangId.trim();

  const binary = await graphAnhangBinary(
    accessToken,
    postfach,
    nachrichtId,
    anhangId,
  );
  const uploadName =
    input.dateiname?.trim() || binary.name || "Dokument.pdf";
  const item = await graphDriveDateiHochladen(
    accessToken,
    onedriveUser,
    uploadName,
    binary.bytes,
    {
      parentItemId: input.parentItemId,
      contentType: binary.contentType,
    },
  );

  return {
    postfach,
    onedriveUser,
    hochgeladen: {
      name: item.name,
      id: item.id,
      webUrl: item.webUrl,
    },
  };
}

/** Alle Nicht-Inline-Anhänge einer Mail nach OneDrive (Root) ablegen. */
export async function microsoftAnhaengeNachOneDriveAblegen(input: {
  supabaseAccessToken: string;
  nachrichtId: string;
  postfach?: string | null;
  /** Optional: Zielordner in OneDrive. */
  parentItemId?: string | null;
}): Promise<AblegenErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  if (!input.nachrichtId?.trim()) {
    throw new Error("nachrichtId ist erforderlich.");
  }

  const { accessToken } = await microsoftAccessToken();
  const postfach = dokumentPostfachAufloesen(input.postfach);
  const onedriveUser = microsoftOneDriveUser();
  const nachrichtId = input.nachrichtId.trim();

  const anhaenge = (await graphNachrichtAnhaenge(accessToken, postfach, nachrichtId)).filter(
    (a) => !a.istInline,
  );
  if (anhaenge.length === 0) {
    throw new Error("Diese Nachricht hat keine Datei-Anhänge.");
  }

  const hochgeladen: AblegenErgebnis["hochgeladen"] = [];

  for (const anhang of anhaenge) {
    const binary = await graphAnhangBinary(
      accessToken,
      postfach,
      nachrichtId,
      anhang.id,
    );
    const item = await graphDriveDateiHochladen(
      accessToken,
      onedriveUser,
      binary.name,
      binary.bytes,
      {
        parentItemId: input.parentItemId,
        contentType: binary.contentType,
      },
    );
    hochgeladen.push({
      name: item.name,
      id: item.id,
      webUrl: item.webUrl,
    });
  }

  return { postfach, onedriveUser, hochgeladen };
}
