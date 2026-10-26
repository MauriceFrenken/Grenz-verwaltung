import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/**
 * Mehrmals täglich: die nächsten Investoren per KI-Websuche prüfen (Existenz, Insolvenz,
 * Ankaufsprofil 2026) und die Investorenliste danach neu ableiten. `?anzahl=` überschreibt die Paketgröße.
 */
export const Route = createFileRoute("/api/cron/investoren-pruefung")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const admin = createServiceRoleClient();
          const anzahl = Math.min(30, Number(new URL(request.url).searchParams.get("anzahl")) || 10);
          const { quellenBereinigen } = await import("@/lib/investoren/dubletten");
          const dubletten = await quellenBereinigen(admin);
          const { pruefLauf } = await import("@/lib/investoren/pruefung");
          const ergebnis = await pruefLauf(admin, anzahl);
          const { investorenAufbauen } = await import("@/lib/investoren/aufbau");
          const aufbau = await investorenAufbauen(admin);
          return Response.json({ ok: true, ...ergebnis, dubletten, aufbau });
        } catch (err) {
          console.error("[cron/investoren-pruefung]", err);
          return Response.json(
            { ok: false, fehler: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
