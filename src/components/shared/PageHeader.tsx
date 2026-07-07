import type { ReactNode } from "react";

interface PageHeaderProps {
  titel: string;
  beschreibung?: string;
  aktionen?: ReactNode;
  meta?: ReactNode;
}

export function PageHeader({ titel, beschreibung, aktionen, meta }: PageHeaderProps) {
  return (
    <header className="hairline-b flex flex-col gap-3 border-b border-hairline bg-surface px-8 pb-6 pt-6 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-heading">{titel}</h1>
        {beschreibung ? (
          <p className="text-sm text-text-muted">{beschreibung}</p>
        ) : null}
        {meta ? <div className="pt-1 text-xs text-text-subtle">{meta}</div> : null}
      </div>
      {aktionen ? <div className="flex flex-wrap items-center gap-2">{aktionen}</div> : null}
    </header>
  );
}