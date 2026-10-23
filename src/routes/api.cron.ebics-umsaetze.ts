import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/** Täglicher EBICS-Abruf (camt.053) aller bereiten Zugänge von Grenz & Co. */
export const Route = createFileRoute("/api/cron/ebics-umsaetze")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { syncEbicsAlleKonten } = await import("@/lib/ebics/sync");
          const admin = createServiceRoleClient();
          const konten = await syncEbicsAlleKonten(admin);
          return Response.json({ ok: true, ...konten });
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
