import { cn } from "@/lib/utils";

export function Skelett({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-[6px] bg-surface-muted", className)}
    />
  );
}

export function KpiSkelett() {
  return (
    <div className="rounded-[10px] border border-hairline bg-surface p-4 pl-5">
      <Skelett className="h-3.5 w-24" />
      <Skelett className="mt-3 h-7 w-32" />
      <Skelett className="mt-3 h-3 w-20" />
    </div>
  );
}

export function TabellenSkelett({ zeilen = 6 }: { zeilen?: number }) {
  return (
    <div className="rounded-[10px] border border-hairline bg-surface">
      <div className="border-b border-hairline px-4 py-3">
        <Skelett className="h-3 w-1/3" />
      </div>
      {Array.from({ length: zeilen }, (_, i) => (
        <div
          key={i}
          className="flex gap-4 border-b border-hairline px-4 py-3 last:border-0"
        >
          <Skelett className="h-3.5 w-1/4" />
          <Skelett className="h-3.5 w-1/5" />
          <Skelett className="ml-auto h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Ganzseitiger Ladezustand: Titel, KPI-Reihe, Tabelle. */
export function SeitenSkelett() {
  return (
    <div aria-busy="true" aria-label="Wird geladen">
      <Skelett className="mb-2 h-6 w-48" />
      <Skelett className="mb-8 h-4 w-72" />
      <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <KpiSkelett key={i} />
        ))}
      </div>
      <TabellenSkelett />
    </div>
  );
}
