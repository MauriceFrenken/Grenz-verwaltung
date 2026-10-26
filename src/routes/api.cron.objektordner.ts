import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/** Täglich: Objektordner der offenen Mandate suchen und fehlende Steckbriefe erstellen. */
export const Route = createFileRoute("/api/cron/objektordner")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { objektordnerAbgleich } =
            await import("@/lib/mandate/ordner-abgleich");
          const ergebnis = await objektordnerAbgleich(
            createServiceRoleClient(),
          );
          console.log("[cron/objektordner]", JSON.stringify(ergebnis));
          return Response.json({ ok: true, ...ergebnis });
        } catch (err) {
          console.error("[cron/objektordner]", err);
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
