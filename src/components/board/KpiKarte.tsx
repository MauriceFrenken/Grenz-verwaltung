import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Ampel } from "./Status";

const RAND: Record<Ampel, string> = {
  gruen: "bg-ok",
  gelb: "bg-warn",
  rot: "bg-bad",
  grau: "bg-transparent",
};

export interface KpiKarteProps {
  label: string;
  wert: ReactNode;
  /** kleine Zeile unter dem Wert, z. B. Veränderung oder Kontext */
  hinweis?: ReactNode;
  ampel?: Ampel;
  /** Ziel beim Klick (Seite im Board) */
  href?: string;
  className?: string;
}

export function KpiKarte({
  label,
  wert,
  hinweis,
  ampel = "grau",
  href,
  className,
}: KpiKarteProps) {
  const inhalt = (
    <>
      <span
        className={cn(
          "absolute inset-y-3 left-0 w-[3px] rounded-r-full",
          RAND[ampel],
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] text-text-muted">{label}</span>
        {href ? (
          <ArrowUpRight
            className="size-3.5 text-text-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            aria-hidden
          />
        ) : null}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-heading tabular-nums">
        {wert}
      </div>
      <div className="mt-2 min-h-4 text-xs text-text-muted tabular-nums">
        {hinweis}
      </div>
    </>
  );
  const klassen = cn(
    "group relative block rounded-[10px] border border-hairline bg-surface p-4 pl-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] duration-150",
    href && "hover:border-input hover:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08)]",
    className,
  );
  if (href) {
    return (
      <Link to={href} className={klassen}>
        {inhalt}
      </Link>
    );
  }
  return <div className={klassen}>{inhalt}</div>;
}
