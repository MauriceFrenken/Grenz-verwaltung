/** Gemeinsame Bausteine der Kennzahlen-Reiter. */

import type { ReactNode } from "react";

import { ChartTooltipContent } from "@/components/ui/chart";
import { formatEuro, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { VIZ } from "./hilfen";

export function Kachel({
  titel,
  wert,
  unterzeile,
  ton,
}: {
  titel: string;
  wert: string;
  unterzeile?: string;
  ton?: "gut" | "schlecht";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4">
      <span className="label-caps text-text-muted">{titel}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums text-heading",
          ton === "gut" && "text-chart-2",
          ton === "schlecht" && "text-danger",
        )}
      >
        {wert}
      </span>
      {unterzeile ? (
        <span className="text-xs text-text-muted">{unterzeile}</span>
      ) : null}
    </div>
  );
}

export function KachelReihe({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

/** Rahmen für ein Diagramm mit Titel und optionaler Erklärung. */
export function Karte({
  titel,
  hinweis,
  children,
  className,
}: {
  titel: string;
  hinweis?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-hairline bg-surface p-4",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold text-heading">{titel}</h2>
        {hinweis ? <p className="text-xs text-text-muted">{hinweis}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Horizontale Balkenliste: Beschriftung + Wert immer sichtbar. */
export function BalkenListe({
  zeilen,
  format = (n) => formatInt(n),
  farbe = VIZ[0],
  leer = "Keine Daten.",
}: {
  zeilen: Array<{ name: string; wert: number; zusatz?: string }>;
  format?: (n: number) => string;
  farbe?: string;
  leer?: string;
}) {
  const max = Math.max(1, ...zeilen.map((z) => z.wert));
  if (zeilen.length === 0)
    return <p className="text-sm text-text-muted">{leer}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {zeilen.map((z) => (
        <li key={z.name} className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="min-w-0 truncate text-heading" title={z.name}>
              {z.name}
              {z.zusatz ? (
                <span className="ml-2 text-xs text-text-muted">{z.zusatz}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums">{format(z.wert)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-muted">
            <div
              className="h-1.5 rounded-full"
              style={{ width: `${(z.wert / max) * 100}%`, background: farbe }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tooltip-Inhalt mit Euro-Werten und Labels aus der ChartConfig. */
export function EuroTooltip({ labels }: { labels: Record<string, string> }) {
  return (
    <ChartTooltipContent
      formatter={(value, name, item) => (
        <div className="flex w-full items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-text-muted">
            <span
              className="size-2.5 rounded-[2px]"
              style={{ background: item.color ?? item.payload?.fill }}
            />
            {labels[String(name)] ?? name}
          </span>
          <span className="font-mono tabular-nums">
            {formatEuro(Number(value))}
          </span>
        </div>
      )}
    />
  );
}

export function AnzahlTooltip({ labels }: { labels: Record<string, string> }) {
  return (
    <ChartTooltipContent
      formatter={(value, name, item) => (
        <div className="flex w-full items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-text-muted">
            <span
              className="size-2.5 rounded-[2px]"
              style={{ background: item.color ?? item.payload?.fill }}
            />
            {labels[String(name)] ?? name}
          </span>
          <span className="font-mono tabular-nums">
            {formatInt(Number(value))}
          </span>
        </div>
      )}
    />
  );
}

export function Tabelle({
  kopf,
  children,
  leer,
}: {
  kopf: Array<{ titel: string; rechts?: boolean }>;
  children: ReactNode;
  leer?: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-text-muted">
          <tr className="border-b border-hairline">
            {kopf.map((k) => (
              <th
                key={k.titel}
                className={cn(
                  "whitespace-nowrap px-2 py-2 font-medium",
                  k.rechts && "text-right",
                )}
              >
                {k.titel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {leer ? (
            <tr>
              <td colSpan={kopf.length} className="px-2 py-3 text-text-muted">
                {leer}
              </td>
            </tr>
          ) : null}
          {children}
        </tbody>
      </table>
    </div>
  );
}
