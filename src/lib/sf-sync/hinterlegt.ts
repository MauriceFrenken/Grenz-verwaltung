/**
 * Hinterlegte Salesforce-Verbindung für den automatischen Abruf: Ein Administrator meldet sich
 * einmal an, der Refresh Token liegt danach in Supabase Vault (app_integrationen, id "salesforce").
 * Sync per Cron und beim Öffnen der App holt sich damit selbst einen Access Token.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshSalesforceAccessToken } from "@/lib/salesforce/token-exchange";

export const SALESFORCE_INTEGRATION_ID = "salesforce";

export type HinterlegteVerbindung = {
  status: "verbunden" | "getrennt" | "fehler";
  kontoEmail: string | null;
  verbundenAm: string | null;
  letztePruefungAm: string | null;
  letzterFehler: string | null;
};

type Zeile = {
  status: HinterlegteVerbindung["status"];
  konto_email: string | null;
  token_secret_id: string | null;
  verbunden_am: string | null;
  letzte_pruefung_am: string | null;
  letzter_fehler: string | null;
};

const SPALTEN =
  "status, konto_email, token_secret_id, verbunden_am, letzte_pruefung_am, letzter_fehler";

async function zeileLesen(admin: SupabaseClient): Promise<Zeile | null> {
  const { data, error } = await admin
    .from("app_integrationen")
    .select(SPALTEN)
    .eq("id", SALESFORCE_INTEGRATION_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Zeile | null) ?? null;
}

export async function hinterlegteVerbindungLesen(
  admin: SupabaseClient,
): Promise<HinterlegteVerbindung> {
  const z = await zeileLesen(admin);
  return {
    status: z?.token_secret_id ? (z.status ?? "verbunden") : "getrennt",
    kontoEmail: z?.konto_email ?? null,
    verbundenAm: z?.verbunden_am ?? null,
    letztePruefungAm: z?.letzte_pruefung_am ?? null,
    letzterFehler: z?.letzter_fehler ?? null,
  };
}

async function tokensSpeichern(
  admin: SupabaseClient,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const { error } = await admin.rpc("integration_token_speichern", {
    p_id: SALESFORCE_INTEGRATION_ID,
    p_access_token: accessToken,
    p_refresh_token: refreshToken,
  });
  if (error) throw new Error(error.message);
}

async function kontoEmail(
  accessToken: string,
  instanceUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const info = (await res.json()) as {
      email?: string;
      preferred_username?: string;
    };
    return info.email ?? info.preferred_username ?? null;
  } catch {
    return null;
  }
}

/**
 * Übernimmt den Refresh Token einer Salesforce-Anmeldung. Er wird vorher eingelöst, damit nur
 * ein nachweislich gültiger Zugang hinterlegt wird.
 */
export async function verbindungHinterlegen(
  admin: SupabaseClient,
  refreshToken: string,
  verbundenVon: string | null,
): Promise<HinterlegteVerbindung> {
  if (!refreshToken.trim()) {
    throw new Error(
      "Die Salesforce-Anmeldung liefert keinen Refresh Token. Bitte erneut verbinden.",
    );
  }
  const erneuert = await refreshSalesforceAccessToken(refreshToken);
  const jetzt = new Date().toISOString();
  const { error } = await admin.from("app_integrationen").upsert(
    {
      id: SALESFORCE_INTEGRATION_ID,
      status: "verbunden",
      konto_email: await kontoEmail(erneuert.accessToken, erneuert.instanceUrl),
      verbunden_am: jetzt,
      verbunden_von: verbundenVon,
      letzte_pruefung_am: jetzt,
      letzter_fehler: null,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
  await tokensSpeichern(
    admin,
    erneuert.accessToken,
    erneuert.refreshToken ?? refreshToken,
  );
  return hinterlegteVerbindungLesen(admin);
}

export async function verbindungEntfernen(
  admin: SupabaseClient,
): Promise<void> {
  const { error: tokenFehler } = await admin.rpc("integration_token_loeschen", {
    p_id: SALESFORCE_INTEGRATION_ID,
  });
  if (tokenFehler) throw new Error(tokenFehler.message);
  const { error } = await admin
    .from("app_integrationen")
    .update({
      status: "getrennt",
      konto_email: null,
      verbunden_am: null,
      verbunden_von: null,
      letzter_fehler: null,
    })
    .eq("id", SALESFORCE_INTEGRATION_ID);
  if (error) throw new Error(error.message);
}

/** Frischer Access Token aus der hinterlegten Verbindung, oder null, wenn keine hinterlegt ist. */
export async function hinterlegtenZugangHolen(
  admin: SupabaseClient,
): Promise<{ accessToken: string; instanceUrl: string } | null> {
  const z = await zeileLesen(admin);
  if (!z?.token_secret_id) return null;

  const { data, error } = await admin.rpc("integration_token_lesen", {
    p_id: SALESFORCE_INTEGRATION_ID,
  });
  if (error) throw new Error(error.message);
  const refreshToken =
    ((data ?? []) as { refresh_token: string | null }[])[0]?.refresh_token ??
    "";
  if (!refreshToken) return null;

  try {
    const erneuert = await refreshSalesforceAccessToken(refreshToken);
    await tokensSpeichern(
      admin,
      erneuert.accessToken,
      erneuert.refreshToken ?? refreshToken,
    );
    await admin
      .from("app_integrationen")
      .update({
        status: "verbunden",
        letzte_pruefung_am: new Date().toISOString(),
        letzter_fehler: null,
      })
      .eq("id", SALESFORCE_INTEGRATION_ID);
    return {
      accessToken: erneuert.accessToken,
      instanceUrl: erneuert.instanceUrl,
    };
  } catch (err) {
    const meldung = err instanceof Error ? err.message : String(err);
    await admin
      .from("app_integrationen")
      .update({
        status: "fehler",
        letzte_pruefung_am: new Date().toISOString(),
        letzter_fehler: `Hinterlegte Salesforce-Verbindung abgelehnt: ${meldung}. Bitte in Einstellungen › Integrationen neu verbinden.`,
      })
      .eq("id", SALESFORCE_INTEGRATION_ID);
    throw new Error(
      "Die hinterlegte Salesforce-Verbindung ist nicht mehr gültig. Bitte in Einstellungen › Integrationen neu verbinden.",
    );
  }
}
