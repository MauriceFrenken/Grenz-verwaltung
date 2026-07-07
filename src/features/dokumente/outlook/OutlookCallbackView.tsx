import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  clearOAuthContext,
  exchangeCodeForTokens,
  readOAuthContext,
  saveOAuthError,
  validateOAuthCallback,
} from "./auth";
import { completeOutlookAccountConnection } from "./graph";

export function OutlookCallbackView() {
  const navigate = useNavigate();
  const startedRef = useRef(false);
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Outlook-Verbindung wird hergestellt…");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      try {
        const params = new URLSearchParams(window.location.search);
        const { code } = validateOAuthCallback(params);
        const tokens = await exchangeCodeForTokens(code);
        const account = await completeOutlookAccountConnection(tokens);
        const oauthContext = readOAuthContext();
        clearOAuthContext();

        saveOAuthError(null);
        setStatus("done");
        setMessage(`Outlook-Konto ${account.profile?.mail ?? ""} verbunden.`);
        setDetail(null);
        toast.success("Outlook verbunden");
        void navigate({ to: oauthContext?.returnTo ?? "/dokumente/ablage", replace: true });
      } catch (e) {
        const err = e instanceof Error ? e.message : "Verbindung fehlgeschlagen";
        saveOAuthError(err);
        setStatus("error");
        setMessage("Outlook-Verbindung fehlgeschlagen");
        setDetail(err);
        toast.error(err, { duration: 15_000 });
      }
    }

    void run();
  }, [navigate]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Microsoft Outlook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p
            className={
              status === "error" ? "text-sm font-medium text-danger" : "text-sm text-text-muted"
            }
          >
            {message}
          </p>
          {detail && (
            <p className="border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {detail}
            </p>
          )}
          {status === "working" && (
            <p className="text-xs text-text-muted">
              Token werden mit dem Server ausgetauscht — bitte kurz warten.
            </p>
          )}
          {status === "error" && (
            <button
              type="button"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => void navigate({ to: "/dokumente/ablage", replace: true })}
            >
              Zurück zur Dokumentenablage
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
