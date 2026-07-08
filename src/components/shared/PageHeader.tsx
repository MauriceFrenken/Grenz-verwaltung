import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  titel: string;
  beschreibung?: string;
  aktionen?: ReactNode;
  meta?: ReactNode;
}

export function PageHeader({ titel, beschreibung, aktionen, meta }: PageHeaderProps) {
  const erweitert = Boolean(beschreibung || meta);

  return (
    <header
      className={cn(
        "hairline-b flex shrink-0 border-b border-hairline bg-surface px-8",
        erweitert
          ? "flex-col gap-3 py-6"
          : "h-[5rem] flex-row items-center justify-between gap-4",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-heading">{titel}</h1>
        {beschreibung ? (
          <p className="text-sm text-text-muted">{beschreibung}</p>
        ) : null}
        {meta ? <div className="pt-1 text-xs text-text-subtle">{meta}</div> : null}
      </div>
      {aktionen ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto">{aktionen}</div>
      ) : null}
    </header>
  );
}
