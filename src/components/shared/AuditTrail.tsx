import type { AuditEintrag } from "@/types";
import { formatDate } from "@/lib/format";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

interface AuditTrailProps {
  eintraege: AuditEintrag[];
  isLoading?: boolean;
  isEmpty?: boolean;
}

export function AuditTrail({ eintraege, isLoading, isEmpty }: AuditTrailProps) {
  if (isLoading) return <div className="border border-hairline bg-surface"><LoadingState /></div>;
  if (isEmpty || eintraege.length === 0)
    return (
      <div className="border border-hairline bg-surface">
        <EmptyState titel="Keine Audit-Einträge" />
      </div>
    );
  return (
    <ol className="border border-hairline bg-surface">
      {eintraege.map((e) => (
        <li key={e.id} className="flex items-start gap-4 border-b border-hairline px-4 py-3 last:border-b-0">
          <span className="w-32 text-xs text-text-muted">{formatDate(e.zeitpunkt)}</span>
          <span className="w-40 text-xs text-text-subtle">{e.ausloeser}</span>
          <span className="flex-1 text-sm text-foreground">{e.aktion}</span>
          <span className="label-caps text-text-muted">{e.bezug}</span>
        </li>
      ))}
    </ol>
  );
}