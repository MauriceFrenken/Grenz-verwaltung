import { useCallback, useEffect, useState } from "react";
import { FileQuestion, FileText, Image } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { useAuth } from "@/hooks/useAuth";
import type { GraphAnhangArt, GraphNachricht } from "@/lib/microsoft/graph";

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

export function TransaktionslistePage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [nachrichten, setNachrichten] = useState<GraphNachricht[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    if (!token) return;
    setLaedt(true);
    setFehler(null);
    try {
      const { microsoftPosteingangFn } = await import("@/lib/microsoft/server-fn");
      const result = await microsoftPosteingangFn({
        data: { supabaseAccessToken: token, anzahl: 50 },
      });
      setNachrichten(result.nachrichten);
    } catch (e) {
      setNachrichten([]);
      setFehler(e instanceof Error ? e.message : "Postfach konnte nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, [token]);

  useEffect(() => {
    void laden();
  }, [laden]);

  return (
    <>
      <PageHeader titel="Offene Exposés" />
      <PageWrapper>
        <div className="border border-hairline bg-surface">
          {laedt ? (
            <LoadingState />
          ) : fehler ? (
            <EmptyState titel={fehler} />
          ) : nachrichten.length === 0 ? (
            <EmptyState titel="Keine Nachrichten" />
          ) : (
            <ul className="divide-y divide-hairline">
              {nachrichten.map((n) => {
                const sender = n.absenderName?.trim() || n.absenderMail || "–";
                return (
                  <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                    <AnhangIcon art={n.anhangArt} />
                    <span className="w-44 shrink-0 truncate text-sm text-heading" title={sender}>
                      {sender}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-foreground"
                      title={n.betreff ?? undefined}
                    >
                      {n.betreff?.trim() || "(kein Betreff)"}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs text-text-muted">
                      {formatEingangsdatum(n.eingegangenAm)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PageWrapper>
    </>
  );
}
