import { createFileRoute } from "@tanstack/react-router";
import { waitUntil as vercelWaitUntil } from "@vercel/functions";

import { cronSecretOk } from "@/lib/cron-auth";
import {
  dokumentPosteingangNachtlauf,
  NACHTLAUF_DEFAULT_BUDGET_MS,
  NACHTLAUF_MAX_RUNDEN,
  type DokumentPosteingangNachtlaufErgebnis,
} from "@/lib/dokument-postfach/sync";
import { MICROSOFT_PRODUCTION_ORIGIN } from "@/lib/microsoft/config";

type RequestWithWaitUntil = Request & {
  waitUntil?: (promise: Promise<unknown>) => void;
};

/** Nitro (Vercel-Preset) setzt waitUntil am Request; @vercel/functions braucht extra Context. */
function scheduleAfterResponse(
  request: Request,
  promise: Promise<unknown>,
): void {
  const fromReq = (request as RequestWithWaitUntil).waitUntil;
  if (typeof fromReq === "function") {
    fromReq.call(request, promise);
    return;
  }
  vercelWaitUntil(promise);
}

function cronFortsetzungUrl(runde: number): string {
  const base = (
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : MICROSOFT_PRODUCTION_ORIGIN
  ).replace(/\/$/, "");
  const url = new URL("/api/cron/postfach-analyse", base);
  url.searchParams.set("runde", String(runde));
  // Folgerunden antworten sofort (202) und arbeiten via request.waitUntil.
  url.searchParams.set("bg", "1");
  return url.toString();
}

function fortsetzungsHeaders(secret: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  };
  const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
  }
  return headers;
}

async function starteFolgeRunde(runde: number): Promise<void> {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) {
    console.error("[cron/postfach-analyse] Fortsetzung ohne CRON_SECRET");
    return;
  }
  const weiter = cronFortsetzungUrl(runde);
  try {
    const res = await fetch(weiter, {
      method: "GET",
      headers: fortsetzungsHeaders(secret),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        "[cron/postfach-analyse] Fortsetzung HTTP",
        res.status,
        body.slice(0, 200),
      );
      return;
    }
    await res.text().catch(() => undefined);
  } catch (err) {
    console.error("[cron/postfach-analyse] Fortsetzung fehlgeschlagen", err);
  }
}

async function nachtaufLauf(input: {
  inboxSync: boolean;
}): Promise<DokumentPosteingangNachtlaufErgebnis> {
  return dokumentPosteingangNachtlauf({
    inboxSync: input.inboxSync,
    deadlineMs: Date.now() + NACHTLAUF_DEFAULT_BUDGET_MS,
  });
}

function ggfFortsetzen(
  request: Request,
  runde: number,
  ergebnis: DokumentPosteingangNachtlaufErgebnis,
): void {
  if (!ergebnis.fortsetzen) return;
  if (runde >= NACHTLAUF_MAX_RUNDEN) {
    console.error(
      "[cron/postfach-analyse] Noch offen, aber max_runden erreicht",
      ergebnis.offen,
    );
    return;
  }
  scheduleAfterResponse(request, starteFolgeRunde(runde + 1));
}

/**
 * Täglicher Nachtlauf: Dokumente › Postfach listen + KI-Analyse.
 * Pro Invocation Zeitbudget; Rest über bg-Folge-Runden bis leer.
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
        const background = url.searchParams.get("bg") === "1";

        if (runde > NACHTLAUF_MAX_RUNDEN) {
          return Response.json({
            ok: true,
            runde,
            abgebrochen: "max_runden",
          });
        }

        // Folge-Runde: 202 sofort, Analyse über Request.waitUntil (Nitro/Vercel).
        if (background) {
          scheduleAfterResponse(
            request,
            (async () => {
              try {
                const ergebnis = await nachtaufLauf({ inboxSync: false });
                ggfFortsetzen(request, runde, ergebnis);
                console.info("[cron/postfach-analyse] bg-runde fertig", {
                  runde,
                  analysiert: ergebnis.analysiert,
                  fehlgeschlagen: ergebnis.fehlgeschlagen,
                  offen: ergebnis.offen,
                  fortsetzen: ergebnis.fortsetzen,
                });
              } catch (err) {
                console.error("[cron/postfach-analyse] bg-runde", err);
              }
            })(),
          );
          return Response.json(
            { ok: true, accepted: true, runde, background: true },
            { status: 202 },
          );
        }

        const gestartet = Date.now();
        try {
          const ergebnis = await nachtaufLauf({ inboxSync: runde === 0 });
          ggfFortsetzen(request, runde, ergebnis);

          return Response.json({
            ok: !ergebnis.abgebrochen,
            runde,
            dauerMs: Date.now() - gestartet,
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
