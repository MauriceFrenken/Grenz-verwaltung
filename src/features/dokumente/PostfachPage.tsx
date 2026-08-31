import { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  FileQuestion,
  FileText,
  HardDriveUpload,
  Image,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth, usePermissions } from "@/hooks/useAuth";
import { hatAnalyseWerte } from "@/lib/dokument-postfach/client";
import type { DokumentPosteingangEintrag } from "@/lib/dokument-postfach/typen";
import type { DokumentPosteingangNachricht } from "@/lib/microsoft/ablage";
import type { GraphAnhangArt } from "@/lib/microsoft/graph";
import { cn } from "@/lib/utils";

const MAX_ANALYSE_RUNDEN = 50;

type Zeile = {
  nachricht: DokumentPosteingangNachricht;
  eintrag: DokumentPosteingangEintrag | null;
};

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

function AnhangIcon({ art }: { art: GraphAnhangArt }) {
  const Icon = art === "pdf" ? FileText : art === "bild" ? Image : FileQuestion;
  const label = art === "pdf" ? "PDF" : art === "bild" ? "Bild" : "Kein Anhang";
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center text-text-muted"
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    </span>
  );
}

function AnalyseStatus({
  zeile,
  wiederholenId,
  onWiederholen,
}: {
  zeile: Zeile;
  wiederholenId: string | null;
  onWiederholen?: (eintrag: DokumentPosteingangEintrag) => void;
}) {
  const { nachricht, eintrag } = zeile;

  if (!nachricht.pdfAnhang) {
    return <span className="text-text-subtle">Kein PDF</span>;
  }
  if (!eintrag || eintrag.status === "neu") {
    return (
      <span className="inline-flex items-center gap-2 text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
        KI-Analyse
      </span>
    );
  }
  if (eintrag.status === "fehler") {
    const laedt = wiederholenId === eintrag.id;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-destructive" title={eintrag.analyseFehler ?? undefined}>
          Analyse fehlgeschlagen
        </span>
        {onWiederholen ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-text-muted hover:bg-surface hover:text-heading"
            disabled={Boolean(wiederholenId)}
            aria-label="KI-Analyse wiederholen"
            onClick={(e) => {
              e.stopPropagation();
              onWiederholen(eintrag);
            }}
          >
            {laedt ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            )}
          </Button>
        ) : null}
      </span>
    );
  }
  if (eintrag.status === "abgelegt") {
    return <span className="text-text-muted">Abgelegt</span>;
  }
  if (eintrag.status === "gebucht") {
    return <span className="text-text-muted">Gebucht</span>;
  }
  if (eintrag.istRechnung) {
    return <span className="font-medium text-heading">Rechnung</span>;
  }
  return <span className="font-medium text-heading">Analysiert</span>;
}

