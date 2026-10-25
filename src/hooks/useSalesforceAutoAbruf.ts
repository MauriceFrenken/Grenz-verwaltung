import { useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";

const TAKT_MS = 15 * 60 * 1000;

/**
 * Solange die App offen ist: alle 15 Minuten fragen, ob ein Salesforce-Abruf fällig ist.
 * Der Server entscheidet und nutzt die hinterlegte Verbindung, der Browser liefert keine Tokens.
 */
export function useSalesforceAutoAbruf() {
  const { session, istAngemeldet } = useAuth();
  const token = session?.access_token ?? "";

  useEffect(() => {
    if (!istAngemeldet || !token) return;
    let aktiv = true;

    const pruefen = async () => {
      try {
        const { salesforceSyncWennFaelligFn } =
          await import("@/lib/sf-sync/server-fn");
        if (aktiv)
          await salesforceSyncWennFaelligFn({
            data: { supabaseAccessToken: token },
          });
      } catch (e) {
        // Fehler stehen je Objekt im Sync-Stand (Einstellungen › Integrationen).
        console.warn("[salesforce-auto-abruf]", e);
      }
    };

    const start = window.setTimeout(() => void pruefen(), 5_000);
    const takt = window.setInterval(() => void pruefen(), TAKT_MS);
    return () => {
      aktiv = false;
      window.clearTimeout(start);
      window.clearInterval(takt);
    };
  }, [istAngemeldet, token]);
}
