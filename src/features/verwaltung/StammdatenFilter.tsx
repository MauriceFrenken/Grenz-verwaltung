import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Gesellschaft, Objekt } from "@/types";

export const ALLE = "__alle__";

/** Filterleiste über Gesellschaft und optional Objekt; Werte liegen in den Such-Parametern der Route. */
export function StammdatenFilter({
  gesellschaften,
  gesellschaftId,
  onGesellschaftChange,
  objekte,
  objektId,
  onObjektChange,
}: {
  gesellschaften: Gesellschaft[];
  gesellschaftId: string | null;
  onGesellschaftChange: (id: string | null) => void;
  objekte?: Objekt[];
  objektId?: string | null;
  onObjektChange?: (id: string | null) => void;
}) {
  const objekteGefiltert = gesellschaftId
    ? (objekte ?? []).filter((o) => o.gesellschaftId === gesellschaftId)
    : (objekte ?? []);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="grid gap-2">
        <Label
          htmlFor="filter-gesellschaft"
          className="label-caps text-text-subtle"
        >
          Gesellschaft
        </Label>
        <Select
          value={gesellschaftId ?? ALLE}
          onValueChange={(v) => onGesellschaftChange(v === ALLE ? null : v)}
        >
          <SelectTrigger id="filter-gesellschaft" className="w-72 rounded-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALLE}>Alle Gesellschaften</SelectItem>
            {gesellschaften.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {`${g.name} (${g.kuerzel})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {objekte && onObjektChange ? (
        <div className="grid gap-2">
          <Label
            htmlFor="filter-objekt"
            className="label-caps text-text-subtle"
          >
            Objekt
          </Label>
          <Select
            value={objektId ?? ALLE}
            onValueChange={(v) => onObjektChange(v === ALLE ? null : v)}
          >
            <SelectTrigger id="filter-objekt" className="w-72 rounded-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALLE}>Alle Objekte</SelectItem>
              {objekteGefiltert.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.bezeichnung}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
