import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { EinstellungenReiter } from "./EinstellungenReiter";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { MicrosoftStatusPayload } from "@/lib/microsoft/connect";

import { SalesforceSyncKarte } from "./SalesforceSyncKarte";

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

export function IntegrationenPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [status, setStatus] = useState<MicrosoftStatusPayload | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "probe" | null>(null);

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

  const verbinden = async () => {
    if (!token) {
      toast.error("Nicht angemeldet.");
      return;
    }
    setBusy("connect");
    try {
      const { microsoftConnectFn } = await import("@/lib/microsoft/server-fn");
      const next = await microsoftConnectFn({ data: { supabaseAccessToken: token } });
      setStatus(next);
      const anzahl = next.postfachNachrichten;
      toast.success(
        anzahl === null
          ? `App-only verbunden mit ${next.postfach}.`
          : `App-only verbunden mit ${next.postfach} (${anzahl.toLocaleString("de-DE")} Nachrichten).`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.", {
        duration: 14_000,
      });
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
      if (next.status === "verbunden") {
        const anzahl = next.postfachNachrichten;
        toast.success(
          anzahl === null
            ? `Postfach und OneDrive erreichbar (${next.postfach}).`
            : `Postfach und OneDrive erreichbar (${next.postfach}, ${anzahl.toLocaleString("de-DE")} Nachrichten).`,
        );
      } else {
        toast.error(next.letzterFehler ?? "Prüfung fehlgeschlagen.", { duration: 14_000 });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Prüfung fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const verbunden = status?.status === "verbunden";
  const postfach = status?.postfach || "Nicht konfiguriert";

  return (
    <>
      <PageHeader
        titel="Einstellungen"
        reiter={<EinstellungenReiter aktiv="integrationen" />}
      />
      <PageWrapper>
        <div className="flex max-w-3xl flex-col gap-6">
          <article className="flex flex-col gap-5 border border-hairline bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <MicrosoftMark />
                <h2 className="text-sm font-semibold text-heading">Microsoft 365</h2>
              </div>
              <StatusBadge status={status?.status ?? "getrennt"} />
            </div>

            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-text-subtle">Postfach</dt>
                <dd className="mt-0.5 text-heading">{postfach}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Modus</dt>
                <dd className="mt-0.5 text-heading">App-only (kein User-Login)</dd>
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
                <dt className="text-text-subtle">Konfiguration</dt>
                <dd className="mt-0.5 text-heading">
                  {laedt ? "…" : status?.azureKonfiguriert ? "Bereit" : "Unvollständig"}
                </dd>
              </div>
            </dl>

            {status?.letzterFehler ? (
              <p className="border border-danger/40 bg-surface-muted px-3 py-2 text-xs whitespace-pre-line text-danger">
                {status.letzterFehler}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-foreground text-background hover:bg-heading"
                disabled={busy !== null || !status?.azureKonfiguriert}
                onClick={() => void verbinden()}
              >
                {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {verbunden ? "Neu verbinden" : "App-Verbindung herstellen"}
              </Button>
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
            </div>
          </article>
          <SalesforceSyncKarte token={token} />
        </div>
      </PageWrapper>
    </>
  );
}

function MicrosoftMark() {
  return (
    <span
      className="inline-grid h-8 w-8 shrink-0 grid-cols-2 grid-rows-2 gap-px"
      aria-hidden
    >
      <span className="bg-[#F25022]" />
      <span className="bg-[#7FBA00]" />
      <span className="bg-[#00A4EF]" />
      <span className="bg-[#FFB900]" />
    </span>
  );
}
