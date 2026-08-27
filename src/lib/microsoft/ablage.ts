import {
  MICROSOFT_ABLAGE_ROOT_AUSSCHLUSS,
  MICROSOFT_ABLAGE_ROOT_MUSTER,
  MICROSOFT_ONEDRIVE_USER,
  MICROSOFT_POST_MAILBOX,
} from "./config";
import {
  graphAnhangBinary,
  graphDriveDateiHochladen,
  graphDriveItemKinder,
  graphDriveRootKinder,
  graphNachrichtAnhaenge,
  graphPosteingangNachrichten,
  type GraphDriveItem,
  type GraphNachricht,
} from "./graph";
import { microsoftAccessToken } from "./postfach";
import { microsoftCallerAusJwt } from "./supabase-admin";

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
}): Promise<{ benutzer: string; items: GraphDriveItem[] }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const { accessToken } = await microsoftAccessToken();
  const benutzer = microsoftOneDriveUser();
  const itemId = input.itemId?.trim() || null;

  if (itemId) {
    const items = await graphDriveItemKinder(accessToken, benutzer, itemId);
    return { benutzer, items };
  }

  const root = await graphDriveRootKinder(accessToken, benutzer);
  // Nur nach Namen filtern — kein istOrdner-Zwang (Graph liefert facet manchmal nicht).
  const items = root.filter((item) => istAblageRootOrdner(item.name));
  return { benutzer, items };
}

/** Liest den Posteingang von post@ (Dokumente › Postfach). */
export async function microsoftDokumentPosteingangLesen(input: {
  supabaseAccessToken: string;
  anzahl?: number;
}): Promise<{ postfach: string; nachrichten: GraphNachricht[] }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const { accessToken } = await microsoftAccessToken();
  const postfach = microsoftPostMailbox();
  const nachrichten = await graphPosteingangNachrichten(accessToken, postfach, {
    anzahl: input.anzahl ?? 50,
    nurMitAnhang: true,
  });
  return { postfach, nachrichten };
}

export type AblegenErgebnis = {
  postfach: string;
  onedriveUser: string;
  hochgeladen: Array<{ name: string; id: string; webUrl: string | null }>;
};

/** Alle Nicht-Inline-Anhänge einer Mail nach OneDrive (Root) ablegen. */
export async function microsoftAnhaengeNachOneDriveAblegen(input: {
  supabaseAccessToken: string;
  nachrichtId: string;
  /** Optional: Zielordner in OneDrive. */
  parentItemId?: string | null;
}): Promise<AblegenErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  if (!input.nachrichtId?.trim()) {
    throw new Error("nachrichtId ist erforderlich.");
  }

  const { accessToken } = await microsoftAccessToken();
  const postfach = microsoftPostMailbox();
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
