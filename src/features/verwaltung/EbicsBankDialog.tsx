import { useState } from "react";
import { Download, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { STATUS_LABEL } from "@/lib/constants";
import type { EbicsKundeStatusDto } from "@/lib/ebics/types";

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EbicsBankDialog({
  offen,
  onOpenChange,
  gesellschaftId,
}: {
  offen: boolean;
  onOpenChange: (offen: boolean) => void;
  gesellschaftId?: string | null;
}) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [items, setItems] = useState<EbicsKundeStatusDto[]>([]);
  const [laeuft, setLaeuft] = useState(false);

  const laden = async () => {
    if (!token) return;
    setLaeuft(true);
    try {
      const { ebicsStatusFn } = await import("@/lib/ebics/server-fn");
      const res = await ebicsStatusFn({ data: { supabaseAccessToken: token } });
      const gefiltert = gesellschaftId
        ? res.items.filter((i) => i.gesellschaftId === gesellschaftId)
        : res.items;
      setItems(gefiltert);
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLaeuft(false);
    }
  };

  const initialisieren = async () => {
    if (!token) return;
    setLaeuft(true);
    try {
      const { ebicsInitialisierenFn } = await import("@/lib/ebics/server-fn");
      const res = await ebicsInitialisierenFn({
        data: {
          supabaseAccessToken: token,
          gesellschaftId: gesellschaftId ?? null,
        },
      });
      for (const brief of res.briefe) {
        downloadHtml(
          `EBICS-INI-${brief.gesellschaftId}.html`,
          brief.iniLetterHtml,
        );
      }
      toast.success(
        res.anzahl > 0
          ? `${res.anzahl} INI-Brief(e) erzeugt`
          : "Nichts zu initialisieren",
      );
      await laden();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLaeuft(false);
    }
  };

  const freischaltung = async () => {
    if (!token) return;
    setLaeuft(true);
    try {
      const { ebicsBankFreischaltungPruefenFn } = await import(
        "@/lib/ebics/server-fn"
      );
      const res = await ebicsBankFreischaltungPruefenFn({
        data: {
          supabaseAccessToken: token,
          gesellschaftId: gesellschaftId ?? null,
        },
      });
      const ok = res.ergebnisse.filter((e) => e.status === "bereit").length;
      const fehl = res.ergebnisse.filter((e) => e.status === "fehler").length;
      if (fehl > 0) {
        toast.error(`${ok} bereit · ${fehl} Fehler`);
      } else {
        toast.success(`${ok} bereit`);
      }
      await laden();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog
      open={offen}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) void laden();
      }}
    >
      <DialogContent className="max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle>EBICS</DialogTitle>
        </DialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {items.length === 0 && !laeuft ? (
            <li className="text-text-muted">Keine Kunden</li>
          ) : null}
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-2 border-b border-hairline py-2 last:border-0"
            >
              <span className="font-medium text-heading">
                {i.gesellschaftKuerzel}
              </span>
              <span className="text-text-muted">{statusLabel(i.status)}</span>
            </li>
          ))}
        </ul>
        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            disabled={laeuft}
            onClick={() => void initialisieren()}
          >
            <Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Initialisieren
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            disabled={laeuft}
            onClick={() => void freischaltung()}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${laeuft ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            Freischaltung
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-none"
            disabled={laeuft}
            onClick={() => void laden()}
          >
            <Landmark className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
