import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  titel: string;
  beschreibung?: string;
  aktionen?: ReactNode;
  /** Steht direkt neben dem Titel (z. B. Status-Button). */
  nebenTitel?: ReactNode;
  meta?: ReactNode;
  /** Reiterleiste unter dem Kopf (z. B. Mandatsakte, Einstellungen). */
  reiter?: ReactNode;
  /** Titel/Beschreibung/Meta stammen aus API-Daten und werden bei OP-Zensur unkenntlich. */
  zensurTitel?: boolean;
}

export function PageHeader({
  titel,
  beschreibung,
  aktionen,
  nebenTitel,
  meta,
  reiter,
  zensurTitel = false,
}: PageHeaderProps) {
  const erweitert = Boolean(beschreibung || meta);

  const kopf = (
    <header
      className={cn(
        "hairline-b flex shrink-0 border-b border-hairline bg-surface px-8",
        erweitert
          ? "flex-col gap-3 py-6"
          : "h-[5rem] flex-row items-center justify-between gap-4",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            data-op-zensur-daten={zensurTitel ? "" : undefined}
            className="text-2xl font-semibold tracking-tight text-heading"
          >
            {titel}
          </h1>
          {beschreibung ? (
            <p
              data-op-zensur-daten={zensurTitel ? "" : undefined}
              className="text-sm text-text-muted"
            >
              {beschreibung}
            </p>
          ) : null}
          {meta ? (
            <div
              data-op-zensur-daten={zensurTitel ? "" : undefined}
              className="pt-1 text-xs text-text-subtle"
            >
              {meta}
            </div>
          ) : null}
        </div>
        {nebenTitel ? (
          zensurTitel ? (
            <span data-op-zensur-daten="">{nebenTitel}</span>
          ) : (
            nebenTitel
          )
        ) : null}
      </div>
      {aktionen ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
          {aktionen}
        </div>
      ) : null}
    </header>
  );

  if (!reiter) return kopf;
  return (
    <div className="flex flex-col">
      {kopf}
      {reiter}
    </div>
  );
}
