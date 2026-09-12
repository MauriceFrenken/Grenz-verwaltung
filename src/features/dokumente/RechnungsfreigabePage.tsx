import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { useAuth, usePermissions } from "@/hooks/useAuth";
import {
  FREIGABE_STATUS_LABELS,
  FREIGABE_STATUS_SPALTEN,
  RECHNUNG_HISTORIE_TAGE,
  type DokumentFreigabeStatus,
  type DokumentPosteingangEintrag,
  type RechnungHistorieEintrag,
} from "@/lib/dokument-postfach/typen";
import { cn } from "@/lib/utils";

function betragText(
  betrag: string | null | undefined,
  waehrung: string | null | undefined,
): string {
  const wert = betrag?.trim();
  if (!wert) return "–";
  return `${wert} ${waehrung?.trim() || "EUR"}`;
}

function kurzDatum(iso: string | null): string {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return "–";
  }
}

function DuplikatHinweis({ eintrag }: { eintrag: DokumentPosteingangEintrag }) {
  const hinweis = eintrag.duplikatHinweis;
  if (!hinweis?.treffer?.length) return null;

  const treffer = hinweis.treffer[0];
  const wann = kurzDatum(treffer.datum);

  return (
    <p
      className="mt-2 flex items-start gap-1.5 border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive"
      role="alert"
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
      <span>
        Nr. {hinweis.rechnungsnummer} schon am {wann}
        {treffer.quelle === "datev" ? " an DATEV" : " eingegangen"}
        {hinweis.treffer.length > 1 ? ` (+${hinweis.treffer.length - 1})` : ""}
      </span>
    </p>
  );
}

function Karte({
  eintrag,
  disabled,
  laedt,
  onDragStart,
}: {
  eintrag: DokumentPosteingangEintrag;
  disabled: boolean;
  laedt: boolean;
  onDragStart: (id: string) => void;
}) {
  return (
    <div
      draggable={!disabled && !laedt}
      onDragStart={(e) => {
        if (disabled || laedt) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", eintrag.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(eintrag.id);
      }}
      className={cn(
        "relative border border-hairline bg-surface p-3 text-left",
        !disabled && !laedt && "cursor-grab active:cursor-grabbing",
        (disabled || laedt) && "opacity-70",
      )}
      aria-busy={laedt || undefined}
    >
      {laedt ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80"
          role="status"
          aria-label="Wird an DATEV gesendet"
        >
          <Loader2 className="h-5 w-5 animate-spin text-heading" strokeWidth={1.5} />
        </div>
      ) : null}
      <p className="line-clamp-2 text-sm font-medium text-heading">
        {eintrag.felder?.rechnungssteller?.value?.trim() ||
          eintrag.anhangName ||
          eintrag.betreff ||
          "Rechnung"}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {eintrag.felder?.gesellschaftName?.value?.trim() || "–"}
      </p>
      <p className="mt-1 text-xs text-text-subtle">
        {betragText(
          eintrag.felder?.rechnungsbetrag?.value,
          eintrag.felder?.waehrung?.value,
        )}
      </p>
      {eintrag.felder?.rechnungsnummer?.value?.trim() ? (
        <p className="mt-0.5 text-xs text-text-subtle">
          Nr. {eintrag.felder.rechnungsnummer.value.trim()}
        </p>
      ) : null}
      <DuplikatHinweis eintrag={eintrag} />
      {!laedt ? (
        <Link
          to="/dokumente/pruefung"
          search={{ postfach: eintrag.id }}
          className="mt-2 inline-block text-xs text-text-muted underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Prüfen
        </Link>
      ) : null}
    </div>
  );
}

