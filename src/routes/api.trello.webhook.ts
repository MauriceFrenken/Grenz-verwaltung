import { createHmac, timingSafeEqual } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { trelloAbgleich, webhookAdresse } from "@/lib/aufgaben/trello-abgleich";
import { trelloKonfig } from "@/lib/aufgaben/trello-api";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

/**
 * Trello-Webhook des Aufgabenboards: jede Änderung in Trello löst einen Abgleich aus.
 * Trello prüft die Adresse beim Anlegen per HEAD. Mit TRELLO_API_SECRET wird die Signatur
 * (HMAC-SHA1 über Body + Callback-URL, https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/) geprüft.
 */
function signaturOk(body: string, signatur: string | null): boolean {
  const k = trelloKonfig();
  const adresse = webhookAdresse();
  if (!k?.secret) return true;
  if (!signatur || !adresse) return false;
  const soll = createHmac("sha1", k.secret)
    .update(body + adresse)
    .digest("base64");
  const a = Buffer.from(soll);
  const b = Buffer.from(signatur);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/trello/webhook")({
  server: {
    handlers: {
      HEAD: async () => new Response(null, { status: 200 }),
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }: { request: Request }) => {
        const body = await request.text();
        if (!signaturOk(body, request.headers.get("x-trello-webhook"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const ergebnis = await trelloAbgleich(createServiceRoleClient());
          return Response.json({ ok: true, ...ergebnis });
        } catch (err) {
          console.error("[trello/webhook]", err);
          // 200, damit Trello den Webhook nicht wegen Wiederholungen abschaltet; der Cron gleicht nach.
          return Response.json({ ok: false });
        }
      },
    },
  },
});
