import { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { FileQuestion, FileText, Image, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth, usePermissions } from "@/hooks/useAuth";
import type { GraphAnhangArt, GraphNachricht } from "@/lib/microsoft/graph";
import { base64ZuBytes, felderZuWerten, hatWerte } from "@/lib/postfach/client";
import type { PostfachEintrag } from "@/lib/postfach/typen";
import {
  istSalesforceVerbunden,
  speichereExposeSalesforceDraft,
  speichereExposeSalesforceDraftPdf,
} from "@/lib/salesforce";

import { SalesforceConnectDialog } from "./expose-import/SalesforceConnectDialog";

/** Analyse-Runden: je eine Mail, nacheinander — bis Posteingang leer oder Limit. */
const MAX_ANALYSE_RUNDEN = 50;

type Zeile = {
  nachricht: GraphNachricht;
  eintrag: PostfachEintrag | null;
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
  onWiederholen?: (eintrag: PostfachEintrag) => void;
}) {
  const { nachricht, eintrag } = zeile;

  if (!nachricht.pdfAnhang) {
    return <span className="text-text-subtle">Kein PDF</span>;
  }
  if (!eintrag || eintrag.status === "neu") {
    return (
      <span className="inline-flex items-center gap-2 text-text-muted">
        <Loader2
          className="h-3.5 w-3.5 animate-spin"
          strokeWidth={1.5}
          aria-hidden
        />
        KI-Analyse
      </span>
    );
  }
  if (eintrag.status === "fehler") {
    const laedt = wiederholenId === eintrag.id;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="text-destructive"
          title={eintrag.analyseFehler ?? undefined}
        >
          Analyse fehlgeschlagen
        </span>
        {onWiederholen ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-text-muted hover:bg-surface hover:text-heading hover:ring-1 hover:ring-inset hover:ring-hairline"
            disabled={Boolean(wiederholenId)}
            aria-label="KI-Analyse wiederholen"
            onClick={(e) => {
              e.stopPropagation();
              onWiederholen(eintrag);
            }}
          >
            {laedt ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                strokeWidth={1.5}
                aria-hidden
              />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            )}
          </Button>
        ) : null}
      </span>
    );
  }
  if (eintrag.status === "exportiert") {
    return <span className="text-text-muted">Exportiert</span>;
  }
  return <span className="font-medium text-heading">Analysiert</span>;
}

