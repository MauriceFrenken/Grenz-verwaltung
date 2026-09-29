import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";
import { syncEbicsOffeneLaeufe } from "@/lib/ebics/sync";

export const Route = createFileRoute("/api/cron/ebics-umsaetze")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const admin = createServiceRoleClient();
          const ergebnis = await syncEbicsOffeneLaeufe(admin);
          return Response.json({
            ok: true,
            ...ergebnis,
          });
        } catch (err) {
          console.error("[cron/ebics-umsaetze]", err);
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
