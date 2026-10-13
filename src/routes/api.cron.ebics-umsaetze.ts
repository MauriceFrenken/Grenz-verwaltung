import { createFileRoute } from "@tanstack/react-router";

import { cronSecretOk } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

export const Route = createFileRoute("/api/cron/ebics-umsaetze")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { syncEbicsAlleKonten, syncEbicsOffeneLaeufe } =
            await import("@/lib/ebics/sync");
          const admin = createServiceRoleClient();
          // 1. Alle Konten täglich, unabhängig von Sollstellungs-Läufen
          const konten = await syncEbicsAlleKonten(admin);
          // 2. Offene Läufe wie bisher: Abruf in den Lauf und Mietabgleich
          const ergebnis = await syncEbicsOffeneLaeufe(admin);
          // 3. Mietkonten fortschreiben (Soll des Monats, neue Zahlungen zuordnen)
          let mieten: unknown = null;
          try {
            const { data, error } = await admin.rpc("mieten_aktualisieren");
            mieten = error ? { fehler: error.message } : data;
          } catch (err) {
            mieten = {
              fehler: err instanceof Error ? err.message : String(err),
            };
          }
          return Response.json({
            ok: true,
            konten,
            mieten,
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
