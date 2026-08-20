import {
  graphNachrichtAnhaenge,
  graphPosteingangNachrichten,
  type GraphAnhang,
  type GraphNachricht,
} from "./graph";
import { aktualisiereMicrosoftTokens, leseMicrosoftRow } from "./store";
import { microsoftCallerAusJwt } from "./supabase-admin";
import { acquireMicrosoftAppToken, microsoftPostfach } from "./token-exchange";

/**
 * Gültiges App-only Access Token. Bei Ablauf erneut per Client Credentials —
 * kein Refresh Token.
 */
export async function microsoftAccessToken(): Promise<{ accessToken: string; scopes: string | null }> {
  const row = await leseMicrosoftRow();
  if (row?.status === "getrennt" && !row.accessToken) {
    throw new Error("Microsoft ist nicht verbunden. Bitte unter Einstellungen › Integrationen verbinden.");
  }

  const abgelaufen =
    !row?.tokenLaeuftAbAm || new Date(row.tokenLaeuftAbAm).getTime() < Date.now() + 60_000;

  if (row?.accessToken && !abgelaufen) {
    return { accessToken: row.accessToken, scopes: row.scopes };
  }

  const neu = await acquireMicrosoftAppToken();
  if (row?.status === "verbunden" || row?.accessToken) {
    await aktualisiereMicrosoftTokens(neu);
  }
  return { accessToken: neu.accessToken, scopes: neu.scope };
}

export type PosteingangNachricht = GraphNachricht;
export type PosteingangAnhang = GraphAnhang;

export async function microsoftPosteingangLesen(input: {
  supabaseAccessToken: string;
  anzahl?: number;
  seit?: string;
  nurMitAnhang?: boolean;
}): Promise<{ postfach: string; nachrichten: PosteingangNachricht[] }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const { accessToken } = await microsoftAccessToken();

  const postfach = microsoftPostfach();
  const nachrichten = await graphPosteingangNachrichten(accessToken, postfach, {
    anzahl: input.anzahl,
    seit: input.seit,
    nurMitAnhang: input.nurMitAnhang,
  });
  return { postfach, nachrichten };
}

export async function microsoftAnhaengeLesen(input: {
  supabaseAccessToken: string;
  nachrichtId: string;
}): Promise<{ postfach: string; anhaenge: PosteingangAnhang[] }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  if (!input.nachrichtId?.trim()) {
    throw new Error("nachrichtId ist erforderlich.");
  }
  const { accessToken } = await microsoftAccessToken();

  const postfach = microsoftPostfach();
  const anhaenge = await graphNachrichtAnhaenge(accessToken, postfach, input.nachrichtId.trim());
  return { postfach, anhaenge: anhaenge.filter((a) => !a.istInline) };
}
