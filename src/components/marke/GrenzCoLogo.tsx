/**
 * Grenz & Co. Marke — Wortmarke (PNG) und Monogramm „G“.
 */
import grenzCoLogo from "@/assets/grenz-co-logo-weiss.png";
import { cn } from "@/lib/utils";

export function GrenzCoLogo({ className }: { className?: string }) {
  return (
    <img
      src={grenzCoLogo}
      alt="Grenz & Co."
      width={1435}
      height={411}
      className={cn("h-4 w-auto shrink-0", className)}
    />
  );
}

/** Monogramm für eingeklappte Seitenleiste. */
export function GrenzCoZeichen({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Grenz & Co."
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center font-display text-lg font-semibold leading-none text-sidebar-foreground",
        className,
      )}
    >
      G
    </span>
  );
}
