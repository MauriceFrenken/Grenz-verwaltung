import { useEffect, useState } from "react";
import { Check, Loader2, LogIn, LogOut, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SALESFORCE_OAUTH_CALLBACK_URL,
  SALESFORCE_PREFERRED_URL,
  salesforceClientId,
  salesforceLoginPopup,
  salesforceSessionLesen,
  salesforceSessionLoeschen,
  type SalesforceSession,
} from "@/lib/salesforce";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wird nach Connect/Disconnect aufgerufen (z. B. Button-Label aktualisieren). */
  onStatusChange?: () => void;
};

export function SalesforceConnectDialog({ open, onOpenChange, onStatusChange }: Props) {
  const [session, setSession] = useState<SalesforceSession | null>(null);
  const [laedt, setLaedt] = useState(false);
  const clientIdOk = Boolean(salesforceClientId());

  useEffect(() => {
    if (!open) return;
    setSession(salesforceSessionLesen());
  }, [open]);

  const verbinden = async () => {
    if (!clientIdOk) {
      toast.error(
        "Connected App noch nicht konfiguriert — Consumer Key (VITE_SALESFORCE_CLIENT_ID) fehlt.",
      );
      return;
    }
    setLaedt(true);
    try {
      const neu = await salesforceLoginPopup();
      setSession(neu);
      onStatusChange?.();
      toast.success("Mit Salesforce verbunden");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verbindung fehlgeschlagen";
      if (!msg.includes("abgebrochen")) {
        toast.error(msg);
      }
    } finally {
      setLaedt(false);
    }
  };

  const trennen = () => {
    salesforceSessionLoeschen();
    setSession(null);
    onStatusChange?.();
    toast.info("Salesforce-Verbindung getrennt");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:rounded-none">
        <DialogHeader>
          <DialogTitle>Mit Salesforce verbinden</DialogTitle>
          <DialogDescription>
            Jeder Nutzer meldet sich mit seinem eigenen Salesforce-Account an. Das
            Passwort bleibt bei Salesforce (
            <a
              href={SALESFORCE_PREFERRED_URL}
              target="_blank"
              rel="noreferrer"
              className="text-heading underline-offset-2 hover:underline"
            >
              {SALESFORCE_PREFERRED_URL.replace("https://", "")}
            </a>
            ).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {session ? (
            <div className="flex flex-col gap-3 border border-hairline bg-surface-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm text-heading">
                <Check className="h-4 w-4" strokeWidth={1.5} />
                Verbunden
              </div>
              <p className="text-xs text-text-subtle break-all">
                Instance: {session.instanceUrl}
                {session.gespeichertAm
                  ? ` · seit ${new Date(session.gespeichertAm).toLocaleString("de-DE")}`
                  : null}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={trennen}>
                <LogOut className="h-4 w-4" strokeWidth={1.5} />
                Verbindung trennen
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-heading"
              disabled={laedt || !clientIdOk}
              onClick={verbinden}
            >
              {laedt ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <LogIn className="h-4 w-4" strokeWidth={1.5} />
              )}
              Mit Salesforce verbinden
            </Button>
          )}

          {!clientIdOk ? (
            <p className="text-xs text-text-muted">
              Noch nicht bereit: Connected App beim Kunden anlegen, Callback{" "}
              <code className="text-xs break-all">{SALESFORCE_OAUTH_CALLBACK_URL}</code>{" "}
              eintragen, Consumer Key als{" "}
              <code className="text-xs">VITE_SALESFORCE_CLIENT_ID</code> setzen (lokal +
              Vercel).
            </p>
          ) : (
            <p className="text-xs text-text-subtle">
              Callback: <code className="text-xs break-all">{SALESFORCE_OAUTH_CALLBACK_URL}</code>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** @deprecated Alias — nutze SalesforceConnectDialog */
export const SalesforceSessionDialog = SalesforceConnectDialog;
