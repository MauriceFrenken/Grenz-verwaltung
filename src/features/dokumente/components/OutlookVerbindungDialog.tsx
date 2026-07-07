import { Loader2, Mail, Plus, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";

import { startOutlookOAuth, loadOAuthError } from "../outlook/auth";
import { getOutlookRedirectUri } from "../outlook/config";
import { useOutlookConnection } from "../outlook/hooks";

type OutlookVerbindungDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OutlookVerbindungDialog({ open, onOpenChange }: OutlookVerbindungDialogProps) {
  const { state, refresh, disconnect } = useOutlookConnection();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await startOutlookOAuth({ returnTo: "/dokumente/ablage" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verbindung fehlgeschlagen");
      setConnecting(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await refresh();
      toast.success("Outlook-Konten aktualisiert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktualisierung fehlgeschlagen");
    }
  };

  const lastOAuthError = !state.connected ? loadOAuthError() : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#0078D4]" strokeWidth={1.5} />
            Outlook-Verbindung
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {state.connected ? (
              <StatusBadge status="abgelegt" label={`${state.accounts.length} Konto(en)`} />
            ) : state.configured ? (
              <StatusBadge status="offen" label="Nicht verbunden" />
            ) : (
              <StatusBadge status="in_pruefung" label="Konfiguration fehlt" />
            )}
          </div>

          {!state.configured && (
            <p className="border border-dashed border-hairline bg-surface-muted px-3 py-2 text-sm text-text-muted">
              Trage <span className="font-medium text-foreground">VITE_MICROSOFT_CLIENT_ID</span> und{" "}
              <span className="font-medium text-foreground">MICROSOFT_CLIENT_SECRET</span> in{" "}
              <span className="font-mono text-xs">.env.local</span> ein. Redirect-URI in Azure:{" "}
              <span className="font-mono text-xs">{getOutlookRedirectUri()}</span>
            </p>
          )}

          {state.error && (
            <p className="border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}

          {!state.error && lastOAuthError && (
            <p className="border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {lastOAuthError}
            </p>
          )}

          {state.connected && (
            <ul className="divide-y divide-hairline border border-hairline">
              {state.accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-heading">
                      {account.profile?.displayName ?? "Outlook-Konto"}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {account.profile?.mail || account.id}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-text-muted hover:text-danger"
                    onClick={() => disconnect(account.id)}
                  >
                    <Unplug className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                    Trennen
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {state.connected && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRefresh()}
                disabled={state.loading}
              >
                <RefreshCw
                  className={`mr-1.5 h-4 w-4 ${state.loading ? "animate-spin" : ""}`}
                  strokeWidth={1.5}
                />
                Aktualisieren
              </Button>
            )}
            {state.configured && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleConnect()}
                disabled={connecting || state.loading}
              >
                {connecting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                )}
                {state.connected ? "Konto hinzufügen" : "Mit Outlook verbinden"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
