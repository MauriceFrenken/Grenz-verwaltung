import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileQuestion, FileText, Image, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  GRAPH_GC_MS,
  GRAPH_STALE_MS,
  graphKeys,
  holeExposePostfach,
} from "@/lib/graph-cache";
import type { GraphAnhangArt, GraphNachricht } from "@/lib/microsoft/graph";
import { base64ZuBytes, felderZuWerten, hatWerte } from "@/lib/postfach/client";
import {
  setzeCheckPdfPromise,
  speichereCheckHandoff,
} from "@/lib/postfach/check-handoff";
import type { PostfachEintrag, PostfachSyncErgebnis } from "@/lib/postfach/typen";
import {
  istSalesforceVerbunden,
  speichereExposeSalesforceDraft,
  speichereExposeSalesforceDraftPdf,
} from "@/lib/salesforce";

import { SalesforceConnectDialog } from "./expose-import/SalesforceConnectDialog";

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

function AnhangIcon({
  art,
  dateiname,
}: {
  art: GraphAnhangArt;
  dateiname?: string | null;
}) {
  const Icon =
    art === "pdf" || art === "office" || art === "datei"
      ? FileText
      : art === "bild"
        ? Image
        : FileQuestion;
  const label =
    art === "pdf"
      ? "PDF"
      : art === "office"
        ? "Office"
        : art === "bild"
          ? "Bild"
          : art === "datei"
            ? dateiname?.trim() || "Datei"
            : "Kein Anhang";
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
    return <span className="text-text-muted">Offen</span>;
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

function zuZeilen(daten: PostfachSyncErgebnis): Zeile[] {
  const nachId = new Map(daten.eintraege.map((e) => [e.graphNachrichtId, e]));
  return daten.nachrichten.map((n) => ({
    nachricht: n,
    eintrag: nachId.get(n.id) ?? null,
  }));
}

export function TransaktionslistePage() {
  const { session, benutzer } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = session?.access_token ?? "";
  const userId = benutzer?.id ?? "";
  const queryKey = graphKeys.exposePostfach(userId);

  const [aktionId, setAktionId] = useState<string | null>(null);
  const [wiederholenId, setWiederholenId] = useState<string | null>(null);
  const [sfConnectOpen, setSfConnectOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      holeExposePostfach(token, (snap) => {
        queryClient.setQueryData(queryKey, snap);
      }),
    enabled: Boolean(token && userId),
    staleTime: GRAPH_STALE_MS,
    gcTime: GRAPH_GC_MS,
  });

  const zeilen = useMemo(() => (data ? zuZeilen(data) : []), [data]);
  const laedt = isLoading && !data;
  const fehler =
    error instanceof Error
      ? error.message
      : error
        ? "Postfach konnte nicht geladen werden."
        : null;

  const setZeilen = useCallback(
    (next: Zeile[] | ((prev: Zeile[]) => Zeile[])) => {
      queryClient.setQueryData<PostfachSyncErgebnis>(queryKey, (prev) => {
        const basis =
          prev ??
          ({
            postfach: "",
            nachrichten: [],
            eintraege: [],
            offen: 0,
          } satisfies PostfachSyncErgebnis);
        const aktuell = zuZeilen(basis);
        const neu = typeof next === "function" ? next(aktuell) : next;
        return {
          ...basis,
          nachrichten: neu.map((z) => z.nachricht),
          eintraege: neu
            .map((z) => z.eintrag)
            .filter((e): e is PostfachEintrag => e != null),
        };
      });
    },
    [queryClient, queryKey],
  );

  const pruefen = useCallback(
    (eintrag: PostfachEintrag) => {
      speichereCheckHandoff(eintrag.id, {
        felder: eintrag.felder,
        anhangName: eintrag.anhangName,
      });
      if (token) {
        const pdfPromise = import("@/lib/postfach/server-fn").then(
          ({ postfachEintragFn }) =>
            postfachEintragFn({
              data: {
                supabaseAccessToken: token,
                eintragId: eintrag.id,
              },
            }),
        );
        setzeCheckPdfPromise(eintrag.id, pdfPromise);
        void pdfPromise.catch(() => {});
      }
      void navigate({
        to: "/transaktionen/expose-import",
        search: { postfach: eintrag.id },
      });
    },
    [navigate, token],
  );

  const exportieren = useCallback(
    async (eintrag: PostfachEintrag) => {
      if (!istSalesforceVerbunden()) {
        setSfConnectOpen(true);
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
    [navigate, token],
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
    [token, setZeilen],
  );

  const spalten: Column<Zeile>[] = [
    {
      key: "anhang",
      header: "",
      className: "w-10 pr-0",
      render: (z) => (
        <AnhangIcon
          art={z.nachricht.anhangArt}
          dateiname={z.nachricht.primaerAnhang?.name}
        />
      ),
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
          onWiederholen={analyseWiederholen}
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
            <Button
              size="sm"
              variant="outline"
              className="border-foreground text-foreground"
              disabled={!bereit || Boolean(aktionId)}
              onClick={() => eintrag && pruefen(eintrag)}
            >
              Check
            </Button>
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
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        titel="Offene Exposés"
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
