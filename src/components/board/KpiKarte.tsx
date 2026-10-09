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
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] text-text-muted">
          {ampel !== "grau" ? (
            <span
              className={cn("size-1.5 shrink-0 rounded-full", RAND[ampel])}
              aria-hidden
            />
          ) : null}
          {label}
        </span>
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
    "group relative block rounded-lg border border-hairline bg-surface p-4 schatten-karte transition-[border-color] duration-150",
    href && "hover:border-input",
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
