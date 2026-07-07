import type { ReactNode } from "react";
import { Construction } from "lucide-react";

export function EntwicklungOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div
        aria-hidden
        className="pointer-events-none select-none blur-[3px] opacity-60 [&_*]:pointer-events-none"
      >
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/25 p-8">
        <div className="mx-auto max-w-md border border-hairline bg-surface px-8 py-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-hairline bg-surface-muted text-text-subtle">
            <Construction className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h2 className="text-base font-semibold text-heading">Seite in Entwicklung</h2>
        </div>
      </div>
    </div>
  );
}
