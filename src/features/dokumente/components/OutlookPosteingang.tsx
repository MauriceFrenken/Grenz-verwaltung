import { Loader2, Mail, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useApi } from "@/hooks/useApi";
import { dokumenteApi } from "@/api/dokumente";
import { einstellungenApi } from "@/api/einstellungen";
import { verwaltungApi } from "@/api/verwaltung";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { analysiereNachricht } from "../outlook/analysieren";
import { useOutlookConnection, useOutlookMessagesQuery } from "../outlook/hooks";
import type { OutlookMessageSummary, PosteingangAnalyseStatus } from "../outlook/types";

type OutlookPosteingangProps = {
  limit?: number;
  onAnalyseComplete?: () => void;
  onNachrichtOeffnen?: (nachrichtId: string) => void;
};

export function OutlookPosteingang({
  limit = 50,
  onAnalyseComplete,
  onNachrichtOeffnen,
}: OutlookPosteingangProps) {
  const { state: connection } = useOutlookConnection();
  const accountIds = useMemo(
    () => connection.accounts.map((a) => a.id),
    [connection.accounts],
  );
  const enabled = !connection.loading && connection.connected && accountIds.length > 0;

  const {
    data: messages,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useOutlookMessagesQuery(limit, enabled, accountIds);

  const [statusMap, setStatusMap] = useState<Record<string, PosteingangAnalyseStatus>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const { data: mandantenData } = useApi(() => einstellungenApi.listMandanten(), []);
  const { data: objekteData } = useApi(() => verwaltungApi.listObjekte(), []);

  const mandantNamen = useMemo(
    () => new Map((mandantenData?.items ?? []).map((m) => [m.id, m.name])),
    [mandantenData],
  );
  const objektNamen = useMemo(
    () => new Map((objekteData?.items ?? []).map((o) => [o.id, o.bezeichnung])),
    [objekteData],
  );

  useEffect(() => {
    if (!messages?.length) return;
    void dokumenteApi.listPosteingangStatuses(messages.map((m) => m.id)).then(setStatusMap);
  }, [messages]);

  const pendingCount = useMemo(
    () =>
      (messages ?? []).filter((m) => {
        const status = statusMap[m.id];
        return !status || status.status === "neu";
      }).length,
    [messages, statusMap],
  );

  const handleAnalyze = useCallback(async () => {
    if (!messages?.length || analyzing) return;
    setAnalyzing(true);
    let failures = 0;
    let analysiertCount = 0;

    try {
      for (const msg of messages) {
        const existing = statusMap[msg.id];
        if (existing && existing.status !== "neu") continue;

        try {
          const result = await analysiereNachricht(msg);
          setStatusMap((prev) => ({ ...prev, [msg.id]: result }));
          if (result.status === "analysiert") analysiertCount += 1;
        } catch (e) {
          failures += 1;
          if (failures === 1) {
            toast.error(e instanceof Error ? e.message : "KI-Analyse fehlgeschlagen");
          }
        }
      }

      if (failures === 0 && analysiertCount > 0) {
        toast.success(
          analysiertCount === 1
            ? "1 E-Mail analysiert."
            : `${analysiertCount} E-Mails analysiert.`,
        );
        onAnalyseComplete?.();
      }
    } finally {
      setAnalyzing(false);
    }
  }, [messages, statusMap, analyzing, onAnalyseComplete]);

  // DEMO ONLY — vor Produktion entfernen
  const handleDemoReset = useCallback(async () => {
    if (
      !window.confirm(
        "Alle gespeicherten Posteingang-Analysen löschen? (Nur Demo — E-Mails in Outlook bleiben unverändert.)",
      )
    ) {
      return;
    }

    setResetting(true);
    try {
      const count = await dokumenteApi.resetPosteingangAnalysen();
      setStatusMap({});
      toast.success(
        count === 1 ? "1 Analyse zurückgesetzt." : `${count} Analysen zurückgesetzt.`,
      );
      onAnalyseComplete?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zurücksetzen fehlgeschlagen.");
    } finally {
      setResetting(false);
    }
  }, [onAnalyseComplete]);

  if (connection.loading) {
    return <p className="text-sm text-text-muted">Outlook-Verbindung wird geprüft…</p>;
  }

  if (!connection.connected) {
    return (
      <div className="border border-dashed border-hairline bg-surface-muted px-4 py-8 text-center">
        <Mail className="mx-auto h-8 w-8 text-text-subtle" strokeWidth={1.5} />
        <p className="mt-2 text-sm font-medium text-heading">Kein Outlook-Postfach verbunden</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-3">
          {/* DEMO ONLY */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 shrink-0 border-amber-400 bg-amber-100 p-0 text-amber-900 hover:bg-amber-200"
            onClick={() => void handleDemoReset()}
            disabled={resetting || analyzing}
            title="Demo: Analysen zurücksetzen"
          >
            {resetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            <span className="sr-only">Analysen zurücksetzen</span>
          </Button>
          <PermissionGate berechtigung="aktion.dokumente.posteingang.analysieren">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleAnalyze()}
              disabled={analyzing || isPending || !messages?.length}
            >
              {analyzing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
              )}
              {analyzing
                ? "Analysiere…"
                : pendingCount > 0
                  ? `KI-Analyse (${pendingCount})`
                  : "KI-Analyse"}
            </Button>
          </PermissionGate>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            )}
            <span className="sr-only">Aktualisieren</span>
          </Button>
      </div>

      {isPending && <p className="text-sm text-text-muted">E-Mails werden geladen…</p>}

      {isError && (
        <p className="text-sm text-danger">
          {error instanceof Error ? error.message : "E-Mails konnten nicht geladen werden."}
        </p>
      )}

      {!isPending && !isError && messages?.length === 0 && (
        <p className="text-sm text-text-muted">Keine E-Mails mit Anhang im Posteingang.</p>
      )}

      {messages && messages.length > 0 && (
        <div className="overflow-x-auto border border-hairline bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-muted">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 text-left text-xs font-medium text-text-subtle">
                  Absender / Betreff
                </th>
                <th className="w-32 px-3 py-2 text-left text-xs font-medium text-text-subtle">
                  Mandant
                </th>
                <th className="w-32 px-3 py-2 text-left text-xs font-medium text-text-subtle">
                  Objekt
                </th>
                <th className="w-32 px-3 py-2 text-left text-xs font-medium text-text-subtle">
                  Kategorie
                </th>
                <th className="w-28 px-3 py-2 text-left text-xs font-medium text-text-subtle">
                  Status
                </th>
                <th className="w-24 px-3 py-2 text-right text-xs font-medium text-text-subtle">
                  Datum
                </th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <PosteingangZeile
                  key={msg.id}
                  msg={msg}
                  status={statusMap[msg.id]}
                  mandantNamen={mandantNamen}
                  objektNamen={objektNamen}
                  onOeffnen={onNachrichtOeffnen}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PosteingangZeile({
  msg,
  status,
  mandantNamen,
  objektNamen,
  onOeffnen,
}: {
  msg: OutlookMessageSummary;
  status?: PosteingangAnalyseStatus;
  mandantNamen: Map<string, string>;
  objektNamen: Map<string, string>;
  onOeffnen?: (nachrichtId: string) => void;
}) {
  const statusLabel = (() => {
    if (!status || status.status === "neu") return null;
    if (status.status === "analysiert")
      return { label: "Analysiert", variant: "analysiert" as const };
    if (status.status === "abgelegt")
      return { label: "Abgelegt", variant: "abgelegt" as const };
    if (status.status === "in_pruefung")
      return { label: "In Prüfung", variant: "in_pruefung" as const };
    if (status.status === "abgelehnt") return { label: "Abgelehnt", variant: "abgelehnt" as const };
    return null;
  })();

  const klickbar = Boolean(onOeffnen && status && status.status !== "neu");

  return (
    <tr
      onClick={klickbar ? () => onOeffnen?.(msg.id) : undefined}
      className={cn(
        "border-b border-hairline last:border-b-0",
        !msg.isRead && "bg-surface-muted/50 font-medium",
        klickbar && "cursor-pointer hover:bg-surface-muted",
      )}
    >
      <td className="px-3 py-3">
        <div className="flex h-8 w-8 items-center justify-center bg-surface-muted">
          <Mail className="h-4 w-4 text-text-subtle" strokeWidth={1.5} />
        </div>
      </td>
      <td className="min-w-0 px-3 py-3">
        <p className="truncate text-sm text-heading">{msg.from}</p>
        <p className="truncate text-xs text-text-muted">{msg.subject}</p>
        {status?.dateiname ? (
          <p className="mt-0.5 truncate text-xs text-text-subtle">{status.dateiname}</p>
        ) : null}
      </td>
      <td className="min-w-0 truncate px-3 py-3 text-xs text-text-muted">
        {status?.mandantId
          ? (mandantNamen.get(status.mandantId) ?? status.mandantId)
          : "–"}
      </td>
      <td className="min-w-0 truncate px-3 py-3 text-xs text-text-muted">
        {status?.objektId ? (objektNamen.get(status.objektId) ?? status.objektId) : "–"}
      </td>
      <td className="min-w-0 truncate px-3 py-3 text-xs">
        {status?.kategorieName ? (
          <span className="font-medium text-heading">{status.kategorieName}</span>
        ) : (
          <span className="text-text-subtle">–</span>
        )}
      </td>
      <td className="px-3 py-3">
        {statusLabel ? <StatusBadge status={statusLabel.variant} label={statusLabel.label} /> : null}
      </td>
      <td className="px-3 py-3 text-right text-xs text-text-muted">
        {msg.receivedAt ? formatDate(msg.receivedAt) : "–"}
      </td>
    </tr>
  );
}
