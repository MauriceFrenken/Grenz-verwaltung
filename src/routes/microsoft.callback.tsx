import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

/**
 * Früher OAuth-Callback für den delegierten Login.
 * App-only braucht keinen Browser-Redirect mehr — Route bleibt, damit alte
 * Redirect-URIs in Entra nicht 404 erzeugen.
 */
export const Route = createFileRoute("/microsoft/callback")({
  head: () => ({
    meta: [{ title: "Microsoft — Grenz & Co." }],
  }),
  component: MicrosoftCallbackPage,
});

function MicrosoftCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-heading">Microsoft-Verbindung</h1>
        <p className="mt-2 text-sm text-text-muted">
          Die Outlook-Integration läuft jetzt app-only ohne Login-Popup.
          Bitte unter Einstellungen › Integrationen „App-Verbindung herstellen“ nutzen.
        </p>
        <Link
          to="/einstellungen/integrationen"
          className="mt-6 inline-flex bg-foreground px-4 py-2 text-sm text-background"
        >
          Zu Integrationen
        </Link>
      </div>
    </div>
  );
}
