import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  BENUTZER_VERWALTER_ROLLEN,
  benutzerGesellschaftenSpeichern,
  darfBenutzerVerwalten,
  darfRolleZuweisen,
  initialenAusName,
  istGueltigeRolle,
  gesellschaftZugriffValidieren,
} from "../_shared/benutzer.ts";

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
      return json({ error: "Keine Berechtigung zum Bearbeiten von Benutzern" }, 403);
    }

    const body = (await req.json()) as {
      id?: string;
      name?: string;
      stellenbezeichnung?: string;
      rolle?: string;
      gesellschaftZugriff?: "*" | string[];
    };

    const userId = body.id?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    const stellenbezeichnung = body.stellenbezeichnung?.trim() ?? "";
    const rolle = body.rolle?.trim() ?? "";
    const gesellschaftZugriffRaw = body.gesellschaftZugriff;
    const alleGesellschaften = gesellschaftZugriffRaw === "*" || gesellschaftZugriffRaw === undefined;
    const gesellschaftIds = alleGesellschaften
      ? []
      : Array.isArray(gesellschaftZugriffRaw)
        ? [...new Set(gesellschaftZugriffRaw.map((id) => id.trim()).filter(Boolean))]
        : [];

    if (!userId) {
      return json({ error: "Benutzer-ID fehlt" }, 400);
    }
    if (name.length < 2) {
      return json({ error: "Bitte einen Namen angeben" }, 400);
    }
    if (stellenbezeichnung.length < 1) {
      return json({ error: "Bitte eine Stellenbezeichnung angeben" }, 400);
    }
    if (!alleGesellschaften && gesellschaftIds.length === 0) {
      return json({ error: "Bitte mindestens eine Gesellschaft auswählen" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: zielProfil, error: profilError } = await admin
      .from("profiles")
      .select("id, rolle, email")
      .eq("id", userId)
      .maybeSingle();

    if (profilError) {
      return json({ error: profilError.message }, 400);
    }
    if (!zielProfil) {
      return json({ error: "Benutzer nicht gefunden" }, 404);
    }

    const bisherigeRolle = String(zielProfil.rolle ?? "");
    if (!(await darfBenutzerVerwalten(admin, bearbeiterRolle, bisherigeRolle))) {
      return json({ error: "Dieser Benutzer darf nicht bearbeitet werden" }, 403);
    }

    if (!(await istGueltigeRolle(admin, rolle))) {
      return json({ error: "Ungültige Rolle" }, 400);
    }
    if (!(await darfRolleZuweisen(admin, bearbeiterRolle, rolle))) {
      return json({ error: "Diese Rolle darf nicht zugewiesen werden" }, 403);
    }

    const gesellschaftFehler = await gesellschaftZugriffValidieren(admin, rolle, alleGesellschaften, gesellschaftIds);
    if (gesellschaftFehler) {
      return json({ error: gesellschaftFehler }, 400);
    }

    const initialen = initialenAusName(name);

    const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { name, stellenbezeichnung, initialen },
      app_metadata: {
        rolle,
        gesellschaften: alleGesellschaften ? "*" : gesellschaftIds,
      },
    });

    if (metaError) {
      return json({ error: metaError.message }, 400);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        name,
        initialen,
        rolle,
        stellenbezeichnung,
        alle_gesellschaften: alleGesellschaften,
      })
      .eq("id", userId);

    if (profileError) {
      return json({ error: profileError.message }, 400);
    }

    const gesellschaftenFehler = await benutzerGesellschaftenSpeichern(
      admin,
      userId,
      alleGesellschaften,
      gesellschaftIds,
    );
    if (gesellschaftenFehler) {
      return json({ error: gesellschaftenFehler }, 400);
    }

    return json({ ok: true, id: userId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return json({ error: message }, 500);
  }
});
