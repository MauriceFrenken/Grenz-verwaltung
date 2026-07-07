import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_ROLLE_RANG: Record<string, number> = {
  op_admin: 0,
  administrator: 1,
  manager: 2,
  mitarbeiter: 3,
  leser: 4,
};

function initialenAusName(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return "–";
  if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
  return `${teile[0][0] ?? ""}${teile[teile.length - 1][0] ?? ""}`.toUpperCase();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function rolleRang(
  admin: ReturnType<typeof createClient>,
  rolle: string,
): Promise<number | null> {
  if (rolle === "op_admin") return 0;

  const { data, error } = await admin
    .from("rollen")
    .select("rang")
    .eq("id", rolle)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return SYSTEM_ROLLE_RANG[rolle] ?? null;
    }
    throw error;
  }

  if (data?.rang !== undefined && data?.rang !== null) {
    return Number(data.rang);
  }

  return SYSTEM_ROLLE_RANG[rolle] ?? null;
}

async function darfRolleZuweisen(
  admin: ReturnType<typeof createClient>,
  einladenderRolle: string,
  zielRolle: string,
): Promise<boolean> {
  if (einladenderRolle === "op_admin") return true;
  const einladenderRang = await rolleRang(admin, einladenderRolle);
  const zielRang = await rolleRang(admin, zielRolle);
  if (einladenderRang === null || zielRang === null) return false;
  return zielRang > einladenderRang;
}

async function istGueltigeRolle(
  admin: ReturnType<typeof createClient>,
  rolle: string,
): Promise<boolean> {
  if (SYSTEM_ROLLE_RANG[rolle] !== undefined && rolle !== "op_admin") {
    return true;
  }

  const { data, error } = await admin
    .from("rollen")
    .select("id")
    .eq("id", rolle)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return false;
    }
    throw error;
  }

  return data !== null;
}

type MandantZuweisung = "alle" | "mehrere" | "einzeln";

async function mandantZuweisungFuerRolle(
  admin: ReturnType<typeof createClient>,
  rolle: string,
): Promise<MandantZuweisung> {
  if (rolle === "op_admin") return "alle";

  const { data, error } = await admin
    .from("rollen")
    .select("mandant_zuweisung")
    .eq("id", rolle)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return "alle";
    }
    throw error;
  }

  const zuweisung = data?.mandant_zuweisung;
  if (zuweisung === "mehrere" || zuweisung === "einzeln") return zuweisung;
  return "alle";
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

    const einladenderRolle = user.app_metadata?.rolle ?? "";
    if (!["op_admin", "administrator", "manager"].includes(einladenderRolle)) {
      return json({ error: "Keine Berechtigung zum Einladen von Benutzern" }, 403);
    }

    const body = (await req.json()) as {
      email?: string;
      name?: string;
      stellenbezeichnung?: string;
      rolle?: string;
      mandantZugriff?: "*" | string[];
      redirectTo?: string;
    };

    const email = body.email?.trim().toLowerCase() ?? "";
    const name = body.name?.trim() ?? "";
    const stellenbezeichnung = body.stellenbezeichnung?.trim() ?? "";
    const rolle = body.rolle?.trim() ?? "";
    const redirectTo = body.redirectTo?.trim() ?? "";
    const mandantZugriffRaw = body.mandantZugriff;
    const alleMandanten = mandantZugriffRaw === "*" || mandantZugriffRaw === undefined;
    const mandantIds = alleMandanten
      ? []
      : Array.isArray(mandantZugriffRaw)
        ? [...new Set(mandantZugriffRaw.map((id) => id.trim()).filter(Boolean))]
        : [];

    if (!email || !email.includes("@")) {
      return json({ error: "Bitte eine gültige E-Mail angeben" }, 400);
    }
    if (name.length < 2) {
      return json({ error: "Bitte einen Namen angeben" }, 400);
    }
    if (stellenbezeichnung.length < 1) {
      return json({ error: "Bitte eine Stellenbezeichnung angeben" }, 400);
    }
    if (!redirectTo) {
      return json({ error: "redirectTo fehlt" }, 400);
    }
    if (!alleMandanten && mandantIds.length === 0) {
      return json({ error: "Bitte mindestens einen Mandanten auswählen" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (!(await istGueltigeRolle(admin, rolle))) {
      return json({ error: "Ungültige Rolle" }, 400);
    }
    if (!(await darfRolleZuweisen(admin, einladenderRolle, rolle))) {
      return json({ error: "Diese Rolle darf nicht zugewiesen werden" }, 403);
    }

    const mandantZuweisung = await mandantZuweisungFuerRolle(admin, rolle);

    if (mandantZuweisung !== "alle" && alleMandanten) {
      return json({ error: "Diese Rolle darf keinen Zugriff auf alle Mandanten erhalten" }, 400);
    }
    if (mandantZuweisung === "einzeln" && mandantIds.length !== 1) {
      return json({ error: "Für diese Rolle ist genau ein Mandant erlaubt" }, 400);
    }

    if (!alleMandanten) {
      const { data: mandanten, error: mandantenError } = await admin
        .from("mandanten")
        .select("id")
        .in("id", mandantIds);

      if (mandantenError) {
        return json({ error: mandantenError.message }, 400);
      }

      if ((mandanten ?? []).length !== mandantIds.length) {
        return json({ error: "Ein oder mehrere Mandanten sind ungültig" }, 400);
      }
    }

    const initialen = initialenAusName(name);

    const { data: invited, error: inviteError } = await admin.auth.admin
      .inviteUserByEmail(email, {
        data: { name, stellenbezeichnung, initialen },
        redirectTo,
      });

    if (inviteError) {
      return json({ error: inviteError.message }, 400);
    }

    const userId = invited.user?.id;
    if (!userId) {
      return json({ error: "Einladung konnte nicht erstellt werden" }, 500);
    }

    const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        rolle,
        mandanten: alleMandanten ? "*" : mandantIds,
      },
    });

    if (metaError) {
      return json({ error: metaError.message }, 400);
    }

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        email,
        name,
        initialen,
        rolle,
        stellenbezeichnung,
        alle_mandanten: alleMandanten,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      return json({ error: profileError.message }, 400);
    }

    if (!alleMandanten) {
      const { error: deleteZuordnungError } = await admin
        .from("benutzer_mandanten")
        .delete()
        .eq("benutzer_id", userId);

      if (deleteZuordnungError) {
        return json({ error: deleteZuordnungError.message }, 400);
      }

      const { error: zuordnungError } = await admin.from("benutzer_mandanten").insert(
        mandantIds.map((mandant_id) => ({
          benutzer_id: userId,
          mandant_id,
        })),
      );

      if (zuordnungError) {
        return json({ error: zuordnungError.message }, 400);
      }
    }

    return json({ ok: true, id: userId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return json({ error: message }, 500);
  }
});
