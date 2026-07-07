import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
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
}: DataTableProps<T>) {
  return (
    <div className="border border-hairline bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="hairline-b">
              {spalten.map((s) => (
                <th
                  key={s.key}
                  className={cn(
                    "label-caps whitespace-nowrap px-4 py-3 text-left text-text-muted",
                    s.align === "right" && "text-right",
                    s.align === "center" && "text-center",
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
                    "border-b border-hairline last:border-b-0 hover:bg-surface-muted",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {spalten.map((s) => (
                    <td
                      key={s.key}
                      className={cn(
                        "whitespace-nowrap px-4 py-3 align-middle text-foreground",
                        s.align === "right" && "text-right tabular-nums",
                        s.align === "center" && "text-center",
                        s.className,
                      )}
                    >
                      {s.render(row)}
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