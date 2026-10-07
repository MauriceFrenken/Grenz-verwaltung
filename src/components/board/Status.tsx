import { cn } from "@/lib/utils";

import { AMPEL_LABEL, type Ampel } from "./ampel";

export type { Ampel };

const TON: Record<Ampel | "akzent", string> = {
  gruen: "bg-ok-soft text-ok",
  gelb: "bg-warn-soft text-warn",
  rot: "bg-bad-soft text-bad",
  grau: "bg-surface-muted text-text-muted",
  akzent: "bg-accent-soft text-accent-foreground",
};

const PUNKT: Record<Ampel | "akzent", string> = {
  gruen: "bg-ok",
  gelb: "bg-warn",
  rot: "bg-bad",
  grau: "bg-text-subtle",
  akzent: "bg-primary",
};

export function StatusBadge({
  ampel,
  children,
  className,
}: {
  ampel: Ampel | "akzent";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium",
        TON[ampel],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", PUNKT[ampel])} aria-hidden />
      {children ?? (ampel === "akzent" ? "" : AMPEL_LABEL[ampel])}
    </span>
  );
}

/** Nur der Punkt, z. B. in dichten Tabellen; Label für Screenreader. */
export function AmpelPunkt({
  ampel,
  label,
  className,
}: {
  ampel: Ampel;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex items-center", className)}
      title={label ?? AMPEL_LABEL[ampel]}
    >
      <span className={cn("size-2 rounded-full", PUNKT[ampel])} aria-hidden />
      <span className="sr-only">{label ?? AMPEL_LABEL[ampel]}</span>
    </span>
  );
}
