import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/** Rückfallebene zum Webhook: Aufgabenboard und Trello abgleichen, Webhook prüfen. */
export const Route = createFileRoute("/api/cron/trello-abgleich")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { trelloAbgleich } =
            await import("@/lib/aufgaben/trello-abgleich");
          const ergebnis = await trelloAbgleich(createServiceRoleClient(), {
            webhookPruefen: true,
          });
          return Response.json({
            ok: true,
            eingerichtet: ergebnis !== null,
            ...ergebnis,
          });
        } catch (err) {
          console.error("[cron/trello-abgleich]", err);
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
