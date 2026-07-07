import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  titel?: string;
  beschreibung?: string;
  aktion?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({
  titel = "Keine Einträge vorhanden",
  beschreibung,
  aktion,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center border border-hairline bg-surface-muted text-text-subtle">
        {icon ?? <Inbox className="h-5 w-5" strokeWidth={1.5} />}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-heading">{titel}</p>
        {beschreibung ? <p className="max-w-md text-xs text-text-muted">{beschreibung}</p> : null}
      </div>
      {aktion ? <div className="pt-2">{aktion}</div> : null}
    </div>
  );
}