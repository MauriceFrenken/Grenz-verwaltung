import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";

import { cronSecretOk } from "@/lib/cron-auth";
import {
  dokumentPosteingangNachtlauf,
  NACHTLAUF_MAX_RUNDEN,
} from "@/lib/dokument-postfach/sync";

/**
 * Täglicher Nachtlauf: Dokumente › Postfach listen + KI-Analyse.
 * Vercel Cron ruft GET auf; bei vielen offenen Mails setzt sich der Handler
 * selbst fort (?runde=), damit Function-Timeouts nicht mittendrin abbrechen.
 */
export const Route = createFileRoute("/api/cron/postfach-analyse")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!cronSecretOk(request)) {
          return Response.json({ ok: false }, { status: 401 });
        }

        const url = new URL(request.url);
        const rundeRoh = Number(url.searchParams.get("runde") ?? "0");
        const runde =
          Number.isFinite(rundeRoh) && rundeRoh >= 0
            ? Math.floor(rundeRoh)
            : 0;

        if (runde > NACHTLAUF_MAX_RUNDEN) {
          return Response.json({
            ok: true,
            runde,
            abgebrochen: "max_runden",
          });
        }

        try {
          const ergebnis = await dokumentPosteingangNachtlauf({
            inboxSync: runde === 0,
          });

          // Nur fortsetzen, wenn bewusst noch offene Mails da sind (nicht nach Circuit-Breaker).
          if (ergebnis.fortsetzen && runde < NACHTLAUF_MAX_RUNDEN) {
            const weiter = new URL(request.url);
            weiter.searchParams.set("runde", String(runde + 1));
            const secret = (process.env.CRON_SECRET ?? "").trim();
            waitUntil(
              fetch(weiter.toString(), {
                method: "GET",
                headers: { Authorization: `Bearer ${secret}` },
              })
                .then(async (res) => {
                  if (!res.ok) {
                    console.error(
                      "[cron/postfach-analyse] Fortsetzung HTTP",
                      res.status,
                    );
                  }
                })
                .catch((err) => {
                  console.error(
                    "[cron/postfach-analyse] Fortsetzung fehlgeschlagen",
                    err,
                  );
                }),
            );
          }

          return Response.json({
            ok: !ergebnis.abgebrochen,
            runde,
            ...ergebnis,
          });
        } catch (err) {
          console.error("[cron/postfach-analyse]", err);
          return Response.json(
            {
              ok: false,
              fehler:
                err instanceof Error ? err.message : "Nachtlauf fehlgeschlagen",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
