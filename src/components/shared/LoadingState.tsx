export function LoadingState({ zeilen = 6 }: { zeilen?: number }) {
  return (
    <div className="flex flex-col divide-y divide-hairline" aria-busy="true" aria-live="polite">
      {Array.from({ length: zeilen }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="h-3 w-24 animate-pulse bg-surface-muted" />
          <div className="h-3 w-48 animate-pulse bg-surface-muted" />
          <div className="ml-auto h-3 w-16 animate-pulse bg-surface-muted" />
        </div>
      ))}
      <span className="sr-only">Lädt…</span>
    </div>
  );
}