import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Detail als Seitenpanel (Sheet) statt neuer Seite.
 * Schließen mit Esc, Klick auf den Hintergrund oder das X.
 */
export function DetailPanel({
  offen,
  onSchliessen,
  titel,
  unterzeile,
  kopfzeile,
  children,
  breite = "md",
}: {
  offen: boolean;
  onSchliessen: () => void;
  titel: ReactNode;
  unterzeile?: ReactNode;
  /** Badges/Aktionen rechts neben dem Titel */
  kopfzeile?: ReactNode;
  children: ReactNode;
  breite?: "md" | "lg";
}) {
  return (
    <Dialog.Root open={offen} onOpenChange={(o) => !o && onSchliessen()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-2 right-2 z-50 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border border-hairline bg-elevated text-foreground shadow-[0_16px_48px_-12px_rgb(0_0_0/0.25)] outline-none [--board-r:12px]",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-8 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-8 data-[state=closed]:duration-150 data-[state=open]:duration-200",
            breite === "md" ? "sm:max-w-[520px]" : "sm:max-w-[720px]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[17px] font-semibold tracking-[-0.01em] text-heading">
                {titel}
              </Dialog.Title>
              {unterzeile ? (
                <Dialog.Description className="mt-1 text-sm text-text-muted">
                  {unterzeile}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  Details
                </Dialog.Description>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {kopfzeile}
              <Dialog.Close
                className="flex size-7 cursor-pointer items-center justify-center text-text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                aria-label="Schließen"
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Unterabschnitt innerhalb eines Detail-Panels. */
export function PanelAbschnitt({
  titel,
  children,
}: {
  titel: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="mb-2.5 text-xs font-medium uppercase tracking-[0.06em] text-text-subtle">
        {titel}
      </h3>
      {children}
    </div>
  );
}