export function PostfachPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { darfAktion } = usePermissions();
  const token = session?.access_token ?? "";
  const darfAblegen = darfAktion("aktion.dokumente.pruefordner.ablegen");

  const besuchKey = useRouterState({
    select: (s) =>
      s.location.state.__TSR_key ??
      s.location.state.key ??
      `${s.location.pathname}:${s.location.href}`,
  });

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [analyseLaeuft, setAnalyseLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [ablegenId, setAblegenId] = useState<string | null>(null);
  const [wiederholenId, setWiederholenId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setZeilen([]);
      setFehler(null);
      setLaedt(false);
      return;
    }

    let cancelled = false;
    setLaedt(true);
    setFehler(null);

    const uebernehmen = (
      nachrichten: DokumentPosteingangNachricht[],
      eintraege: DokumentPosteingangEintrag[],
    ) => {
      const nachId = new Map(
        eintraege.map((e) => [`${e.postfach}:${e.graphNachrichtId}`, e]),
      );
      setZeilen(
        nachrichten.map((n) => ({
          nachricht: n,
          eintrag: nachId.get(`${n.postfach}:${n.id}`) ?? null,
        })),
      );
    };

    void (async () => {
      try {
        const { dokumentPosteingangSyncFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );

        const erst = await dokumentPosteingangSyncFn({
          data: { supabaseAccessToken: token, maxAnalysen: 0 },
        });
        if (cancelled) return;
        uebernehmen(erst.nachrichten, erst.eintraege);
        setLaedt(false);

        let offen = erst.offen;
        for (let runde = 0; offen > 0 && runde < MAX_ANALYSE_RUNDEN; runde++) {
          setAnalyseLaeuft(true);
          const weiter = await dokumentPosteingangSyncFn({
            data: { supabaseAccessToken: token, maxAnalysen: 1 },
          });
          if (cancelled) return;
          if (weiter.eintraege.length > 0) {
            setZeilen((prev) =>
              prev.map((z) => {
                const update = weiter.eintraege.find(
                  (e) =>
                    e.graphNachrichtId === z.nachricht.id &&
                    e.postfach === z.nachricht.postfach,
                );
                return update ? { ...z, eintrag: update } : z;
              }),
            );
          }
          offen = weiter.offen;
        }
      } catch (e) {
        if (cancelled) return;
        setZeilen([]);
        setFehler(
          e instanceof Error ? e.message : "Postfach konnte nicht geladen werden.",
        );
      } finally {
        if (!cancelled) {
          setLaedt(false);
          setAnalyseLaeuft(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, besuchKey, reloadKey]);

  const pruefen = useCallback(
    (eintrag: DokumentPosteingangEintrag) => {
      void navigate({
        to: "/dokumente/pruefung",
        search: { postfach: eintrag.id },
      });
    },
    [navigate],
  );

  const analyseWiederholen = useCallback(
    async (eintrag: DokumentPosteingangEintrag) => {
      setWiederholenId(eintrag.id);
      try {
        const { dokumentPosteingangAnalyseWiederholenFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        const aktualisiert = await dokumentPosteingangAnalyseWiederholenFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });
        setZeilen((prev) =>
          prev.map((z) =>
            z.eintrag?.id === aktualisiert.id
              ? { ...z, eintrag: aktualisiert }
              : z,
          ),
        );
        if (aktualisiert.status === "fehler") {
          toast.error("KI-Analyse erneut fehlgeschlagen.");
        }
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "KI-Analyse konnte nicht wiederholt werden.",
        );
      } finally {
        setWiederholenId(null);
      }
    },
    [token],
  );

  async function schnellAblegen(nachricht: DokumentPosteingangNachricht) {
    if (!token || !darfAblegen) return;
    setAblegenId(`${nachricht.postfach}:${nachricht.id}`);
    try {
      const { microsoftAnhangAblegenFn } = await import(
        "@/lib/microsoft/server-fn"
      );
      const result = await microsoftAnhangAblegenFn({
        data: {
          supabaseAccessToken: token,
          nachrichtId: nachricht.id,
          postfach: nachricht.postfach,
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

  const spalten: Column<Zeile>[] = [
    {
      key: "anhang",
      header: "",
      className: "w-10 pr-0",
      render: (z) => <AnhangIcon art={z.nachricht.anhangArt} />,
    },
    {
      key: "absender",
      header: "Absender",
      className: "max-w-[11rem]",
      render: (z) => (
        <span className="truncate block" title={z.nachricht.absenderMail ?? undefined}>
          {z.nachricht.absenderName || z.nachricht.absenderMail || "–"}
        </span>
      ),
    },
    {
      key: "betreff",
      header: "Betreff",
      className: "max-w-0 w-full",
      render: (z) => (
        <span className="truncate block font-medium text-heading">
          {z.nachricht.betreff || "(kein Betreff)"}
        </span>
      ),
    },
    {
      key: "typ",
      header: "Typ",
      render: (z) => {
        const e = z.eintrag;
        if (!e || e.status === "neu") return <span className="text-text-subtle">–</span>;
        if (e.istRechnung) return <span className="text-heading">Rechnung</span>;
        if (e.status === "analysiert") return <span className="text-text-muted">Dokument</span>;
        return <span className="text-text-subtle">–</span>;
      },
    },
    {
      key: "status",
      header: "KI-Status",
      render: (z) => (
        <AnalyseStatus
          zeile={z}
          wiederholenId={wiederholenId}
          onWiederholen={
            darfAktion("aktion.dokumente.pruefordner.analyse_wiederholen")
              ? analyseWiederholen
              : undefined
          }
        />
      ),
    },
    {
      key: "datum",
      header: "Datum",
      align: "right",
      render: (z) => (
        <span className="text-text-muted">
          {formatEingangsdatum(z.nachricht.eingegangenAm)}
        </span>
      ),
    },
    {
      key: "aktion",
      header: "",
      align: "right",
      render: (z) => {
        const eintrag = z.eintrag;
        const bereit = Boolean(
          eintrag &&
          eintrag.status === "analysiert" &&
          hatAnalyseWerte(eintrag.felder),
        );

        return (
          <div className="flex items-center justify-end gap-2">
            <PermissionGate
              berechtigung="aktion.dokumente.pruefordner.pruefen"
              skeletonClassName="w-16"
            >
              <Button
                size="sm"
                variant="outline"
                className="border-foreground text-foreground"
                disabled={!bereit}
                onClick={() => eintrag && pruefen(eintrag)}
              >
                Check
              </Button>
            </PermissionGate>
            {darfAblegen && !bereit ? (
              <PermissionGate berechtigung="aktion.dokumente.pruefordner.ablegen">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-foreground text-foreground"
                  disabled={Boolean(ablegenId)}
                  aria-label="Schnell ablegen"
                  onClick={(e) => {
                    e.stopPropagation();
                    void schnellAblegen(z.nachricht);
                  }}
                >
                  {ablegenId === `${z.nachricht.postfach}:${z.nachricht.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <HardDriveUpload className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </Button>
              </PermissionGate>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        titel="Postfach"
        nebenTitel={
          analyseLaeuft ? (
            <span className="inline-flex items-center gap-2 text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
              KI-Analyse läuft
            </span>
          ) : undefined
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
        {fehler ? (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {fehler}
          </p>
        ) : null}
        <DataTable
          spalten={spalten}
          zeilen={zeilen}
          isLoading={laedt}
          isEmpty={!laedt && !fehler && zeilen.length === 0}
          emptyTitel="Keine Nachrichten mit Anhang"
          rowKey={(z) => `${z.nachricht.postfach}:${z.nachricht.id}`}
        />
      </PageWrapper>
    </>
  );
}
