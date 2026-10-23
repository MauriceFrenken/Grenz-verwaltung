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

/** Tokens liegen in Supabase Vault (token_secret_id), nie im Klartext in der Tabelle. */
const SPALTEN =
  "id, status, konto_email, tenant_id, graph_user_id, scopes, token_secret_id, token_laeuft_ab_am, verbunden_am, letzte_pruefung_am, letzter_fehler";

type DbRow = {
  id: string;
  status: MicrosoftIntegrationStatus["status"];
  konto_email: string | null;
  tenant_id: string | null;
  graph_user_id: string | null;
  scopes: string | null;
  token_secret_id: string | null;
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

type Admin = ReturnType<typeof createServiceRoleClient>;

async function leseTokens(
  admin: Admin,
): Promise<{ access_token: string | null; refresh_token: string | null } | null> {
  const { data, error } = await admin.rpc("integration_token_lesen", { p_id: MICROSOFT_INTEGRATION_ID });
  if (error) throw error;
  const zeilen = (data ?? []) as { access_token: string | null; refresh_token: string | null }[];
  return zeilen[0] ?? null;
}

async function speichereTokens(admin: Admin, tokens: MicrosoftTokenSet): Promise<void> {
  const { error } = await admin.rpc("integration_token_speichern", {
    p_id: MICROSOFT_INTEGRATION_ID,
    p_access_token: tokens.accessToken,
    p_refresh_token: tokens.refreshToken,
  });
  if (error) throw error;
}

function mapRow(
  row: DbRow,
  tokens: { access_token: string | null; refresh_token: string | null } | null,
): MicrosoftIntegrationRow {
  return {
    ...mapStatus(row),
    accessToken: tokens?.access_token ?? null,
    refreshToken: tokens?.refresh_token ?? null,
    tokenLaeuftAbAm: row.token_laeuft_ab_am,
    graphUserId: row.graph_user_id,
  };
}

export async function leseMicrosoftStatus(): Promise<MicrosoftIntegrationStatus> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("app_integrationen")
    .select(SPALTEN)
    .eq("id", MICROSOFT_INTEGRATION_ID)
    .maybeSingle();

  if (error) throw error;
  return mapStatus(data as DbRow | null);
}

export async function leseMicrosoftRow(): Promise<MicrosoftIntegrationRow | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("app_integrationen")
    .select(SPALTEN)
    .eq("id", MICROSOFT_INTEGRATION_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as DbRow;
  return mapRow(row, row.token_secret_id ? await leseTokens(admin) : null);
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
        token_laeuft_ab_am: laeuftAb,
        verbunden_am: jetzt,
        verbunden_von: input.verbundenVon,
        letzte_pruefung_am: jetzt,
        letzter_fehler: null,
      },
      { onConflict: "id" },
    )
    .select(SPALTEN)
    .single();

  if (error) throw error;
  await speichereTokens(admin, input.tokens);
  return mapStatus(data as DbRow);
}

export async function aktualisiereMicrosoftTokens(tokens: MicrosoftTokenSet): Promise<void> {
  const admin = createServiceRoleClient();
  const laeuftAb = new Date(Date.now() + Math.max(60, tokens.expiresIn - 60) * 1000).toISOString();
  const { error } = await admin
    .from("app_integrationen")
    .update({
      token_laeuft_ab_am: laeuftAb,
      scopes: tokens.scope,
      status: "verbunden",
      letzter_fehler: null,
    })
    .eq("id", MICROSOFT_INTEGRATION_ID);
  if (error) throw error;
  await speichereTokens(admin, tokens);
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
    .select(SPALTEN)
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
  const { error: tokenFehler } = await admin.rpc("integration_token_loeschen", { p_id: MICROSOFT_INTEGRATION_ID });
  if (tokenFehler) throw tokenFehler;
  const { data, error } = await admin
    .from("app_integrationen")
    .update({
      status: "getrennt",
      konto_email: null,
      tenant_id: null,
      graph_user_id: null,
      scopes: null,
      token_laeuft_ab_am: null,
      verbunden_am: null,
      verbunden_von: null,
      letzte_pruefung_am: null,
      letzter_fehler: null,
    })
    .eq("id", MICROSOFT_INTEGRATION_ID)
    .select(SPALTEN)
    .single();
  if (error) throw error;
  return mapStatus(data as DbRow);
}
