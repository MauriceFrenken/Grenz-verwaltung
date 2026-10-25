import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Radar, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { euroKurz } from "@/features/kennzahlen/hilfen";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";
import type { RadarDto } from "@/lib/markt-radar/server-fn";
import type {
  RadarMeldung,
  RadarSeite,
  RadarStatus,
} from "@/lib/markt-radar/typen";
import { cn } from "@/lib/utils";

const FILTER = [
  { id: "offen", label: "Offen" },
  { id: "relevant", label: "Relevanz ab 60" },
  { id: "neu_in_sf", label: "Nicht in Salesforce" },
  { id: "alle", label: "Alle inkl. verworfen" },
] as const;

type FilterId = (typeof FILTER)[number]["id"];

function RelevanzPunkt({ wert }: { wert: number }) {
  const ton =
    wert >= 75
      ? "bg-emerald-600 text-white"
      : wert >= 50
        ? "bg-amber-500 text-white"
        : "bg-surface-muted text-text-muted";
  return (
    <span
      className={cn(
        "inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
        ton,
      )}
      title="Relevanz für Grenz & Co. (0 bis 100)"
    >
      {wert}
    </span>
  );
}

function Zeile({
  m,
  busy,
  onStatus,
}: {
  m: RadarMeldung;
  busy: boolean;
  onStatus: (status: RadarStatus) => void;
}) {
  const eckdaten = [
    m.akteurTyp,
    m.transaktion,
    m.objektart,
    m.ort,
    m.volumenEur ? euroKurz(m.volumenEur) : null,
    m.ereignisAm ? formatDate(m.ereignisAm) : null,
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "flex gap-4 border-t border-hairline px-5 py-4",
        m.status === "verworfen" && "opacity-55",
      )}
    >
      <RelevanzPunkt wert={m.relevanz} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-heading">{m.akteur}</span>
          {m.status === "neu" ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
              neu
            </span>
          ) : null}
          {m.sfKontaktSfId ? (
            <span
              className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-text-muted"
              title={`In Salesforce: ${m.sfBekanntAls ?? m.sfKontaktSfId}`}
            >
              in Salesforce
            </span>
          ) : (
            <span className="rounded-full border border-amber-300 px-2 py-0.5 text-[11px] text-amber-800">
              noch nicht in Salesforce
            </span>
          )}
        </div>
        <p className="text-sm text-heading">{m.ereignis}</p>
        {eckdaten.length ? (
          <p className="text-xs text-text-subtle">{eckdaten.join(" · ")}</p>
        ) : null}
        {m.begruendung ? (
          <p className="text-xs text-text-muted">
            <span className="font-medium">Warum relevant: </span>
            {m.begruendung}
          </p>
        ) : null}
        <a
          href={m.quelleUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 self-start text-xs text-brand-text hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          {m.quelleMedium ?? new URL(m.quelleUrl).hostname}
          {m.quelleTitel ? `: ${m.quelleTitel}` : ""}
        </a>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[11px] text-text-subtle">
          {formatDate(m.createdAt)}
        </span>
        <div className="flex gap-1">
          {m.status === "verworfen" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onStatus("neu")}
              title="Wiederherstellen"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          ) : (
            <>
              {m.status === "neu" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onStatus("gesehen")}
                  title="Als gesehen markieren"
                >
                  <Check className="h-4 w-4" />
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onStatus("verworfen")}
                title="Nicht relevant"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** Meldungen des Markt-Radars für eine Seite, mit Filter und manuellem Suchlauf. */
