import { useEffect, useState } from "react";
import { Check, Copy, Loader2, LogIn, LogOut } from "lucide-react";
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

async function inZwischenablage(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} kopiert`);
  } catch {
    toast.error("Kopieren fehlgeschlagen — bitte manuell markieren.");
  }
}

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
      toast.success(
        neu.displayName
          ? `Mit Salesforce verbunden (${neu.displayName})`
          : "Mit Salesforce verbunden",
      );
      // Dialog offen lassen — Access Token zum Kopieren sichtbar
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

  const tokenUndInstanceKopieren = () => {
    if (!session) return;
    void inZwischenablage(
      `Access Token:\n${session.accessToken}\n\nInstance URL:\n${session.instanceUrl}`,
      "Access Token + Instance URL",
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:rounded-none">
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
                <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                Verbunden
                {session.displayName ? ` — ${session.displayName}` : null}
              </div>
              <p className="text-xs text-text-subtle break-all">
                {session.preferredUsername ? `${session.preferredUsername} · ` : null}
                seit{" "}
                {session.gespeichertAm
                  ? new Date(session.gespeichertAm).toLocaleString("de-DE")
                  : "—"}
              </p>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-heading">Access Token</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => void inZwischenablage(session.accessToken, "Access Token")}
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Kopieren
                  </Button>
                </div>
                <code className="max-h-24 overflow-y-auto break-all rounded-none border border-hairline bg-background px-2 py-1.5 text-[11px] leading-relaxed text-text-muted">
                  {session.accessToken}
                </code>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-heading">Instance URL</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => void inZwischenablage(session.instanceUrl, "Instance URL")}
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Kopieren
                  </Button>
                </div>
                <code className="break-all rounded-none border border-hairline bg-background px-2 py-1.5 text-[11px] text-text-muted">
                  {session.instanceUrl}
                </code>
              </div>

              <p className="text-xs text-text-muted">
                Token + Instance URL können weitergegeben werden (z. B. zum API-Testen). Der
                Token läuft nach einiger Zeit ab und gilt wie ein Passwort — nur vertrauenswürdig
                weitergeben.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={tokenUndInstanceKopieren}>
                  <Copy className="h-4 w-4" strokeWidth={1.5} />
                  Beides kopieren
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={trennen}>
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                  Verbindung trennen
                </Button>
              </div>
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
              Consumer Key als{" "}
              <code className="text-xs">VITE_SALESFORCE_CLIENT_ID</code> in{" "}
              <code className="text-xs">.env.local</code> und in den Vercel Environment
              Variables setzen, dann Dev-Server neu starten bzw. neu deployen. Callback:{" "}
              <code className="text-xs break-all">{SALESFORCE_OAUTH_CALLBACK_URL}</code>
            </p>
          ) : (
            <p className="text-xs text-text-subtle">
              Callback:{" "}
              <code className="text-xs break-all">{SALESFORCE_OAUTH_CALLBACK_URL}</code>
              . Zum Verbinden die Produktions-App auf Vercel nutzen (oder lokal, wenn
              localhost als Callback in der Connected App hinterlegt ist).
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
