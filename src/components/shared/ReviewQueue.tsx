import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

interface ReviewItem {
  id: string;
  titel: string;
  untertitel?: string;
  metadaten: Array<{ label: string; wert: ReactNode }>;
  konfidenz?: number;
  hinweis?: string;
}

interface ReviewQueueProps<T extends ReviewItem> {
  items: T[];
  isLoading?: boolean;
  isEmpty?: boolean;
  actions: (item: T) => ReactNode;
  emptyTitel?: string;
  emptyBeschreibung?: string;
}

export function ReviewQueue<T extends ReviewItem>({
  items,
  isLoading,
  isEmpty,
  actions,
  emptyTitel,
  emptyBeschreibung,
}: ReviewQueueProps<T>) {
  if (isLoading) {
    return (
      <div className="border border-hairline bg-surface">
        <LoadingState />
      </div>
    );
  }
  if (isEmpty || items.length === 0) {
    return (
      <div className="border border-hairline bg-surface">
        <EmptyState titel={emptyTitel} beschreibung={emptyBeschreibung} />
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-3 border border-hairline bg-surface p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="flex items-baseline gap-3">
              <p className="text-sm font-medium text-heading">{item.titel}</p>
              {item.konfidenz !== undefined ? (
                <span className="label-caps text-text-subtle">Konfidenz {Math.round(item.konfidenz * 100)} %</span>
              ) : null}
            </div>
            {item.untertitel ? <p className="text-xs text-text-muted">{item.untertitel}</p> : null}
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {item.metadaten.map((m) => (
                <div key={m.label} className="flex gap-1">
                  <dt className="text-text-subtle">{m.label}:</dt>
                  <dd className="text-foreground">{m.wert}</dd>
                </div>
              ))}
            </dl>
            {item.hinweis ? <p className="mt-2 text-xs text-danger">{item.hinweis}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions(item)}</div>
        </li>
      ))}
    </ul>
  );
}