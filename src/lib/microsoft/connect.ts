import { graphMe, kontoAusGraphMe } from "./graph";
import {
  leseMicrosoftRow,
  leseMicrosoftStatus,
  loescheMicrosoftVerbindung,
  markiereMicrosoftFehler,
  markiereMicrosoftPruefungOk,
  speichereMicrosoftVerbindung,
  aktualisiereMicrosoftTokens,
  type MicrosoftIntegrationStatus,
} from "./store";
import { microsoftCallerAusJwt, type MicrosoftCaller } from "./supabase-admin";
import {
  exchangeMicrosoftAuthorizationCode,
  microsoftAzureIstKonfiguriert,
  microsoftErwartetesKonto,
  microsoftServerTenantId,
  refreshMicrosoftAccessToken,
  type MicrosoftTokenExchangeInput,
} from "./token-exchange";

export type MicrosoftConnectInput = MicrosoftTokenExchangeInput & {
  supabaseAccessToken: string;
};

export type MicrosoftStatusPayload = MicrosoftIntegrationStatus & {
  azureKonfiguriert: boolean;
  erwartetesKonto: string;
  callbackUrls: string[];
};

function statusPayload(status: MicrosoftIntegrationStatus): MicrosoftStatusPayload {
  return {
    ...status,
    azureKonfiguriert: microsoftAzureIstKonfiguriert(),
    erwartetesKonto: microsoftErwartetesKonto(),
    callbackUrls: [
      "https://frenken-expose-ai.vercel.app/microsoft/callback",
      "http://localhost:8080/microsoft/callback",
    ],
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

export async function completeMicrosoftConnect(input: MicrosoftConnectInput): Promise<MicrosoftStatusPayload> {
  const caller = await requireCaller(input.supabaseAccessToken, true);
  const erwartet = microsoftErwartetesKonto();
  const tokens = await exchangeMicrosoftAuthorizationCode(input);
  const me = await graphMe(tokens.accessToken);
  const konto = kontoAusGraphMe(me);

  if (!konto) {
    throw new Error("Microsoft hat keine Konto-E-Mail zurückgegeben.");
  }
  if (konto !== erwartet) {
    throw new Error(
      `Es wurde „${konto}“ angemeldet, erwartet ist ${erwartet}. Bitte im Microsoft-Dialog genau dieses Konto wählen.`,
    );
  }

  const status = await speichereMicrosoftVerbindung({
    tokens,
    kontoEmail: konto,
    graphUserId: me.id,
    tenantId: microsoftServerTenantId() === "organizations" ? null : microsoftServerTenantId(),
    verbundenVon: caller.userId,
  });
  return statusPayload(status);
}

export async function disconnectMicrosoft(supabaseAccessToken: string): Promise<MicrosoftStatusPayload> {
  await requireCaller(supabaseAccessToken, true);
  const status = await loescheMicrosoftVerbindung();
  return statusPayload(status);
}

export async function probeMicrosoft(supabaseAccessToken: string): Promise<MicrosoftStatusPayload> {
  await requireCaller(supabaseAccessToken, true);
  const row = await leseMicrosoftRow();
  if (!row?.refreshToken && !row?.accessToken) {
    throw new Error("Microsoft ist nicht verbunden.");
  }

  try {
    let access = row.accessToken ?? "";
    const abgelaufen =
      !row.tokenLaeuftAbAm || new Date(row.tokenLaeuftAbAm).getTime() < Date.now() + 60_000;
    if (abgelaufen || !access) {
      if (!row.refreshToken) throw new Error("Kein Refresh Token gespeichert. Bitte erneut verbinden.");
      const neu = await refreshMicrosoftAccessToken(row.refreshToken);
      await aktualisiereMicrosoftTokens(neu);
      access = neu.accessToken;
    }
    const me = await graphMe(access);
    const konto = kontoAusGraphMe(me);
    if (konto && konto !== microsoftErwartetesKonto()) {
      return statusPayload(
        await markiereMicrosoftFehler(`Verbundenes Konto (${konto}) entspricht nicht ${microsoftErwartetesKonto()}.`),
      );
    }
    await markiereMicrosoftPruefungOk();
    return statusPayload(await leseMicrosoftStatus());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Prüfung fehlgeschlagen";
    return statusPayload(await markiereMicrosoftFehler(message));
  }
}