export function RadarListe({ seite }: { seite: RadarSeite }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterId>("offen");
  const [dto, setDto] = useState<RadarDto | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suchtGerade, setSuchtGerade] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { radarLadenFn } = await import("@/lib/markt-radar/server-fn");
      setDto(
        await radarLadenFn({
          data: {
            supabaseAccessToken: token,
            seite,
            mitVerworfenen: filter === "alle",
          },
        }),
      );
      setFehler(null);
    } catch (e) {
      setFehler(
        e instanceof Error ? e.message : "Radar konnte nicht geladen werden.",
      );
    }
  }, [token, seite, filter]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const sichtbar = useMemo(() => {
    const liste = dto?.meldungen ?? [];
    if (filter === "relevant") return liste.filter((m) => m.relevanz >= 60);
    if (filter === "neu_in_sf") return liste.filter((m) => !m.sfKontaktSfId);
    return liste;
  }, [dto, filter]);

  const statusSetzen = async (m: RadarMeldung, status: RadarStatus) => {
    setBusyId(m.id);
    try {
      const { radarStatusSetzenFn } =
        await import("@/lib/markt-radar/server-fn");
      await radarStatusSetzenFn({
        data: { supabaseAccessToken: token, id: m.id, status },
      });
      setDto((d) =>
        d
          ? {
              ...d,
              meldungen: d.meldungen
                .map((x) => (x.id === m.id ? { ...x, status } : x))
                .filter((x) => filter === "alle" || x.status !== "verworfen"),
            }
          : d,
      );
      void queryClient.invalidateQueries({ queryKey: ["nav-zaehler"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status nicht gespeichert.");
    } finally {
      setBusyId(null);
    }
  };

  const jetztSuchen = async () => {
    setSuchtGerade(true);
    try {
      const { radarJetztSuchenFn } =
        await import("@/lib/markt-radar/server-fn");
      const e = await radarJetztSuchenFn({
        data: { supabaseAccessToken: token },
      });
      toast.success(
        `${e.neu} neue Meldung${e.neu === 1 ? "" : "en"} (Käufer und Verkäufer).`,
      );
      await laden();
      void queryClient.invalidateQueries({ queryKey: ["nav-zaehler"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suche fehlgeschlagen.");
    } finally {
      setSuchtGerade(false);
    }
  };

  const lauf = dto?.letzterLauf;

  return (
    <section className="flex flex-col border border-hairline bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-heading">
            Markt-Radar: aktive {seite === "kaeufer" ? "Käufer" : "Verkäufer"}{" "}
            aus den News
          </h2>
          <p className="text-xs text-text-subtle">
            Claude durchsucht jeden Morgen um 6 Uhr Immobiliennews mit
            Schwerpunkt Düsseldorf und NRW.{" "}
            {lauf
              ? lauf.status === "fehler"
                ? `Letzter Lauf am ${formatDate(lauf.gestartetAm)} fehlgeschlagen: ${lauf.fehler ?? "unbekannter Fehler"}`
                : lauf.status === "laeuft"
                  ? "Ein Lauf ist gerade aktiv."
                  : `Letzter Lauf ${formatDate(lauf.gestartetAm)}: ${lauf.anzahlNeu} neu.`
              : "Noch kein Lauf."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void jetztSuchen()}
          disabled={suchtGerade || !token}
        >
          {suchtGerade ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Radar className="h-4 w-4" />
          )}
          {suchtGerade ? "Sucht (einige Minuten)…" : "Jetzt suchen"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 border-t border-hairline px-5 py-2">
        {FILTER.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              filter === f.id
                ? "bg-heading text-surface"
                : "text-text-muted hover:bg-surface-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {fehler ? (
        <p className="border-t border-hairline px-5 py-6 text-sm text-text-muted">
          {fehler}
        </p>
      ) : !dto ? (
        <div className="border-t border-hairline px-5 py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : sichtbar.length ? (
        <ul>
          {sichtbar.map((m) => (
            <Zeile
              key={m.id}
              m={m}
              busy={busyId === m.id}
              onStatus={(s) => void statusSetzen(m, s)}
            />
          ))}
        </ul>
      ) : (
        <p className="border-t border-hairline px-5 py-6 text-sm text-text-muted">
          Keine Meldungen für diesen Filter. Der nächste Lauf ist morgen früh,
          oder „Jetzt suchen“.
        </p>
      )}
    </section>
  );
}
