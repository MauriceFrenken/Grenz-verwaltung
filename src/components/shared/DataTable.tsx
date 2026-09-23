import type { CSSProperties, ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
  /** Spalte bleibt beim horizontalen Scrollen rechts fixiert */
  sticky?: "right";
  /** Breite in px für Offset-Berechnung bei mehreren sticky-Spalten */
  stickyBreitePx?: number;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  spalten: Column<T>[];
  zeilen: T[];
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyTitel?: string;
  emptyBeschreibung?: string;
  emptyAktion?: ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  /** Feste Tabellenbreite ohne horizontales Scrollen — Spaltenbreiten über Column.className */
  festLayout?: boolean;
  /** Horizontales Scrollen; sticky-Spalten bleiben rechts sichtbar */
  scrollX?: boolean;
}

function berechneStickyOffsets<T>(spalten: Column<T>[]) {
  const offsets = new Map<string, number>();
  const sticky = spalten.filter((s) => s.sticky === "right");
  let right = 0;
  for (let i = sticky.length - 1; i >= 0; i--) {
    offsets.set(sticky[i].key, right);
    right += sticky[i].stickyBreitePx ?? 72;
  }
  const ersteStickyKey = sticky[0]?.key;
  return { offsets, ersteStickyKey };
}

export function DataTable<T>({
  spalten,
  zeilen,
  isLoading,
  isEmpty,
  emptyTitel,
  emptyBeschreibung,
  emptyAktion,
  onRowClick,
  rowKey,
  festLayout = false,
  scrollX = false,
}: DataTableProps<T>) {
  const { offsets: stickyOffsets, ersteStickyKey } = berechneStickyOffsets(spalten);

  function stickyKlassen(key: string, zelle: "th" | "td") {
    const offset = stickyOffsets.get(key);
    if (offset === undefined) return null;
    return cn(
      "sticky z-20 bg-surface",
      zelle === "td" && "group-hover:bg-surface-muted",
      key === ersteStickyKey &&
        "shadow-[-6px_0_10px_-6px_rgba(15,23,42,0.12)]",
    );
  }

  function stickyStyle(key: string): CSSProperties | undefined {
    const offset = stickyOffsets.get(key);
    if (offset === undefined) return undefined;
    return { right: offset };
  }

  return (
    <div className="border border-hairline bg-surface">
      <div
        className={cn(
          scrollX || !festLayout ? "overflow-x-auto" : "overflow-hidden",
        )}
      >
        <table
          className={cn(
            "w-full border-collapse text-sm",
            festLayout && "table-fixed",
            scrollX && "min-w-max",
          )}
        >
          <thead>
            <tr className="hairline-b">
              {spalten.map((s) => (
                <th
                  key={s.key}
                  style={stickyStyle(s.key)}
                  className={cn(
                    "label-caps whitespace-nowrap px-4 py-3 text-left text-text-muted",
                    s.align === "right" && "text-right",
                    s.align === "center" && "text-center",
                    s.className,
                    stickyKlassen(s.key, "th"),
                  )}
                >
                  {s.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={spalten.length} className="p-0">
                  <LoadingState />
                </td>
              </tr>
            ) : isEmpty || zeilen.length === 0 ? (
              <tr>
                <td colSpan={spalten.length} className="p-0">
                  <EmptyState titel={emptyTitel} beschreibung={emptyBeschreibung} aktion={emptyAktion} />
                </td>
              </tr>
            ) : (
              zeilen.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "group border-b border-hairline last:border-b-0 hover:bg-surface-muted",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {spalten.map((s) => (
                    <td
                      key={s.key}
                      style={stickyStyle(s.key)}
                      className={cn(
                        "whitespace-nowrap px-4 py-3 align-middle text-foreground",
                        s.align === "right" && "text-right tabular-nums",
                        s.align === "center" && "text-center",
                        s.className,
                        stickyKlassen(s.key, "td"),
                      )}
                    >
                      <span data-op-zensur-daten="">{s.render(row)}</span>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}