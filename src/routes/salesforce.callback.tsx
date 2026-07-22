import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import {
  SALESFORCE_OAUTH_MESSAGE,
  salesforceCallbackUrl,
  salesforceSessionSpeichern,
  type SalesforceSession,
} from "@/lib/salesforce/config";
import { enrichSalesforceSession } from "@/lib/salesforce/api";
import {
  exchangeSalesforceCodeClient,
  pkceLesen,
  pkceLoeschen,
  type SalesforceOauthPayload,
} from "@/lib/salesforce/oauth";

export const Route = createFileRoute("/salesforce/callback")({
  head: () => ({
    meta: [{ title: "Salesforce — FRENKEN Verwaltung" }],
  }),
  component: SalesforceCallbackPage,
});

function postToOpener(payload: SalesforceOauthPayload) {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(payload, window.location.origin);
  }
}

function SalesforceCallbackPage() {
  const [meldung, setMeldung] = useState("Salesforce-Anmeldung wird abgeschlossen…");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      const errorDescription = params.get("error_description");

      const fail = (message: string) => {
        if (cancelled) return;
        postToOpener({ type: SALESFORCE_OAUTH_MESSAGE, ok: false, error: message });
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

      const codeVerifier = pkceLesen(state);
      if (!codeVerifier) {
        fail("Login-Sitzung abgelaufen. Bitte erneut in der App starten.");
        return;
      }

      try {
        const tokens = await exchangeSalesforceCodeClient({
          code,
          codeVerifier,
          redirectUri: salesforceCallbackUrl(),
        });

        pkceLoeschen(state);

        const sessionRoh: SalesforceSession = {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          instanceUrl: tokens.instanceUrl,
          gespeichertAm: new Date().toISOString(),
        };
        const session = await enrichSalesforceSession(sessionRoh);
        salesforceSessionSpeichern(session);
        window.history.replaceState(null, "", window.location.pathname);

        if (cancelled) return;

        postToOpener({ type: SALESFORCE_OAUTH_MESSAGE, ok: true, session });
        setMeldung("Anmeldung erfolgreich. Dieses Fenster schließt sich automatisch.");
        window.setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
        }, 500);
      } catch (e) {
        pkceLoeschen(state);
        fail(e instanceof Error ? e.message : "Token-Austausch fehlgeschlagen");
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
