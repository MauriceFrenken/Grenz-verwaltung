import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/**
 * Zweimal pro Woche: neue, 2025/2026 aktive Investoren per KI-Websuche finden (ein Suchfeld
 * je Lauf im Wechsel, `?feld=` wählt eines). Neue Firmen landen als offene Listeneinträge.
 */
export const Route = createFileRoute("/api/cron/investoren-entdeckung")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const admin = createServiceRoleClient();
          const feld = new URL(request.url).searchParams.get("feld");
          const { entdeckungLauf } = await import("@/lib/investoren/entdeckung");
          const ergebnis = await entdeckungLauf(admin, feld ? Number(feld) : undefined);
          return Response.json({ ok: true, ...ergebnis });
        } catch (err) {
          console.error("[cron/investoren-entdeckung]", err);
          return Response.json(
            { ok: false, fehler: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
