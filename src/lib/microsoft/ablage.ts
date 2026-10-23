import {
  MICROSOFT_ABLAGE_ROOT_AUSSCHLUSS,
  MICROSOFT_ABLEGEN_KATEGORIE,
} from "./config";
import {
  graphAnhangBinary,
  graphDriveDateiHochladen,
  graphDriveItemKinder,
  graphDriveRootKinder,
  graphNachrichtAnhaenge,
  graphNachrichtHatKategorie,
  graphPosteingangNachrichten,
  graphPosteingangNachrichtenMitKategorie,
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

function readEnv(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return (process.env[name] ?? "").trim();
}

/** Pflicht-Env (kleingeschrieben) — ohne Wert eine klare Fehlermeldung. */
function pflichtEnv(name: string, zweck: string): string {
  const wert = readEnv(name).toLowerCase();
  if (!wert) {
    throw new Error(`${name} ist nicht gesetzt (${zweck}).`);
  }
  return wert;
}

/** OneDrive-UPN für Dokumente › Dokumentenablage. */
export function microsoftOneDriveUser(): string {
  return pflichtEnv("MICROSOFT_ONEDRIVE_USER", "OneDrive der Dokumentenablage");
}

/** Shared Postfach für Dokumente › Postfach. */
export function microsoftPostMailbox(): string {
  return pflichtEnv("MICROSOFT_POST_MAILBOX", "Postfach für Dokumente › Postfach");
}

/** Optionales zweites Postfach für Dokumente › Postfach. */
export function microsoftPostMailboxZweit(): string {
  return readEnv("MICROSOFT_POST_MAILBOX_ZWEIT").toLowerCase();
}

/**
 * Postfach, in dem die Outlook-Kategorie „ablegen“ ausgewertet wird:
 * das zweite Postfach, sonst das Haupt-Postfach.
 */
export function microsoftAblegenKategoriePostfach(): string {
  return microsoftPostMailboxZweit() || microsoftPostMailbox();
}

export type DokumentPosteingangQuelle = {
  postfach: string;
  seit?: string;
};

/** Alle Postfächer für Dokumente › Postfach (Reihenfolge = Anzeige). */
export function microsoftDokumentPosteingangQuellen(): DokumentPosteingangQuelle[] {
  const primaer = microsoftPostMailbox();
  const zweit = microsoftPostMailboxZweit();
  // Optional: aus dem zweiten Postfach nur Mails ab diesem Datum (ISO)
  const seit = readEnv("MICROSOFT_DOKUMENT_POSTEINGANG_SEIT") || undefined;

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

/**
 * Root-Filter der Ablage. Mit MICROSOFT_ABLAGE_ROOT_ORDNER (kommagetrennte
 * Ordnernamen) nur diese Ordner, sonst alle außer OneDrive-Systemordnern.
 */
export function istAblageRootOrdner(name: string): boolean {
  const n = name.trim();
  if (MICROSOFT_ABLAGE_ROOT_AUSSCHLUSS.some((m) => m.test(n))) return false;
  const erlaubt = readEnv("MICROSOFT_ABLAGE_ROOT_ORDNER")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (erlaubt.length === 0) return true;
  return erlaubt.includes(n.toLowerCase());
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
 * Gesamten Posteingang lesen (ohne User-Auth — für Cron / interne Aufrufe).
 * Paginiert alle offenen Mails mit Anhang; kein Top-N-Cap.
 */
export async function microsoftDokumentPosteingangLesenIntern(_input?: {
  /** @deprecated Ignoriert — es werden alle Inbox-Mails geladen. */
  anzahl?: number;
}): Promise<{ postfaecher: string[]; nachrichten: DokumentPosteingangNachricht[] }> {
  const { accessToken } = await microsoftAccessToken();
  const quellen = microsoftDokumentPosteingangQuellen();

  const bloecke = await Promise.all(
    quellen.map(async ({ postfach, seit }) => {
      const liste = await graphPosteingangNachrichten(accessToken, postfach, {
        alle: true,
        seit,
        nurMitAnhang: true,
      });
      return liste.map((n) => ({ ...n, postfach }));
    }),
  );

  const nachrichten = dokumentPosteingangSortieren(bloecke.flat());
  return { postfaecher: quellen.map((q) => q.postfach), nachrichten };
}

/** Graph-Nachrichten-IDs (postfach|id) mit Outlook-Kategorie „ablegen“. */
export function ablegenKategorieNachrichtSchluessel(
  nachrichten: DokumentPosteingangNachricht[],
): Set<string> {
  const keys = new Set<string>();
  for (const n of nachrichten) {
    if (!graphNachrichtHatKategorie(n, MICROSOFT_ABLEGEN_KATEGORIE)) continue;
    keys.add(`${n.postfach.toLowerCase()}|${n.id}`);
  }
  return keys;
}

/**
 * Alle Inbox-Mails mit Kategorie „ablegen“ im Kategorie-Postfach
 * (paginiert, ohne Top-N- und ohne Alters-Cutoff).
 */
export async function microsoftAblegenKategorieMailsLesen(): Promise<
  DokumentPosteingangNachricht[]
> {
  const postfach = microsoftAblegenKategoriePostfach();

  const { accessToken } = await microsoftAccessToken();
  const liste = await graphPosteingangNachrichtenMitKategorie(
    accessToken,
    postfach,
    MICROSOFT_ABLEGEN_KATEGORIE,
    { nurMitAnhang: true },
  );
  return liste.map((n) => ({ ...n, postfach }));
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
