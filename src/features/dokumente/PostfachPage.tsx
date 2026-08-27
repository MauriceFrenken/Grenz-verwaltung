import { useEffect, useState } from "react";
import { HardDriveUpload, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth, usePermissions } from "@/hooks/useAuth";
import type { GraphNachricht } from "@/lib/microsoft/graph";
import { cn } from "@/lib/utils";

function formatEingangsdatum(iso: string | null): string {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "–";
  }
}

export function PostfachPage() {
  const { session } = useAuth();
  const { darfAktion } = usePermissions();
  const token = session?.access_token ?? "";
  const darfAblegen = darfAktion("aktion.dokumente.pruefordner.ablegen");

  const [nachrichten, setNachrichten] = useState<GraphNachricht[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [ablegenId, setAblegenId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setNachrichten([]);
      setFehler(null);
      setLaedt(false);
      return;
    }

    let cancelled = false;
    setLaedt(true);
    setFehler(null);

    void (async () => {
      try {
        const { microsoftDokumentPosteingangFn } = await import(
          "@/lib/microsoft/server-fn"
        );
        const result = await microsoftDokumentPosteingangFn({
          data: { supabaseAccessToken: token, anzahl: 50 },
        });
        if (cancelled) return;
        setNachrichten(result.nachrichten);
      } catch (e) {
        if (cancelled) return;
        setNachrichten([]);
        setFehler(
          e instanceof Error
            ? e.message
            : "Postfach konnte nicht geladen werden.",
        );
      } finally {
        if (!cancelled) setLaedt(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function ablegen(nachricht: GraphNachricht) {
    if (!token || !darfAblegen) return;
    setAblegenId(nachricht.id);
    try {
      const { microsoftAnhangAblegenFn } = await import(
        "@/lib/microsoft/server-fn"
      );
      const result = await microsoftAnhangAblegenFn({
        data: {
          supabaseAccessToken: token,
          nachrichtId: nachricht.id,
        },
      });
      const namen = result.hochgeladen.map((h) => h.name).join(", ");
      toast.success(
        result.hochgeladen.length === 1
          ? `Abgelegt: ${namen}`
          : `${result.hochgeladen.length} Dateien abgelegt: ${namen}`,
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Ablegen fehlgeschlagen.",
        { duration: 12_000 },
      );
    } finally {
      setAblegenId(null);
    }
  }

  const spalten: Column<GraphNachricht>[] = [
    {
      key: "absender",
      header: "Absender",
      className: "max-w-[11rem]",
      render: (row) => (
        <span className="truncate block" title={row.absenderMail ?? undefined}>
          {row.absenderName || row.absenderMail || "–"}
        </span>
      ),
    },
    {
      key: "betreff",
      header: "Betreff",
      className: "max-w-0 w-full",
      render: (row) => (
        <span className="truncate block font-medium text-heading">
          {row.betreff || "(kein Betreff)"}
        </span>
      ),
    },
    {
      key: "anhang",
      header: "Anhang",
      render: (row) => (
        <span className="text-text-muted">
          {row.pdfAnhang?.name ?? (row.hatAnhaenge ? "Datei" : "–")}
        </span>
      ),
    },
    {
      key: "datum",
      header: "Datum",
      align: "right",
      render: (row) => (
        <span className="text-text-muted">
          {formatEingangsdatum(row.eingegangenAm)}
        </span>
      ),
    },
    {
      key: "aktion",
      header: "",
      align: "right",
      render: (row) =>
        darfAblegen ? (
          <PermissionGate berechtigung="aktion.dokumente.pruefordner.ablegen">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-foreground text-foreground"
              disabled={Boolean(ablegenId)}
              aria-label="Auf OneDrive ablegen"
              onClick={(e) => {
                e.stopPropagation();
                void ablegen(row);
              }}
            >
              {ablegenId === row.id ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <HardDriveUpload className="h-4 w-4" strokeWidth={1.5} />
              )}
            </Button>
          </PermissionGate>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        titel="Postfach"
        aktionen={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-foreground text-foreground"
            disabled={laedt || !token}
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Aktualisieren"
          >
            <RefreshCw
              className={cn("h-4 w-4", laedt && "animate-spin")}
              strokeWidth={1.5}
            />
          </Button>
        }
      />
      <PageWrapper>
        {fehler ? (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {fehler}
          </p>
        ) : null}
        <DataTable
          spalten={spalten}
          zeilen={nachrichten}
          isLoading={laedt}
          isEmpty={!laedt && !fehler && nachrichten.length === 0}
          emptyTitel="Keine Nachrichten mit Anhang"
          rowKey={(z) => z.id}
        />
      </PageWrapper>
    </>
  );
}
