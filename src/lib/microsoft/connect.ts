import { graphPostfachPruefen } from "./graph";
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

async function requireCaller(token: string, verbinden: boolean): Promise<MicrosoftCaller> {
  const caller = await microsoftCallerAusJwt(token);
  if (verbinden && !caller.darfVerbinden) {
    throw new Error("Nur Administratoren dürfen die Microsoft-Integration verbinden oder trennen.");
  }
  return caller;
}

export async function microsoftStatusFuerNutzer(supabaseAccessToken: string): Promise<MicrosoftStatusPayload> {
  await requireCaller(supabaseAccessToken, false);
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
  const caller = await requireCaller(input.supabaseAccessToken, true);
  const postfach = microsoftPostfach();

  if (!microsoftAzureIstKonfiguriert()) {
    throw new Error(
      "Microsoft App-only ist nicht konfiguriert. MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET und MICROSOFT_TENANT_ID (GUID) setzen.",
    );
  }

  const tokens = await acquireMicrosoftAppToken();
  // Nur Mail-Endpunkt — /users/{mail} (Profil) braucht User.Read.All und ist unnötig.
  const info = await graphPostfachPruefen(tokens.accessToken, postfach);

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
  await requireCaller(supabaseAccessToken, true);
  const status = await loescheMicrosoftVerbindung();
  return statusPayload(status);
}

export async function probeMicrosoft(supabaseAccessToken: string): Promise<MicrosoftStatusPayload> {
  await requireCaller(supabaseAccessToken, true);
  const postfach = microsoftPostfach();

  const row = await leseMicrosoftRow();
  if (row?.status !== "verbunden" && !row?.accessToken) {
    throw new Error("Microsoft ist nicht verbunden. Bitte zuerst „App-Verbindung herstellen“.");
  }

  try {
    const { accessToken } = await microsoftAccessToken();
    const info = await graphPostfachPruefen(accessToken, postfach);
    await markiereMicrosoftPruefungOk();
    return statusPayload(await leseMicrosoftStatus(), info.anzahlNachrichten);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Prüfung fehlgeschlagen";
    return statusPayload(await markiereMicrosoftFehler(message));
  }
}
