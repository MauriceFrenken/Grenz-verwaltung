import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Download,
  FileText,
  Landmark,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { STATUS_LABEL } from "@/lib/constants";
import type { EbicsKundeStatusDto } from "@/lib/ebics/types";

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

async function downloadBriefeZip(
  briefe: Array<{ gesellschaftId: string; iniLetterHtml: string }>,
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const brief of briefe) {
    zip.file(`EBICS-INI-${brief.gesellschaftId}.html`, brief.iniLetterHtml);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "EBICS-INI-Briefe.zip";
  a.click();
  URL.revokeObjectURL(url);
}

type Aktion = "status" | "init" | "frei" | "briefe" | "umsaetze" | null;

export function EbicsAktionenPanel({
  onUmsaetzeAbgerufen,
}: {
  /** Nach erfolgreichem Abruf, z. B. um die Umsatzliste neu zu laden. */
  onUmsaetzeAbgerufen?: () => void;
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
      setItems(res.items);
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setAktion(null);
    }
  };

  useEffect(() => {
    if (!token) return;
    let abgebrochen = false;
    void (async () => {
      setAktion("status");
      try {
        const { ebicsStatusFn } = await import("@/lib/ebics/server-fn");
        const res = await ebicsStatusFn({
          data: { supabaseAccessToken: token },
        });
        if (abgebrochen) return;
        setItems(res.items);
      } catch (err) {
        if (!abgebrochen) toast.error(apiFehlermeldung(err));
      } finally {
        if (!abgebrochen) setAktion(null);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [token]);

  const initialisieren = async () => {
    if (!token) return;
    setAktion("init");
    try {
      const { ebicsInitialisierenFn } = await import("@/lib/ebics/server-fn");
      const res = await ebicsInitialisierenFn({
        data: { supabaseAccessToken: token },
      });
      if (res.briefe.length > 0) {
        await downloadBriefeZip(res.briefe);
      }
      if (res.fehler?.length) {
        toast.error(
          res.fehler
            .map((f) => `${f.gesellschaftId}: ${f.meldung}`)
            .join(" · "),
        );
      }
      if (res.anzahl > 0) {
        toast.success(`${res.anzahl} INI-Brief(e) als ZIP`);
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

  const briefeHolen = async () => {
    if (!token) return;
    setAktion("briefe");
    try {
      const { ebicsIniBriefeHolenFn } = await import("@/lib/ebics/server-fn");
      const res = await ebicsIniBriefeHolenFn({
        data: { supabaseAccessToken: token },
      });
      await downloadBriefeZip(res.briefe);
      if (res.fehler?.length) {
        toast.error(
          res.fehler
            .map((f) => `${f.gesellschaftId}: ${f.meldung}`)
            .join(" · "),
        );
      }
      toast.success(`${res.anzahl} INI-Brief(e) als ZIP`);
    } catch (err) {
      toast.error(apiFehlermeldung(err));
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
      const { ebicsBankFreischaltungPruefenFn } =
        await import("@/lib/ebics/server-fn");
      const res = await ebicsBankFreischaltungPruefenFn({
        data: { supabaseAccessToken: token },
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

  const umsaetzeAbrufen = async () => {
    if (!token) return;
    setAktion("umsaetze");
    try {
      const { ebicsUmsaetzeAbrufenFn } = await import("@/lib/ebics/server-fn");
      const res = await ebicsUmsaetzeAbrufenFn({
        data: { supabaseAccessToken: token },
      });
      const fehler = res.ergebnisse.filter((e) => e.status === "fehler");
      if (fehler.length > 0) {
        toast.error(
          fehler.map((e) => e.meldung ?? e.gesellschaftId).join(" · "),
        );
      } else if (res.ergebnisse.every((e) => e.status === "skip")) {
        toast.message("Kein Zugang bereit — zuerst Freischaltung.");
      } else {
        toast.success(`${res.anzahlNeuGesamt} neue Buchung(en)`);
      }
      onUmsaetzeAbgerufen?.();
      await laden();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setAktion(null);
    }
  };

  const busy = aktion !== null;
  const istBereit = items.some((i) => i.status === "bereit");
  const hatBriefe = items.some(
    (i) => i.status === "wartet_auf_bank" || i.status === "bereit",
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
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
          disabled={busy || !hatBriefe}
          onClick={() => void briefeHolen()}
        >
          <FileText
            className={`mr-2 h-4 w-4 ${aktion === "briefe" ? "animate-pulse" : ""}`}
            strokeWidth={1.5}
          />
          {aktion === "briefe" ? "Lädt…" : "INI-Briefe"}
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
          variant="outline"
          size="sm"
          className="rounded-none"
          disabled={busy || !istBereit}
          onClick={() => void umsaetzeAbrufen()}
        >
          <ArrowDownToLine
            className={`mr-2 h-4 w-4 ${aktion === "umsaetze" ? "animate-pulse" : ""}`}
            strokeWidth={1.5}
          />
          {aktion === "umsaetze" ? "Ruft ab…" : "Umsätze abrufen"}
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
      </div>

      <ul className="divide-y divide-hairline border border-hairline">
        {items.length === 0 && !busy ? (
          <li className="px-4 py-3 text-sm text-text-muted">
            Kein EBICS-Zugang für Grenz & Co. hinterlegt.
          </li>
        ) : null}
        {items.map((i) => {
          const kuerzel = [
            ...new Set(i.konten.map((k) => k.gesellschaftKuerzel)),
          ].filter((k) => k && k !== "—");
          const titelKuerzel =
            kuerzel.length > 0 ? kuerzel.join(" · ") : i.gesellschaftKuerzel;
          return (
            <li
              key={i.id}
              className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-heading">{titelKuerzel}</div>
                {i.partnerId ? (
                  <div className="mt-0.5 text-xs text-text-muted">
                    {i.partnerId}
                  </div>
                ) : null}
                <ul className="mt-2 space-y-1 text-xs text-text-muted">
                  {i.konten.map((k) => (
                    <li key={k.iban} className="flex flex-wrap gap-x-2">
                      <span className="font-medium text-heading">
                        {k.gesellschaftKuerzel}
                      </span>
                      <span className="font-mono">{k.iban}</span>
                      {k.bezeichnung ? <span>{k.bezeichnung}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="shrink-0 text-right text-text-muted">
                {statusLabel(i.status)}
                {i.letzterFehler ? (
                  <span className="mt-0.5 block text-xs text-danger">
                    {i.letzterFehler}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
