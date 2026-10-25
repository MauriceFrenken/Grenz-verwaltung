import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/** Täglich: Immobiliennews nach aktiven Käufern und möglichen Verkäufern durchsuchen. */
export const Route = createFileRoute("/api/cron/markt-radar")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { marktRadarAusfuehren } =
            await import("@/lib/markt-radar/lauf");
          const ergebnis = await marktRadarAusfuehren(
            createServiceRoleClient(),
            "cron",
          );
          return Response.json({ ok: true, ...ergebnis });
        } catch (err) {
          console.error("[cron/markt-radar]", err);
          return Response.json(
            {
              ok: false,
              fehler: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
