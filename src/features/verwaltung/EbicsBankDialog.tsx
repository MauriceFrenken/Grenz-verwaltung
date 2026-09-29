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

type Aktion = "status" | "init" | "frei" | null;

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
  const [aktion, setAktion] = useState<Aktion>(null);

  const laden = async () => {
    if (!token) return;
    setAktion("status");
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
      setAktion(null);
    }
  };

  const initialisieren = async () => {
    if (!token) return;
    setAktion("init");
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
      if (res.fehler?.length) {
        toast.error(
          res.fehler.map((f) => `${f.gesellschaftId}: ${f.meldung}`).join(" · "),
        );
      }
      if (res.anzahl > 0) {
        toast.success(`${res.anzahl} INI-Brief(e) erzeugt`);
      } else if (!res.fehler?.length) {
        toast.message("Nichts zu initialisieren");
      }
      await laden();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
      await laden();
    } finally {
      setAktion(null);
    }
  };

  const freischaltung = async () => {
    if (!token) return;
    const offenInit = items.filter((i) => i.status === "nicht_initialisiert");
    if (offenInit.length === items.length && items.length > 0) {
      toast.error(
        "Zuerst Initialisieren — danach INI-Briefe an die Bank, dann Freischaltung.",
      );
      return;
    }
    setAktion("frei");
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
      const fehl = res.ergebnisse.filter((e) => e.status === "fehler");
      if (fehl.length > 0) {
        const detail = fehl
          .map((e) => e.meldung ?? e.gesellschaftId)
          .slice(0, 3)
          .join(" · ");
        toast.error(`${ok} bereit · ${fehl.length} Fehler: ${detail}`);
      } else {
        toast.success(`${ok} bereit`);
      }
      await laden();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
      await laden();
    } finally {
      setAktion(null);
    }
  };

  const busy = aktion !== null;

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
          {items.length === 0 && !busy ? (
            <li className="text-text-muted">Keine Kunden</li>
          ) : null}
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-start justify-between gap-2 border-b border-hairline py-2 last:border-0"
            >
              <span className="font-medium text-heading">
                {i.gesellschaftKuerzel}
              </span>
              <span className="text-right text-text-muted">
                {statusLabel(i.status)}
                {i.letzterFehler ? (
                  <span className="mt-0.5 block text-xs text-danger">
                    {i.letzterFehler}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            disabled={busy}
            onClick={() => void initialisieren()}
          >
            <Download
              className={`mr-2 h-4 w-4 ${aktion === "init" ? "animate-pulse" : ""}`}
              strokeWidth={1.5}
            />
            {aktion === "init" ? "Initialisiert…" : "Initialisieren"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            disabled={busy}
            onClick={() => void freischaltung()}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${aktion === "frei" ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            {aktion === "frei" ? "Prüft…" : "Freischaltung"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-none"
            disabled={busy}
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
