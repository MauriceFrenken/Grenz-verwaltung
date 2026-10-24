import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/** Salesforce → sf_*-Caches. Inkrementell; `?voll=1` holt alles neu. */
export const Route = createFileRoute("/api/cron/salesforce-sync")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { salesforceSyncAusfuehren } = await import("@/lib/sf-sync/sync");
          const voll = new URL(request.url).searchParams.get("voll") === "1";
          const ergebnisse = await salesforceSyncAusfuehren(createServiceRoleClient(), { voll });
          const fehler = ergebnisse.filter((e) => e.fehler);
          return Response.json({ ok: fehler.length === 0, ergebnisse }, { status: fehler.length ? 207 : 200 });
        } catch (err) {
          console.error("[cron/salesforce-sync]", err);
          return Response.json(
            { ok: false, fehler: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
