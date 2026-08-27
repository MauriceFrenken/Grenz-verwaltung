import { useEffect, useState } from "react";
import { ChevronRight, File, Folder, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MICROSOFT_ONEDRIVE_USER } from "@/lib/microsoft/config";
import type { GraphDriveItem } from "@/lib/microsoft/graph";
import { cn } from "@/lib/utils";

type PfadSegment = {
  id: string;
  name: string;
};

function formatDatum(iso: string | null): string {
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

function formatGroesse(bytes: number, istOrdner: boolean): string {
  if (istOrdner) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const SPALTEN: Column<GraphDriveItem>[] = [
  {
    key: "name",
    header: "Name",
    className: "max-w-0 w-full",
    render: (row) => {
      const Icon = row.istOrdner ? Folder : File;
      return (
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon
            className="h-4 w-4 shrink-0 text-text-muted"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="truncate font-medium text-heading">{row.name}</span>
        </span>
      );
    },
  },
  {
    key: "groesse",
    header: "Größe",
    align: "right",
    render: (row) => (
      <span className="text-text-muted">
        {formatGroesse(row.groesse, row.istOrdner)}
      </span>
    ),
  },
  {
    key: "geaendert",
    header: "Geändert",
    align: "right",
    render: (row) => (
      <span className="text-text-muted">{formatDatum(row.geaendertAm)}</span>
    ),
  },
];

export function AblagePage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [pfad, setPfad] = useState<PfadSegment[]>([]);
  const [items, setItems] = useState<GraphDriveItem[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const aktuellerOrdnerId = pfad.length > 0 ? pfad[pfad.length - 1]!.id : null;

  useEffect(() => {
    if (!token) {
      setItems([]);
      setFehler(null);
      setLaedt(false);
      return;
    }

    let cancelled = false;
    setLaedt(true);
    setFehler(null);

    void (async () => {
      try {
        const { microsoftOneDriveKinderFn } = await import(
          "@/lib/microsoft/server-fn"
        );
        const result = await microsoftOneDriveKinderFn({
          data: {
            supabaseAccessToken: token,
            itemId: aktuellerOrdnerId,
          },
        });
        if (cancelled) return;
        setItems(result.items);
      } catch (e) {
        if (cancelled) return;
        setItems([]);
        setFehler(
          e instanceof Error
            ? e.message
            : "OneDrive konnte nicht geladen werden.",
        );
      } finally {
        if (!cancelled) setLaedt(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, aktuellerOrdnerId, reloadKey]);

  function zuRoot() {
    setPfad([]);
  }

  function zuSegment(index: number) {
    setPfad((prev) => prev.slice(0, index + 1));
  }

  function onRowClick(row: GraphDriveItem) {
    if (row.istOrdner) {
      setPfad((prev) => [...prev, { id: row.id, name: row.name }]);
      return;
    }
    if (row.webUrl) {
      window.open(row.webUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <>
      <PageHeader
        titel="Dokumentenablage"
        nebenTitel={
          <span className="truncate text-xs text-text-muted">
            {MICROSOFT_ONEDRIVE_USER}
          </span>
        }
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
        <nav
          aria-label="Ordnerpfad"
          className="mb-4 flex min-w-0 flex-wrap items-center gap-1 text-sm"
        >
          <button
            type="button"
            onClick={zuRoot}
            className={cn(
              "rounded px-1.5 py-0.5 hover:bg-surface-muted",
              pfad.length === 0
                ? "font-medium text-heading"
                : "text-text-muted hover:text-heading",
            )}
          >
            OneDrive
          </button>
          {pfad.map((seg, i) => (
            <span key={seg.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-text-subtle"
                strokeWidth={1.5}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => zuSegment(i)}
                className={cn(
                  "truncate rounded px-1.5 py-0.5 hover:bg-surface-muted",
                  i === pfad.length - 1
                    ? "font-medium text-heading"
                    : "text-text-muted hover:text-heading",
                )}
              >
                {seg.name}
              </button>
            </span>
          ))}
        </nav>

        {fehler ? (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {fehler}
          </p>
        ) : null}

        <DataTable
          spalten={SPALTEN}
          zeilen={items}
          isLoading={laedt}
          isEmpty={!laedt && !fehler && items.length === 0}
          emptyTitel="Ordner ist leer"
          onRowClick={onRowClick}
          rowKey={(z) => z.id}
        />
      </PageWrapper>
    </>
  );
}
