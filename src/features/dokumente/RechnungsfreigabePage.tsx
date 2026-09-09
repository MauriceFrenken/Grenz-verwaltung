import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { useAuth, usePermissions } from "@/hooks/useAuth";
import {
  FREIGABE_STATUS_LABELS,
  FREIGABE_STATUS_SPALTEN,
  type DokumentFreigabeStatus,
  type DokumentPosteingangEintrag,
} from "@/lib/dokument-postfach/typen";
import { cn } from "@/lib/utils";

function betragText(eintrag: DokumentPosteingangEintrag): string {
  const betrag = eintrag.felder?.rechnungsbetrag?.value?.trim();
  const waehrung = eintrag.felder?.waehrung?.value?.trim() || "EUR";
  if (!betrag) return "–";
  return `${betrag} ${waehrung}`;
}

function Karte({
  eintrag,
  disabled,
  onDragStart,
}: {
  eintrag: DokumentPosteingangEintrag;
  disabled: boolean;
  onDragStart: (id: string) => void;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", eintrag.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(eintrag.id);
      }}
      className={cn(
        "border border-hairline bg-surface p-3 text-left",
        !disabled && "cursor-grab active:cursor-grabbing",
        disabled && "opacity-60",
      )}
    >
      <p className="line-clamp-2 text-sm font-medium text-heading">
        {eintrag.felder?.rechnungssteller?.value?.trim() ||
          eintrag.anhangName ||
          eintrag.betreff ||
          "Rechnung"}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {eintrag.felder?.gesellschaftName?.value?.trim() || "–"}
      </p>
      <p className="mt-1 text-xs text-text-subtle">{betragText(eintrag)}</p>
      <Link
        to="/dokumente/pruefung"
        search={{ postfach: eintrag.id }}
        className="mt-2 inline-block text-xs text-text-muted underline-offset-2 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Prüfen
      </Link>
    </div>
  );
}

function Spalte({
  status,
  eintraege,
  dropErlaubt,
  busyId,
  onDrop,
  onDragStart,
}: {
  status: DokumentFreigabeStatus;
  eintraege: DokumentPosteingangEintrag[];
  dropErlaubt: boolean;
  busyId: string | null;
  onDrop: (status: DokumentFreigabeStatus, eintragId: string) => void;
  onDragStart: (id: string) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={cn(
        "flex min-h-[420px] min-w-[200px] flex-1 flex-col border border-hairline bg-background",
        over && dropErlaubt && "border-foreground",
      )}
      onDragOver={(e) => {
        if (!dropErlaubt) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!dropErlaubt) return;
        const id = e.dataTransfer.getData("text/plain")?.trim();
        if (id) onDrop(status, id);
      }}
    >
      <div className="hairline-b flex items-center justify-between border-b border-hairline px-3 py-2">
        <h3 className="label-caps text-text-muted">
          {FREIGABE_STATUS_LABELS[status]}
        </h3>
        <span className="text-xs text-text-subtle">{eintraege.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {eintraege.map((e) => (
          <Karte
            key={e.id}
            eintrag={e}
            disabled={busyId === e.id || status === "erledigt"}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  );
}

export function RechnungsfreigabePage() {
  const { session } = useAuth();
  const { darfAktion } = usePermissions();
  const token = session?.access_token ?? "";
  const [eintraege, setEintraege] = useState<DokumentPosteingangEintrag[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const kannVerschieben = darfAktion("aktion.dokumente.rechnungsfreigabe.verschieben");
  const kannDatev = darfAktion("aktion.dokumente.rechnungsfreigabe.datev");

  const laden = useCallback(async () => {
    if (!token) return;
    setLaedt(true);
    try {
      const { dokumentRechnungsfreigabeLadenFn } = await import(
        "@/lib/dokument-postfach/server-fn"
      );
      const liste = await dokumentRechnungsfreigabeLadenFn({
        data: { supabaseAccessToken: token },
      });
      setEintraege(liste);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLaedt(false);
    }
  }, [token]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const nachSpalte = useMemo(() => {
    const map = Object.fromEntries(
      FREIGABE_STATUS_SPALTEN.map((s) => [s, [] as DokumentPosteingangEintrag[]]),
    ) as Record<DokumentFreigabeStatus, DokumentPosteingangEintrag[]>;

    for (const e of eintraege) {
      const s = e.freigabeStatus ?? "neu";
      map[s]?.push(e);
    }
    return map;
  }, [eintraege]);

  const verschieben = useCallback(
    async (ziel: DokumentFreigabeStatus, eintragId: string) => {
      const aktuell = eintraege.find((e) => e.id === eintragId);
      if (!aktuell) return;
      const von = aktuell.freigabeStatus ?? "neu";
      if (von === ziel) return;
      if (von === "erledigt") return;

      if (ziel === "an_datev") {
        if (!kannDatev) {
          toast.error("Keine Berechtigung für DATEV.");
          return;
        }
      } else if (ziel === "erledigt") {
        return;
      } else if (!kannVerschieben) {
        toast.error("Keine Berechtigung zum Verschieben.");
        return;
      }

      setBusyId(eintragId);
      try {
        const { dokumentRechnungsfreigabeVerschiebenFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        const ergebnis = await dokumentRechnungsfreigabeVerschiebenFn({
          data: {
            supabaseAccessToken: token,
            eintragId,
            freigabeStatus: ziel,
          },
        });

        setEintraege((prev) => {
          const ohne = prev.filter((e) => e.id !== eintragId);
          return [...ohne, ergebnis.eintrag];
        });

        if (ergebnis.gebucht) {
          toast.success(`Zu DATEV: ${ergebnis.gebucht.ordnerPfad}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Verschieben fehlgeschlagen.");
        void laden();
      } finally {
        setBusyId(null);
      }
    },
    [eintraege, kannDatev, kannVerschieben, laden, token],
  );

  return (
    <>
      <PageHeader
        titel="Rechnungsfreigabe"
        aktionen={
          <Button
            variant="outline"
            size="sm"
            className="border-foreground text-foreground"
            disabled={laedt || !token}
            onClick={() => void laden()}
          >
            {laedt ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" strokeWidth={1.5} />
            )}
            Aktualisieren
          </Button>
        }
      />
      <PageWrapper>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {FREIGABE_STATUS_SPALTEN.map((status) => {
              const dropErlaubt =
                status !== "erledigt" &&
                (status === "an_datev" ? kannDatev : kannVerschieben);
              return (
                <Spalte
                  key={status}
                  status={status}
                  eintraege={nachSpalte[status]}
                  dropErlaubt={dropErlaubt}
                  busyId={busyId}
                  onDrop={(s, id) => void verschieben(s, id)}
                  onDragStart={() => undefined}
                />
              );
            })}
          </div>
      </PageWrapper>
    </>
  );
}
