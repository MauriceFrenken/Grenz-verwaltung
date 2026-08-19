import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MICROSOFT_DEFAULT_MAILBOX, MICROSOFT_OAUTH_CALLBACK_URL } from "@/lib/microsoft/config";
import type { MicrosoftStatusPayload } from "@/lib/microsoft/connect";
import { microsoftLoginPopup } from "@/lib/microsoft/oauth";

const WEITERE: Array<{ id: string; name: string; hinweis: string }> = [
  { id: "salesforce", name: "Salesforce", hinweis: "Verbindung läuft über den Exposé-Import." },
  { id: "dms", name: "DMS", hinweis: "Zielsystem noch offen." },
  { id: "datev", name: "DATEV", hinweis: "Noch nicht angebunden." },
  { id: "bank", name: "Bank (EBICS / FinTS)", hinweis: "Noch nicht angebunden." },
];

function formatDatum(iso: string | null): string {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function CopyZeile({ label, wert }: { label: string; wert: string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-40 shrink-0 text-[11px] uppercase tracking-wide text-text-subtle">{label}</span>
      <code className="min-w-0 flex-1 break-all border border-hairline bg-surface-muted px-2 py-1 text-xs text-heading">
        {wert}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 border-foreground text-foreground"
        onClick={async () => {
          await navigator.clipboard.writeText(wert);
          setKopiert(true);
          window.setTimeout(() => setKopiert(false), 1500);
        }}
      >
        {kopiert ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {kopiert ? "Kopiert" : "Kopieren"}
      </Button>
    </div>
  );
}

export function IntegrationenPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [status, setStatus] = useState<MicrosoftStatusPayload | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [busy, setBusy] = useState<"connect" | "reauth" | "disconnect" | "probe" | null>(null);
  const [anleitungOffen, setAnleitungOffen] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    setLaedt(true);
    try {
      const { microsoftStatusFn } = await import("@/lib/microsoft/server-fn");
      const next = await microsoftStatusFn({ data: { supabaseAccessToken: token } });
      setStatus(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status konnte nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, [token]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const verbinden = async (modus: "connect" | "reauth") => {
    if (!token) {
      toast.error("Nicht angemeldet.");
      return;
    }
    setBusy(modus);
    try {
      const next = await microsoftLoginPopup(token);
      setStatus(next);
      toast.success(`Outlook verbunden als ${next.kontoEmail ?? MICROSOFT_DEFAULT_MAILBOX}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const trennen = async () => {
    if (!token) return;
    setBusy("disconnect");
    try {
      const { microsoftDisconnectFn } = await import("@/lib/microsoft/server-fn");
      const next = await microsoftDisconnectFn({ data: { supabaseAccessToken: token } });
      setStatus(next);
      toast.success("Microsoft-Verbindung getrennt.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Trennen fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const pruefen = async () => {
    if (!token) return;
    setBusy("probe");
    try {
      const { microsoftProbeFn } = await import("@/lib/microsoft/server-fn");
      const next = await microsoftProbeFn({ data: { supabaseAccessToken: token } });
      setStatus(next);
      if (next.status === "verbunden") toast.success("Zugriff auf Microsoft Graph bestätigt.");
      else toast.error(next.letzterFehler ?? "Prüfung fehlgeschlagen.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Prüfung fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const verbunden = status?.status === "verbunden";
  const callbackUrls = status?.callbackUrls ?? [
    MICROSOFT_OAUTH_CALLBACK_URL,
    "http://localhost:8080/microsoft/callback",
  ];
  const erwartetesKonto = status?.erwartetesKonto ?? MICROSOFT_DEFAULT_MAILBOX;

  return (
    <>
      <PageHeader
        titel="Integrationen"
        beschreibung="Verbindungen gelten für die gesamte App, nicht für einzelne Benutzer."
      />
      <PageWrapper>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="flex flex-col gap-5 border border-hairline bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <MicrosoftMark />
                <div>
                  <h2 className="text-sm font-semibold text-heading">Microsoft 365</h2>
                  <p className="mt-1 text-xs text-text-muted">
                    Outlook und Excel über das Ankauf-Konto {erwartetesKonto}. Einmal verbinden —
                    alle Nutzer arbeiten mit derselben Mailbox und denselben Arbeitsmappen.
                  </p>
                </div>
              </div>
              <StatusBadge status={status?.status ?? "getrennt"} />
            </div>

            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-text-subtle">Konto</dt>
                <dd className="mt-0.5 text-heading">{status?.kontoEmail ?? erwartetesKonto}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Verbunden am</dt>
                <dd className="mt-0.5 text-heading">{formatDatum(status?.verbundenAm ?? null)}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Letzte Prüfung</dt>
                <dd className="mt-0.5 text-heading">{formatDatum(status?.letztePruefungAm ?? null)}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Entra-App</dt>
                <dd className="mt-0.5 text-heading">
                  {laedt
                    ? "…"
                    : status?.azureKonfiguriert
                      ? "Client-ID und Secret gesetzt"
                      : "Noch nicht konfiguriert"}
                </dd>
              </div>
            </dl>

            {status?.letzterFehler ? (
              <p className="border border-danger/40 bg-surface-muted px-3 py-2 text-xs text-danger">
                {status.letzterFehler}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <PermissionGate berechtigung="aktion.einstellungen.integrationen.verbinden">
                <Button
                  size="sm"
                  className="bg-foreground text-background hover:bg-heading"
                  disabled={busy !== null || !status?.azureKonfiguriert}
                  onClick={() => void verbinden("connect")}
                >
                  {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {verbunden ? "Neu verbinden" : "Mit Outlook verbinden"}
                </Button>
              </PermissionGate>
              <PermissionGate berechtigung="aktion.einstellungen.integrationen.reauth">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-foreground text-foreground"
                  disabled={busy !== null || !verbunden}
                  onClick={() => void verbinden("reauth")}
                >
                  {busy === "reauth" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Re-Auth
                </Button>
              </PermissionGate>
              <PermissionGate berechtigung="aktion.einstellungen.integrationen.verbinden">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-foreground text-foreground"
                  disabled={busy !== null || !verbunden}
                  onClick={() => void pruefen()}
                >
                  {busy === "probe" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Verbindung prüfen
                </Button>
              </PermissionGate>
              <PermissionGate berechtigung="aktion.einstellungen.integrationen.verbinden">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-danger text-danger"
                  disabled={busy !== null || status?.status === "getrennt"}
                  onClick={() => void trennen()}
                >
                  {busy === "disconnect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Trennen
                </Button>
              </PermissionGate>
            </div>

            <div className="border-t border-hairline pt-4">
              <button
                type="button"
                className="text-left text-xs font-semibold text-heading underline-offset-4 hover:underline"
                onClick={() => setAnleitungOffen((v) => !v)}
              >
                {anleitungOffen ? "Azure-Einrichtung ausblenden" : "Azure / Entra einrichten"}
              </button>
              {anleitungOffen ? <AzureAnleitung callbackUrls={callbackUrls} /> : null}
            </div>
          </article>

          {WEITERE.map((item) => (
            <article
              key={item.id}
              className="flex flex-col justify-between gap-4 border border-hairline bg-surface p-5 opacity-70"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-heading">{item.name}</h2>
                  <StatusBadge status="getrennt" />
                </div>
                <p className="mt-3 text-xs text-text-subtle">{item.hinweis}</p>
              </div>
              <Button size="sm" variant="outline" disabled className="w-fit border-foreground text-foreground">
                Demnächst
              </Button>
            </article>
          ))}
        </div>
      </PageWrapper>
    </>
  );
}

function AzureAnleitung({ callbackUrls }: { callbackUrls: string[] }) {
  return (
    <ol className="mt-4 space-y-3 text-xs leading-relaxed text-text-muted">
      <li>
        <span className="font-semibold text-heading">1. Entra-App, kein klassisches Azure-Projekt.</span>{" "}
        Graph (Outlook/Excel) läuft über{" "}
        <a
          className="underline underline-offset-2"
          href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
          target="_blank"
          rel="noreferrer"
        >
          Microsoft Entra ID → App-Registrierungen
        </a>
        . Ein Resource Group / Azure-Abo ist dafür nicht nötig.
      </li>
      <li>
        <span className="font-semibold text-heading">2. Neue Registrierung.</span> Name z. B. „FRENKEN
        Verwaltung“. Kontotyp:{" "}
        <em>Konten in diesem Organisationsverzeichnis</em> (nur FRENKEN-Mandant). Redirect-URI:
        Plattform <em>Web</em>, erste URL die Produktions-Callback-Adresse.
      </li>
      <li className="space-y-2">
        <span className="font-semibold text-heading">3. Redirect-URIs (Web) eintragen</span>
        <div className="space-y-2">
          {callbackUrls.map((url) => (
            <CopyZeile key={url} label="Redirect URI" wert={url} />
          ))}
        </div>
      </li>
      <li>
        <span className="font-semibold text-heading">4. Geheimen Clientschlüssel.</span> Unter
        Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel (24 Monate). Wert sofort kopieren —
        das ist <code className="text-heading">MICROSOFT_CLIENT_SECRET</code>.
      </li>
      <li>
        <span className="font-semibold text-heading">5. API-Berechtigungen (delegiert, Microsoft Graph).</span>{" "}
        <code className="text-heading">Mail.ReadWrite</code>, <code className="text-heading">Mail.Send</code>{" "}
        (E-Mails lesen/ändern/senden), <code className="text-heading">Files.ReadWrite</code> (Excel auf
        OneDrive des Ankauf-Kontos), <code className="text-heading">Sites.ReadWrite.All</code> (Excel in
        SharePoint), plus <code className="text-heading">User.Read</code> und{" "}
        <code className="text-heading">offline_access</code>. Danach{" "}
        <em>Administratorzustimmung für FRENKEN erteilen</em>.
      </li>
      <li>
        <span className="font-semibold text-heading">6. IDs in die App legen.</span> Übersicht: Anwendungs-ID
        (Client) → <code className="text-heading">VITE_MICROSOFT_CLIENT_ID</code> und{" "}
        <code className="text-heading">MICROSOFT_CLIENT_ID</code>. Verzeichnis-ID (Tenant) →{" "}
        <code className="text-heading">VITE_MICROSOFT_TENANT_ID</code> und{" "}
        <code className="text-heading">MICROSOFT_TENANT_ID</code>. Lokal in{" "}
        <code className="text-heading">.env.local</code>, produktiv zusätzlich in Vercel (Production +
        Preview). Danach Dev-Server neu starten.
      </li>
      <li>
        <span className="font-semibold text-heading">7. Verbinden.</span> Hier auf „Mit Outlook verbinden“
        und im Microsoft-Fenster genau <code className="text-heading">{MICROSOFT_DEFAULT_MAILBOX}</code>{" "}
        anmelden — kein persönliches Konto. Die Tokens liegen nur serverseitig, alle Nutzer teilen diese
        eine Verbindung.
      </li>
    </ol>
  );
}

function MicrosoftMark() {
  return (
    <span
      className="mt-0.5 inline-grid h-8 w-8 shrink-0 grid-cols-2 grid-rows-2 gap-px"
      aria-hidden
    >
      <span className="bg-[#F25022]" />
      <span className="bg-[#7FBA00]" />
      <span className="bg-[#00A4EF]" />
      <span className="bg-[#FFB900]" />
    </span>
  );
}
