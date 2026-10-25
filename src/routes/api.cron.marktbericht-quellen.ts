import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/**
 * Täglich: eine fällige Quelle nach neuen Marktberichten durchsuchen und offene Berichte auslesen.
 * Ab 1. August bzw. 1. Februar legt der Lauf einmalig den Berichtsentwurf der Periode an.
 */
export const Route = createFileRoute("/api/cron/marktbericht-quellen")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const start = Date.now();
        const admin = createServiceRoleClient();
        try {
          // Entwurf zuerst: meist nur eine kurze Prüfung, zweimal im Jahr ca. 1–2 Minuten.
          const { automatischerEntwurf } =
            await import("@/lib/marktbericht/server-fn");
          const entwurf = await automatischerEntwurf(admin);
          const { quellenLauf } =
            await import("@/lib/marktbericht/quellen-lauf");
          const lauf = await quellenLauf(admin, {
            deadlineMs: start + 280_000,
          });
          return Response.json({ ok: true, ...lauf, entwurf });
        } catch (err) {
          console.error("[cron/marktbericht-quellen]", err);
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