export function TransaktionslistePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { darfAktion } = usePermissions();
  const token = session?.access_token ?? "";
  /** Ändert sich bei jedem Öffnen der Route (inkl. Soft-Navigation / Reload). */
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
  const [aktionId, setAktionId] = useState<string | null>(null);
  const [wiederholenId, setWiederholenId] = useState<string | null>(null);
  const [sfConnectOpen, setSfConnectOpen] = useState(false);

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
      nachrichten: GraphNachricht[],
      eintraege: PostfachEintrag[],
    ) => {
      const nachId = new Map(eintraege.map((e) => [e.graphNachrichtId, e]));
      setZeilen(
        nachrichten.map((n) => ({
          nachricht: n,
          eintrag: nachId.get(n.id) ?? null,
        })),
      );
    };

    void (async () => {
      try {
        const { postfachSyncFn } = await import("@/lib/postfach/server-fn");

        // Erster Lauf ohne Analyse: Liste erscheint sofort.
        const erst = await postfachSyncFn({
          data: { supabaseAccessToken: token, maxAnalysen: 0 },
        });
        if (cancelled) return;
        uebernehmen(erst.nachrichten, erst.eintraege);
        setLaedt(false);

        let offen = erst.offen;
        for (let runde = 0; offen > 0 && runde < MAX_ANALYSE_RUNDEN; runde++) {
          setAnalyseLaeuft(true);
          // Eine Mail pro Runde — await, nie parallel.
          const weiter = await postfachSyncFn({
            data: { supabaseAccessToken: token, maxAnalysen: 1 },
          });
          if (cancelled) return;
          if (weiter.eintraege.length > 0) {
            setZeilen((prev) =>
              prev.map((z) => {
                const update = weiter.eintraege.find(
                  (e) => e.graphNachrichtId === z.nachricht.id,
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
          e instanceof Error
            ? e.message
            : "Postfach konnte nicht geladen werden.",
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
  }, [token, besuchKey]);

  const pruefen = useCallback(
    (eintrag: PostfachEintrag) => {
      void navigate({
        to: "/transaktionen/expose-import",
        search: { postfach: eintrag.id },
      });
    },
    [navigate],
  );

  const exportieren = useCallback(
    async (eintrag: PostfachEintrag) => {
      if (!istSalesforceVerbunden()) {
        if (
          darfAktion("aktion.transaktionen.expose_import.salesforce_session")
        ) {
          setSfConnectOpen(true);
        } else {
          toast.error("Nicht mit Salesforce verbunden.");
        }
        return;
      }

      setAktionId(eintrag.id);
      try {
        const { postfachEintragFn } = await import("@/lib/postfach/server-fn");
        const { pdf } = await postfachEintragFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });

        const draft = speichereExposeSalesforceDraft({
          dateiname: pdf.dateiname,
          felder: felderZuWerten(eintrag.felder),
          postfachEintragId: eintrag.id,
        });
        speichereExposeSalesforceDraftPdf({
          draftId: draft.id,
          dateiname: pdf.dateiname,
          mimeType: pdf.mimeType,
          bytes: base64ZuBytes(pdf.base64),
        });

        await navigate({
          to: "/transaktionen/expose-import/salesforce",
          search: { draft: draft.id },
        });
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Export konnte nicht gestartet werden.",
        );
      } finally {
        setAktionId(null);
      }
    },
    [darfAktion, navigate, token],
  );

  const analyseWiederholen = useCallback(
    async (eintrag: PostfachEintrag) => {
      setWiederholenId(eintrag.id);
      try {
        const { postfachAnalyseWiederholenFn } = await import(
          "@/lib/postfach/server-fn"
        );
        const aktualisiert = await postfachAnalyseWiederholenFn({
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
          toast.error("KI-Analyse fehlgeschlagen.", {
            description: aktualisiert.analyseFehler ?? undefined,
            duration: 12_000,
          });
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
      render: (z) => {
        const sender =
          z.nachricht.absenderName?.trim() || z.nachricht.absenderMail || "–";
        return (
          <span
            className="block max-w-[11rem] truncate font-medium text-heading"
            title={sender}
          >
            {sender}
          </span>
        );
      },
    },
    {
      key: "betreff",
      header: "Betreff",
      className: "max-w-0 w-full",
      render: (z) => (
        <span
          className="block max-w-xl truncate"
          title={z.nachricht.betreff ?? undefined}
        >
          {z.nachricht.betreff?.trim() || "(kein Betreff)"}
        </span>
      ),
    },
    {
      key: "status",
      header: "KI-Status",
      render: (z) => (
        <AnalyseStatus
          zeile={z}
          wiederholenId={wiederholenId}
          onWiederholen={
            darfAktion("aktion.transaktionen.liste.analyse_wiederholen")
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
      key: "aktionen",
      header: "",
      align: "right",
      render: (z) => {
        const eintrag = z.eintrag;
        const bereit = Boolean(
          eintrag &&
          (eintrag.status === "analysiert" ||
            eintrag.status === "exportiert") &&
          hatWerte(eintrag.felder),
        );
        const laedtZeile = aktionId === eintrag?.id;

        return (
          <div className="flex items-center justify-end gap-2">
            <PermissionGate
              berechtigung="aktion.transaktionen.liste.pruefen"
              skeletonClassName="w-16"
            >
              <Button
                size="sm"
                variant="outline"
                className="border-foreground text-foreground"
                disabled={!bereit || Boolean(aktionId)}
                onClick={() => eintrag && pruefen(eintrag)}
              >
                Check
              </Button>
            </PermissionGate>
            <PermissionGate
              berechtigung="aktion.transaktionen.liste.exportieren"
              skeletonClassName="w-16"
            >
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-heading"
                disabled={!bereit || Boolean(aktionId)}
                onClick={() => eintrag && void exportieren(eintrag)}
              >
                {laedtZeile ? (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    strokeWidth={1.5}
                  />
                ) : null}
                Export
              </Button>
            </PermissionGate>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        titel="Offene Exposés"
        nebenTitel={
          analyseLaeuft ? (
            <span className="inline-flex items-center gap-2 text-xs text-text-muted">
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                strokeWidth={1.5}
                aria-hidden
              />
              KI-Analyse läuft
            </span>
          ) : undefined
        }
      />
      <SalesforceConnectDialog
        open={sfConnectOpen}
        onOpenChange={setSfConnectOpen}
      />
      <PageWrapper>
        <DataTable
          spalten={spalten}
          zeilen={zeilen}
          isLoading={laedt}
          isEmpty={!laedt && (Boolean(fehler) || zeilen.length === 0)}
          emptyTitel={fehler ?? "Keine Nachrichten"}
          rowKey={(z) => z.nachricht.id}
        />
      </PageWrapper>
    </>
  );
}
