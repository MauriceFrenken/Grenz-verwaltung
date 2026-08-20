import { MICROSOFT_INTEGRATION_ID } from "./config";
import { createServiceRoleClient } from "./supabase-admin";
import type { MicrosoftTokenSet } from "./token-exchange";

export type MicrosoftIntegrationStatus = {
  id: typeof MICROSOFT_INTEGRATION_ID;
  status: "verbunden" | "getrennt" | "fehler";
  kontoEmail: string | null;
  tenantId: string | null;
  scopes: string | null;
  verbundenAm: string | null;
  letztePruefungAm: string | null;
  letzterFehler: string | null;
};

export type MicrosoftIntegrationRow = MicrosoftIntegrationStatus & {
  accessToken: string | null;
  refreshToken: string | null;
  tokenLaeuftAbAm: string | null;
  graphUserId: string | null;
};

type DbRow = {
  id: string;
  status: MicrosoftIntegrationStatus["status"];
  konto_email: string | null;
  tenant_id: string | null;
  graph_user_id: string | null;
  scopes: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_laeuft_ab_am: string | null;
  verbunden_am: string | null;
  letzte_pruefung_am: string | null;
  letzter_fehler: string | null;
};

function mapStatus(row: DbRow | null): MicrosoftIntegrationStatus {
  return {
    id: MICROSOFT_INTEGRATION_ID,
    status: row?.status ?? "getrennt",
    kontoEmail: row?.konto_email ?? null,
    tenantId: row?.tenant_id ?? null,
    scopes: row?.scopes ?? null,
    verbundenAm: row?.verbunden_am ?? null,
    letztePruefungAm: row?.letzte_pruefung_am ?? null,
    letzterFehler: row?.letzter_fehler ?? null,
  };
}

function mapRow(row: DbRow): MicrosoftIntegrationRow {
  return {
    ...mapStatus(row),
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenLaeuftAbAm: row.token_laeuft_ab_am,
    graphUserId: row.graph_user_id,
  };
}

export async function leseMicrosoftStatus(): Promise<MicrosoftIntegrationStatus> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("app_integrationen")
    .select(
      "id, status, konto_email, tenant_id, graph_user_id, scopes, access_token, refresh_token, token_laeuft_ab_am, verbunden_am, letzte_pruefung_am, letzter_fehler",
    )
    .eq("id", MICROSOFT_INTEGRATION_ID)
    .maybeSingle();

  if (error) throw error;
  return mapStatus(data as DbRow | null);
}

export async function leseMicrosoftRow(): Promise<MicrosoftIntegrationRow | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("app_integrationen")
    .select(
      "id, status, konto_email, tenant_id, graph_user_id, scopes, access_token, refresh_token, token_laeuft_ab_am, verbunden_am, letzte_pruefung_am, letzter_fehler",
    )
    .eq("id", MICROSOFT_INTEGRATION_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRow(data as DbRow);
}

export async function speichereMicrosoftVerbindung(input: {
  tokens: MicrosoftTokenSet;
  kontoEmail: string;
  graphUserId: string | null;
  tenantId: string | null;
  verbundenVon: string;
}): Promise<MicrosoftIntegrationStatus> {
  const admin = createServiceRoleClient();
  const laeuftAb = new Date(Date.now() + Math.max(60, input.tokens.expiresIn - 60) * 1000).toISOString();
  const jetzt = new Date().toISOString();

  const { data, error } = await admin
    .from("app_integrationen")
    .upsert(
      {
        id: MICROSOFT_INTEGRATION_ID,
        status: "verbunden",
        konto_email: input.kontoEmail,
        tenant_id: input.tenantId,
        graph_user_id: input.graphUserId,
        scopes: input.tokens.scope,
        access_token: input.tokens.accessToken,
        refresh_token: input.tokens.refreshToken,
        token_laeuft_ab_am: laeuftAb,
        verbunden_am: jetzt,
        verbunden_von: input.verbundenVon,
        letzte_pruefung_am: jetzt,
        letzter_fehler: null,
      },
      { onConflict: "id" },
    )
    .select(
      "id, status, konto_email, tenant_id, graph_user_id, scopes, access_token, refresh_token, token_laeuft_ab_am, verbunden_am, letzte_pruefung_am, letzter_fehler",
    )
    .single();

  if (error) throw error;
  return mapStatus(data as DbRow);
}

export async function aktualisiereMicrosoftTokens(tokens: MicrosoftTokenSet): Promise<void> {
  const admin = createServiceRoleClient();
  const laeuftAb = new Date(Date.now() + Math.max(60, tokens.expiresIn - 60) * 1000).toISOString();
  const { error } = await admin
    .from("app_integrationen")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_laeuft_ab_am: laeuftAb,
      scopes: tokens.scope,
      status: "verbunden",
      letzter_fehler: null,
    })
    .eq("id", MICROSOFT_INTEGRATION_ID);
  if (error) throw error;
}

export async function markiereMicrosoftFehler(message: string): Promise<MicrosoftIntegrationStatus> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("app_integrationen")
    .update({
      status: "fehler",
      letzter_fehler: message,
      letzte_pruefung_am: new Date().toISOString(),
    })
    .eq("id", MICROSOFT_INTEGRATION_ID)
    .select(
      "id, status, konto_email, tenant_id, graph_user_id, scopes, access_token, refresh_token, token_laeuft_ab_am, verbunden_am, letzte_pruefung_am, letzter_fehler",
    )
    .single();
  if (error) throw error;
  return mapStatus(data as DbRow);
}

export async function markiereMicrosoftPruefungOk(): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("app_integrationen")
    .update({
      letzte_pruefung_am: new Date().toISOString(),
      letzter_fehler: null,
      status: "verbunden",
    })
    .eq("id", MICROSOFT_INTEGRATION_ID);
  if (error) throw error;
}

export async function loescheMicrosoftVerbindung(): Promise<MicrosoftIntegrationStatus> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("app_integrationen")
    .update({
      status: "getrennt",
      konto_email: null,
      tenant_id: null,
      graph_user_id: null,
      scopes: null,
      access_token: null,
      refresh_token: null,
      token_laeuft_ab_am: null,
      verbunden_am: null,
      verbunden_von: null,
      letzte_pruefung_am: null,
      letzter_fehler: null,
    })
    .eq("id", MICROSOFT_INTEGRATION_ID)
    .select(
      "id, status, konto_email, tenant_id, graph_user_id, scopes, access_token, refresh_token, token_laeuft_ab_am, verbunden_am, letzte_pruefung_am, letzter_fehler",
    )
    .single();
  if (error) throw error;
  return mapStatus(data as DbRow);
}