/** Bereits an DATEV gesendet — bleibt zur Kontrolle sichtbar, nicht verschiebbar. */
function HistorieKarte({ eintrag }: { eintrag: RechnungHistorieEintrag }) {
  return (
    <div className="border border-hairline border-dashed bg-surface p-3 text-left">
      <p className="line-clamp-2 text-sm font-medium text-heading">
        {eintrag.rechnungssteller?.trim() ||
          eintrag.anhangName ||
          eintrag.betreff ||
          "Rechnung"}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {eintrag.gesellschaftName?.trim() || "–"}
      </p>
      <p className="mt-1 text-xs text-text-subtle">
        {betragText(eintrag.rechnungsbetrag, eintrag.waehrung)}
      </p>
      {eintrag.rechnungsnummer?.trim() ? (
        <p className="mt-0.5 text-xs text-text-subtle">
          Nr. {eintrag.rechnungsnummer.trim()}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-text-muted">
        Gesendet {kurzDatum(eintrag.anDatevAm)}
      </p>
    </div>
  );
}

function Spalte({
  status,
  eintraege,
  historie,
  dropErlaubt,
  busyId,
  onDrop,
  onDragStart,
}: {
  status: DokumentFreigabeStatus;
  eintraege: DokumentPosteingangEintrag[];
  historie?: RechnungHistorieEintrag[];
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
          {historie ? (
            <span className="ml-2 normal-case tracking-normal text-text-subtle">
              {RECHNUNG_HISTORIE_TAGE} Tage
            </span>
          ) : null}
        </h3>
        <span className="text-xs text-text-subtle">
          {eintraege.length + (historie?.length ?? 0)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {eintraege.map((e) => (
          <Karte
            key={e.id}
            eintrag={e}
            disabled={busyId !== null && busyId !== e.id}
            laedt={busyId === e.id}
            onDragStart={onDragStart}
          />
        ))}
        {historie?.map((h) => (
          <HistorieKarte key={h.id} eintrag={h} />
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
  const [historie, setHistorie] = useState<RechnungHistorieEintrag[]>([]);
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
      const daten = await dokumentRechnungsfreigabeLadenFn({
        data: { supabaseAccessToken: token },
      });
      setEintraege(daten.eintraege);
      setHistorie(daten.historie);
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
      let s = e.freigabeStatus ?? "neu";
      if (s === "freigegeben") s = "in_pruefung";
      if (s === "erledigt") continue;
      if (!map[s]) continue;
      map[s].push(e);
    }
    return map;
  }, [eintraege]);

  const verschieben = useCallback(
    async (ziel: DokumentFreigabeStatus, eintragId: string) => {
      const aktuell = eintraege.find((e) => e.id === eintragId);
      if (!aktuell) return;
      if (busyId) return;
      const von = aktuell.freigabeStatus ?? "neu";
      if (von === ziel) return;
      if (von === "erledigt") return;

      if (ziel === "an_datev") {
        if (!kannDatev) {
          toast.error("Keine Berechtigung für DATEV.");
          return;
        }
      } else if (ziel === "erledigt" || ziel === "freigegeben") {
        return;
      } else if (!kannVerschieben) {
        toast.error("Keine Berechtigung zum Verschieben.");
        return;
      }

      setBusyId(eintragId);
      // Sofort in Zielspalte zeigen (bei DATEV mit Spinner), erst bei Erfolg entfernen
      setEintraege((prev) =>
        prev.map((e) =>
          e.id === eintragId ? { ...e, freigabeStatus: ziel } : e,
        ),
      );

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

        if (ergebnis.entfernt) {
          setEintraege((prev) => prev.filter((e) => e.id !== eintragId));
          const gemerkt = ergebnis.gebucht.historie;
          if (gemerkt) {
            setHistorie((prev) => [
              gemerkt,
              ...prev.filter((h) => h.id !== gemerkt.id),
            ]);
          }
          toast.success(`Zu DATEV: ${ergebnis.gebucht.ordnerPfad}`);
        } else {
          setEintraege((prev) =>
            prev.map((e) => (e.id === eintragId ? ergebnis.eintrag : e)),
          );
        }
      } catch (e) {
        // Bei Fehler: Karte zurück in die Ausgangsspalte
        setEintraege((prev) =>
          prev.map((e) =>
            e.id === eintragId ? { ...e, freigabeStatus: von } : e,
          ),
        );
        toast.error(e instanceof Error ? e.message : "Verschieben fehlgeschlagen.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, eintraege, kannDatev, kannVerschieben, token],
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
                busyId === null &&
                (status === "an_datev" ? kannDatev : kannVerschieben);
              return (
                <Spalte
                  key={status}
                  status={status}
                  eintraege={nachSpalte[status] ?? []}
                  historie={status === "an_datev" ? historie : undefined}
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
