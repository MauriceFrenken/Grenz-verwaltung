import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { BENUTZER_VERWALTER_ROLLEN, darfBenutzerVerwalten } from "../_shared/benutzer.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Methode nicht erlaubt" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Nicht angemeldet" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Serverkonfiguration unvollständig" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Nicht angemeldet" }, 401);
    }

    const bearbeiterRolle = user.app_metadata?.rolle ?? "";
    if (!BENUTZER_VERWALTER_ROLLEN.includes(bearbeiterRolle)) {
      return json({ error: "Keine Berechtigung zum Löschen von Benutzern" }, 403);
    }

    const body = (await req.json()) as { id?: string };
    const userId = body.id?.trim() ?? "";

    if (!userId) {
      return json({ error: "Benutzer-ID fehlt" }, 400);
    }

    if (userId === user.id) {
      return json({ error: "Sie können Ihr eigenes Konto nicht löschen" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: zielProfil, error: profilError } = await admin
      .from("profiles")
      .select("id, rolle")
      .eq("id", userId)
      .maybeSingle();

    if (profilError) {
      return json({ error: profilError.message }, 400);
    }
    if (!zielProfil) {
      return json({ error: "Benutzer nicht gefunden" }, 404);
    }

    const zielRolle = String(zielProfil.rolle ?? "");
    if (!(await darfBenutzerVerwalten(admin, bearbeiterRolle, zielRolle))) {
      return json({ error: "Dieser Benutzer darf nicht gelöscht werden" }, 403);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json({ error: deleteError.message }, 400);
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return json({ error: message }, 500);
  }
});
