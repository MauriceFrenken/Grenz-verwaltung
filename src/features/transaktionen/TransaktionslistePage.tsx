import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { FileQuestion, FileText, Image } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
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

const spalten: Column<GraphNachricht>[] = [
  {
    key: "anhang",
    header: "",
    className: "w-10 pr-0",
    render: (n) => <AnhangIcon art={n.anhangArt} />,
  },
  {
    key: "absender",
    header: "Absender",
    className: "max-w-[11rem]",
    render: (n) => {
      const sender = n.absenderName?.trim() || n.absenderMail || "–";
      return (
        <span className="block max-w-[11rem] truncate font-medium text-heading" title={sender}>
          {sender}
        </span>
      );
    },
  },
  {
    key: "betreff",
    header: "Betreff",
    className: "max-w-0 w-full",
    render: (n) => (
      <span className="block max-w-xl truncate" title={n.betreff ?? undefined}>
        {n.betreff?.trim() || "(kein Betreff)"}
      </span>
    ),
  },
  {
    key: "datum",
    header: "Datum",
    align: "right",
    render: (n) => (
      <span className="text-text-muted">{formatEingangsdatum(n.eingegangenAm)}</span>
    ),
  },
];

export function TransaktionslistePage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  /** Ändert sich bei jedem Öffnen der Route (inkl. Soft-Navigation / Reload). */
  const besuchKey = useRouterState({
    select: (s) =>
      s.location.state.__TSR_key ?? s.location.state.key ?? `${s.location.pathname}:${s.location.href}`,
  });

  const [nachrichten, setNachrichten] = useState<GraphNachricht[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setNachrichten([]);
      setFehler(null);
      setLaedt(false);
      return;
    }

    let cancelled = false;
    setLaedt(true);
    setFehler(null);

    void (async () => {
      try {
        const { microsoftPosteingangFn } = await import("@/lib/microsoft/server-fn");
        const result = await microsoftPosteingangFn({
          data: { supabaseAccessToken: token, anzahl: 50 },
        });
        if (cancelled) return;
        setNachrichten(result.nachrichten);
      } catch (e) {
        if (cancelled) return;
        setNachrichten([]);
        setFehler(e instanceof Error ? e.message : "Postfach konnte nicht geladen werden.");
      } finally {
        if (!cancelled) setLaedt(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, besuchKey]);

  return (
    <>
      <PageHeader titel="Offene Exposés" />
      <PageWrapper>
        <DataTable
          spalten={spalten}
          zeilen={nachrichten}
          isLoading={laedt}
          isEmpty={!laedt && (Boolean(fehler) || nachrichten.length === 0)}
          emptyTitel={fehler ?? "Keine Nachrichten"}
          rowKey={(n) => n.id}
        />
      </PageWrapper>
    </>
  );
}
