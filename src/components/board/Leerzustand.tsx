import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Leerzustand({
  icon: Icon,
  titel,
  text,
  aktion,
  kompakt,
}: {
  icon: LucideIcon;
  titel: string;
  text?: ReactNode;
  aktion?: ReactNode;
  kompakt?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        kompakt ? "px-4 py-8" : "px-6 py-16",
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-foreground">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </div>
      <p className="text-sm font-medium text-heading">{titel}</p>
      {text ? (
        <p className="mt-1 max-w-sm text-sm text-text-muted">{text}</p>
      ) : null}
      {aktion ? <div className="mt-4">{aktion}</div> : null}
    </div>
  );
}
