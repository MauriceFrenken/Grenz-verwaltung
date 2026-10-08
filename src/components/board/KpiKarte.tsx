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
  /** Herkunft der Zahl, z. B. „EBICS camt.053 · Stand 08.10.2026“ (Tooltip) */
  quelle?: string;
}

export function KpiKarte({
  label,
  wert,
  hinweis,
  ampel = "grau",
  href,
  className,
  quelle,
}: KpiKarteProps) {
  const inhalt = (
    <>
      <span
        className={cn("absolute inset-y-3 left-0 w-[3px]", RAND[ampel])}
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
    "group relative block border border-hairline bg-surface p-4 pl-5 transition-[border-color] duration-150",
    href && "hover:border-input hover:border-heading",
    className,
  );
  if (href) {
    return (
      <Link to={href} className={klassen} title={quelle}>
        {inhalt}
      </Link>
    );
  }
  return (
    <div className={klassen} title={quelle}>
      {inhalt}
    </div>
  );
}
