import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import {
  SALESFORCE_OAUTH_MESSAGE,
  salesforceCallbackUrl,
  salesforceSessionSpeichern,
} from "@/lib/salesforce/config";
import { enrichSalesforceSession } from "@/lib/salesforce/api";
import {
  exchangeSalesforceCodeClient,
  istErlaubteOauthHerkunft,
  pkceLesen,
  pkceLoeschen,
  readOauthStateOrigin,
  type SalesforceOauthPayload,
} from "@/lib/salesforce/oauth";

export const Route = createFileRoute("/salesforce/callback")({
  head: () => ({
    meta: [{ title: "Salesforce — Grenz & Co." }],
  }),
  component: SalesforceCallbackPage,
});

/**
 * Zielfenster ist die App, die den Login gestartet hat. Sie kann auf einer
 * anderen Domain laufen als diese Callback-Seite (Salesforce erlaubt nur eine
 * feste Callback-URL), deshalb steckt die Herkunft im OAuth-State.
 */
function openerOrigin(state: string | null): string | null {
  const ausState = state ? readOauthStateOrigin(state) : null;
  if (ausState && istErlaubteOauthHerkunft(ausState)) return ausState;
  return window.location.origin;
}

function postToOpener(
  payload: SalesforceOauthPayload,
  targetOrigin: string | null,
): boolean {
  if (!window.opener || window.opener.closed || !targetOrigin) return false;
  window.opener.postMessage(payload, targetOrigin);
  return true;
}

function SalesforceCallbackPage() {
  const [meldung, setMeldung] = useState(
    "Salesforce-Anmeldung wird abgeschlossen…",
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      const errorDescription = params.get("error_description");
      const ziel = openerOrigin(state);

      const fail = (message: string) => {
        if (cancelled) return;
        postToOpener(
          {
            type: SALESFORCE_OAUTH_MESSAGE,
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
        fail("Keine Autorisierungsantwort von Salesforce empfangen.");
        return;
      }

      // Regelfall: Das Ausgangsfenster hält den Code Verifier und tauscht den
      // Code selbst ein — unabhängig davon, auf welcher Domain es läuft.
      const relayed = postToOpener(
        { type: SALESFORCE_OAUTH_MESSAGE, ok: true, code, state },
        ziel,
      );
      if (relayed) {
        if (cancelled) return;
        setMeldung(
          "Anmeldung erfolgreich. Dieses Fenster schließt sich automatisch.",
        );
        window.setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
        }, 500);
        return;
      }

      // Kein Opener (Popup blockiert, Login im selben Tab): hier abschließen.
      const codeVerifier = pkceLesen(state);
      if (!codeVerifier) {
        setMeldung(
          "Die Anmeldung wurde in einem anderen Fenster gestartet und kann hier nicht abgeschlossen werden. Bitte in der App erneut auf „Mit Salesforce verbinden“ klicken.",
        );
        return;
      }

      try {
        const tokens = await exchangeSalesforceCodeClient({
          code,
          codeVerifier,
          redirectUri: salesforceCallbackUrl(),
        });

        pkceLoeschen(state);

        const jetzt = new Date().toISOString();
        const session = await enrichSalesforceSession({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          instanceUrl: tokens.instanceUrl,
          gespeichertAm: jetzt,
          aktualisiertAm: jetzt,
        });
        salesforceSessionSpeichern(session);
        window.history.replaceState(null, "", window.location.pathname);

        if (cancelled) return;
        setMeldung(
          "Anmeldung erfolgreich. Sie können dieses Fenster schließen und zur App zurückkehren.",
        );
      } catch (e) {
        pkceLoeschen(state);
        setMeldung(
          e instanceof Error ? e.message : "Token-Austausch fehlgeschlagen",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-heading">Salesforce</h1>
        <p className="mt-2 text-sm text-text-muted">{meldung}</p>
      </div>
    </div>
  );
}
