import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv(name: string): string {
  if (typeof process === "undefined") return "";
  return (process.env[name] ?? "").trim();
}

export function supabaseUrl(): string {
  return readEnv("VITE_SUPABASE_URL") || readEnv("SUPABASE_URL");
}

export function createServiceRoleClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("VITE_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen serverseitig gesetzt sein.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type MicrosoftCaller = {
  userId: string;
  rolle: string;
  darfVerbinden: boolean;
};

/**
 * Server-only Auth für Cron-Jobs (Ablegen ohne User-JWT).
 * Token = `cron:` + CRON_SECRET — nie clientseitig verwenden.
 */
export function microsoftCronAuthToken(): string {
  const secret = readEnv("CRON_SECRET");
  if (!secret) {
    throw new Error("CRON_SECRET fehlt für Cron-Auth.");
  }
  return `cron:${secret}`;
}

function istCronAuthToken(token: string): boolean {
  const secret = readEnv("CRON_SECRET");
  return Boolean(secret) && token === `cron:${secret}`;
}

export async function microsoftCallerAusJwt(accessToken: string): Promise<MicrosoftCaller> {
  const token = accessToken?.trim();
  if (!token) throw new Error("Nicht angemeldet.");

  if (istCronAuthToken(token)) {
    return { userId: "cron", rolle: "system", darfVerbinden: true };
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Sitzung ungültig. Bitte neu anmelden.");
  }

  const metaRolle =
    typeof data.user.app_metadata?.rolle === "string" ? data.user.app_metadata.rolle : "";

  const { data: profil } = await admin
    .from("profiles")
    .select("rolle")
    .eq("id", data.user.id)
    .maybeSingle();

  const rolle = (profil?.rolle as string | undefined) || metaRolle || "";
  return {
    userId: data.user.id,
    rolle,
    darfVerbinden: true,
  };
}
