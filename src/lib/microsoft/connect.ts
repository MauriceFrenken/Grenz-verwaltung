import {
  graphDriveRootKinder,
  graphMasterKategorieSicherstellen,
  graphPostfachPruefen,
} from "./graph";
import { microsoftOneDriveUser, microsoftPostMailboxZweit } from "./ablage";
import {
  MICROSOFT_ABLEGEN_KATEGORIE,
  MICROSOFT_ABLEGEN_KATEGORIE_FARBE,
} from "./config";
import { microsoftAccessToken } from "./postfach";
import {
  leseMicrosoftRow,
  leseMicrosoftStatus,
  loescheMicrosoftVerbindung,
  markiereMicrosoftFehler,
  markiereMicrosoftPruefungOk,
  speichereMicrosoftVerbindung,
  type MicrosoftIntegrationStatus,
} from "./store";
import { microsoftCallerAusJwt, type MicrosoftCaller } from "./supabase-admin";
import {
  acquireMicrosoftAppToken,
  microsoftAzureIstKonfiguriert,
  microsoftPostfach,
  microsoftServerTenantId,
} from "./token-exchange";

export type MicrosoftStatusPayload = MicrosoftIntegrationStatus & {
  azureKonfiguriert: boolean;
  /** Shared Postfach — einziges Ziel der App-only-Verbindung. */
  postfach: string;
  postfachNachrichten: number | null;
  modus: "app-only";
};

async function ablegenKategorieSicherstellen(accessToken: string): Promise<void> {
  const postfach = microsoftPostMailboxZweit();
  if (!postfach) return;
  try {
    await graphMasterKategorieSicherstellen(
      accessToken,
      postfach,
      MICROSOFT_ABLEGEN_KATEGORIE,
      MICROSOFT_ABLEGEN_KATEGORIE_FARBE,
    );
  } catch (err) {
    console.error(
      "[microsoft] Outlook-Kategorie „ablegen“ konnte nicht angelegt werden",
      "(MailboxSettings.ReadWrite in Entra prüfen)",
      err,
    );
  }
}

function statusPayload(
  status: MicrosoftIntegrationStatus,
  postfachNachrichten: number | null = null,
): MicrosoftStatusPayload {
  return {
    ...status,
    azureKonfiguriert: microsoftAzureIstKonfiguriert(),
    postfach: microsoftPostfach(),
    postfachNachrichten,
    modus: "app-only",
  };
}

async function requireCaller(token: string): Promise<MicrosoftCaller> {
  return microsoftCallerAusJwt(token);
}

export async function microsoftStatusFuerNutzer(supabaseAccessToken: string): Promise<MicrosoftStatusPayload> {
  await requireCaller(supabaseAccessToken);
  try {
    const status = await leseMicrosoftStatus();
    return statusPayload(status);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Status konnte nicht geladen werden.";
    return statusPayload({
      id: "microsoft365",
      status: "getrennt",
      kontoEmail: null,
      tenantId: null,
      scopes: null,
      verbundenAm: null,
      letztePruefungAm: null,
      letzterFehler: message,
    });
  }
}

/**
 * App-only verbinden: Client Credentials → Postfach ankauf@ prüfen → speichern.
 */
export async function completeMicrosoftConnect(input: {
  supabaseAccessToken: string;
}): Promise<MicrosoftStatusPayload> {
  const caller = await requireCaller(input.supabaseAccessToken);
  const postfach = microsoftPostfach();

  if (!microsoftAzureIstKonfiguriert()) {
    throw new Error(
      "Microsoft App-only ist nicht konfiguriert. MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET und MICROSOFT_TENANT_ID (GUID) setzen.",
    );
  }

  const tokens = await acquireMicrosoftAppToken();
  // Nur Mail-Endpunkt — /users/{mail} (Profil) braucht User.Read.All und ist unnötig.
  const info = await graphPostfachPruefen(tokens.accessToken, postfach);
  // OneDrive (Dokumentenablage) — braucht Files.ReadWrite.All + Admin Consent.
  await graphDriveRootKinder(tokens.accessToken, microsoftOneDriveUser());
  await ablegenKategorieSicherstellen(tokens.accessToken);

  const status = await speichereMicrosoftVerbindung({
    tokens,
    kontoEmail: postfach,
    graphUserId: null,
    tenantId: microsoftServerTenantId(),
    verbundenVon: caller.userId,
  });

  return statusPayload(status, info.anzahlNachrichten);
}

export async function disconnectMicrosoft(supabaseAccessToken: string): Promise<MicrosoftStatusPayload> {
  await requireCaller(supabaseAccessToken);
  const status = await loescheMicrosoftVerbindung();
  return statusPayload(status);
}

export async function probeMicrosoft(supabaseAccessToken: string): Promise<MicrosoftStatusPayload> {
  await requireCaller(supabaseAccessToken);
  const postfach = microsoftPostfach();

  const row = await leseMicrosoftRow();
  if (row?.status !== "verbunden" && !row?.accessToken) {
    throw new Error("Microsoft ist nicht verbunden. Bitte zuerst „App-Verbindung herstellen“.");
  }

  try {
    // Frisches Token — neue Entra-Permissions (z. B. Files.ReadWrite.All) sofort aktiv.
    const { accessToken } = await microsoftAccessToken({ erneuern: true });
    const info = await graphPostfachPruefen(accessToken, postfach);
    await graphDriveRootKinder(accessToken, microsoftOneDriveUser());
    await ablegenKategorieSicherstellen(accessToken);
    await markiereMicrosoftPruefungOk();
    return statusPayload(await leseMicrosoftStatus(), info.anzahlNachrichten);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Prüfung fehlgeschlagen";
    return statusPayload(await markiereMicrosoftFehler(message));
  }
}
