import { useEffect, useRef, useState } from "react";
import { ChevronRight, Folder, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GraphDriveItem } from "@/lib/microsoft/graph";
import { cn } from "@/lib/utils";

type PfadSegment = { id: string; name: string };

type Props = {
  token: string;
  /** Vorausgewählter Ordner (OneDrive item id). */
  gewaehlterOrdnerId?: string | null;
  gewaehlterOrdnerPfad?: string | null;
  onAuswahl: (ordner: { id: string; pfad: string }) => void;
  className?: string;
};

function ordnerNamePasst(name: string, teil: string): boolean {
  const a = name.trim().toLowerCase();
  const b = teil.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

async function loesePfadZuSegmenten(
  token: string,
  pfadString: string,
): Promise<PfadSegment[]> {
  const teile = pfadString
    .split("/")
    .map((t) => t.trim())
    .filter(Boolean);
  if (teile.length === 0) return [];

  const { microsoftOneDriveKinderFn } = await import("@/lib/microsoft/server-fn");
  const segmente: PfadSegment[] = [];
  let parentId: string | null = null;

  for (const teil of teile) {
    const result = await microsoftOneDriveKinderFn({
      data: { supabaseAccessToken: token, itemId: parentId },
    });
    const ordner = result.items.find(
      (i) => i.istOrdner && ordnerNamePasst(i.name, teil),
    );
    if (!ordner) break;
    segmente.push({ id: ordner.id, name: ordner.name });
    parentId = ordner.id;
  }

  return segmente;
}

export function OrdnerAuswahl({
  token,
  gewaehlterOrdnerId,
  gewaehlterOrdnerPfad,
  onAuswahl,
  className,
}: Props) {
  const [pfad, setPfad] = useState<PfadSegment[]>([]);
  const [items, setItems] = useState<GraphDriveItem[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const pfadSyncKey = `${gewaehlterOrdnerId ?? ""}:${gewaehlterOrdnerPfad ?? ""}`;
  const letzterSyncKey = useRef<string | null>(null);

  const aktuellerOrdnerId = pfad.length > 0 ? pfad[pfad.length - 1]!.id : null;

  useEffect(() => {
    if (!token || !gewaehlterOrdnerPfad?.trim() || !gewaehlterOrdnerId) {
      if (letzterSyncKey.current !== pfadSyncKey) {
        setPfad([]);
        letzterSyncKey.current = pfadSyncKey;
      }
      return;
    }

    if (letzterSyncKey.current === pfadSyncKey) return;

    let cancelled = false;
    void (async () => {
      try {
        const segmente = await loesePfadZuSegmenten(token, gewaehlterOrdnerPfad);
        if (cancelled) return;

        const last = segmente[segmente.length - 1];
        if (last?.id === gewaehlterOrdnerId && segmente.length > 0) {
          setPfad(segmente.slice(0, -1));
        } else if (segmente.length > 0) {
          setPfad(segmente);
        } else {
          setPfad([]);
        }
        letzterSyncKey.current = pfadSyncKey;
      } catch {
        if (!cancelled) setPfad([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, gewaehlterOrdnerId, gewaehlterOrdnerPfad, pfadSyncKey]);

  useEffect(() => {
    if (!token) {
      setItems([]);
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
          data: { supabaseAccessToken: token, itemId: aktuellerOrdnerId },
        });
        if (cancelled) return;
        setItems(result.items.filter((i) => i.istOrdner));
      } catch (e) {
        if (cancelled) return;
        setItems([]);
        setFehler(
          e instanceof Error ? e.message : "Ordner konnten nicht geladen werden.",
        );
      } finally {
        if (!cancelled) setLaedt(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, aktuellerOrdnerId]);

  function ordnerPfadString(): string {
    return pfad.map((p) => p.name).join("/");
  }

  function inOrdner(ordner: GraphDriveItem) {
    setPfad((prev) => [...prev, { id: ordner.id, name: ordner.name }]);
  }

  function zuRoot() {
    setPfad([]);
  }

  function zuSegment(index: number) {
    setPfad((prev) => prev.slice(0, index + 1));
  }

  function aktuellenOrdnerWaehlen() {
    if (aktuellerOrdnerId) {
      onAuswahl({ id: aktuellerOrdnerId, pfad: ordnerPfadString() });
    }
  }

  function gewaehltenInListeWaehlen() {
    if (!gewaehlterOrdnerId || !gewaehlterOrdnerPfad) return;
    onAuswahl({ id: gewaehlterOrdnerId, pfad: gewaehlterOrdnerPfad });
  }

  const istGewaehlt = (id: string) => gewaehlterOrdnerId === id;
  const gewaehlterInAktuellerListe = items.some(
    (i) => i.id === gewaehlterOrdnerId,
  );

  const angezeigterPfad =
    gewaehlterOrdnerPfad ||
    (pfad.length > 0 ? ordnerPfadString() : null);

  return (
    <div className={cn("flex flex-col gap-2 border border-hairline bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps text-text-muted">Zielordner</span>
        {gewaehlterInAktuellerListe ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-foreground text-foreground"
            onClick={gewaehltenInListeWaehlen}
          >
            Diesen Ordner wählen
          </Button>
        ) : aktuellerOrdnerId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-foreground text-foreground"
            onClick={aktuellenOrdnerWaehlen}
          >
            Diesen Ordner wählen
          </Button>
        ) : null}
      </div>

      {angezeigterPfad ? (
        <p className="break-words text-sm font-medium leading-relaxed text-heading">
          {angezeigterPfad}
        </p>
      ) : (
        <p className="text-sm text-text-muted">Noch kein Ordner gewählt</p>
      )}

      <nav
        aria-label="Ordnerpfad"
        className="flex min-w-0 flex-wrap items-center gap-1 text-xs"
      >
        <button
          type="button"
          onClick={zuRoot}
          className={cn(
            "rounded px-1 py-0.5 hover:bg-surface-muted",
            pfad.length === 0 ? "font-medium text-heading" : "text-text-muted",
          )}
        >
          OneDrive
        </button>
        {pfad.map((seg, i) => (
          <span key={seg.id} className="flex items-center gap-0.5">
            <ChevronRight className="h-3 w-3 shrink-0 text-text-subtle" aria-hidden />
            <button
              type="button"
              onClick={() => zuSegment(i)}
              className={cn(
                "break-words rounded px-1 py-0.5 text-left hover:bg-surface-muted",
                i === pfad.length - 1 ? "font-medium text-heading" : "text-text-muted",
              )}
            >
              {seg.name}
            </button>
          </span>
        ))}
        {gewaehlterOrdnerId &&
        gewaehlterOrdnerPfad &&
        gewaehlterInAktuellerListe ? (
          <span className="flex items-center gap-0.5">
            <ChevronRight className="h-3 w-3 shrink-0 text-text-subtle" aria-hidden />
            <span className="break-words px-1 py-0.5 font-medium text-heading">
              {gewaehlterOrdnerPfad.split("/").filter(Boolean).pop()}
            </span>
          </span>
        ) : null}
      </nav>

      {fehler ? (
        <p className="text-xs text-destructive" role="alert">
          {fehler}
        </p>
      ) : null}

      <div className="max-h-48 overflow-y-auto border border-hairline">
        {laedt ? (
          <div className="flex items-center justify-center gap-2 p-4 text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="text-sm">Lade Ordner…</span>
          </div>
        ) : items.length === 0 ? (
          <p className="p-3 text-sm text-text-muted">Keine Unterordner</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted",
                    istGewaehlt(item.id) && "bg-surface-muted font-medium text-heading",
                  )}
                  onClick={() => inOrdner(item)}
                >
                  <Folder className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                  <span className="break-words">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
