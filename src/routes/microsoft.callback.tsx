import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { MICROSOFT_OAUTH_MESSAGE } from "@/lib/microsoft/config";
import {
  istErlaubteOauthHerkunft,
  readOauthStateOrigin,
  type MicrosoftOauthPayload,
} from "@/lib/microsoft/oauth";

export const Route = createFileRoute("/microsoft/callback")({
  head: () => ({
    meta: [{ title: "Microsoft — FRENKEN Verwaltung" }],
  }),
  component: MicrosoftCallbackPage,
});

function openerOrigin(state: string | null): string | null {
  const ausState = state ? readOauthStateOrigin(state) : null;
  if (ausState && istErlaubteOauthHerkunft(ausState)) return ausState;
  return window.location.origin;
}

function postToOpener(payload: MicrosoftOauthPayload, targetOrigin: string | null): boolean {
  if (!window.opener || window.opener.closed || !targetOrigin) return false;
  window.opener.postMessage(payload, targetOrigin);
  return true;
}

function MicrosoftCallbackPage() {
  const [meldung, setMeldung] = useState("Microsoft-Anmeldung wird abgeschlossen…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDescription = params.get("error_description");
    const ziel = openerOrigin(state);

    const fail = (message: string) => {
      postToOpener(
        {
          type: MICROSOFT_OAUTH_MESSAGE,
          ok: false,
          error: message,
          state: state ?? undefined,
        },
        ziel,
      );
      setMeldung(message);
    };

    if (error) {
      fail(errorDescription || error);
      return;
    }

    if (!code || !state) {
      fail("Keine Autorisierungsantwort von Microsoft empfangen.");
      return;
    }

    const relayed = postToOpener(
      { type: MICROSOFT_OAUTH_MESSAGE, ok: true, code, state },
      ziel,
    );
    if (relayed) {
      setMeldung("Anmeldung erfolgreich. Dieses Fenster schließt sich automatisch.");
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
      }, 500);
      return;
    }

    setMeldung(
      "Die Anmeldung wurde in einem anderen Fenster gestartet. Bitte in der App erneut auf „Verbinden“ klicken.",
    );
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-heading">Microsoft 365</h1>
        <p className="mt-2 text-sm text-text-muted">{meldung}</p>
      </div>
    </div>
  );
}
