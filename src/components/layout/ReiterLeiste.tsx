import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export interface Reiter {
  id: string;
  label: string;
  /** Fertig aufgelöster Pfad, z. B. `/mandate/abc/matching`. */
  href: string;
}

/** Reiter unter dem Seitenkopf: echte Links, damit jeder Reiter eine eigene Adresse hat. */
export function ReiterLeiste({
  reiter,
  aktiv,
  label,
}: {
  reiter: Reiter[];
  aktiv: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-hairline bg-surface px-6"
    >
      {reiter.map((r) => {
        const istAktiv = r.id === aktiv;
        return (
          <Link
            key={r.id}
            to={r.href}
            aria-current={istAktiv ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              istAktiv
                ? "border-[var(--gc-navy)] font-medium text-heading"
                : "border-transparent text-text-muted hover:text-heading",
            )}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
