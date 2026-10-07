import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Search,
  SearchX,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Leerzustand } from "./Leerzustand";

export interface Spalte<T> {
  id: string;
  kopf: string;
  zelle: (zeile: T) => ReactNode;
  /** Wert für Sortierung; ohne Angabe nicht sortierbar */
  sortierWert?: (zeile: T) => string | number | null;
  ausrichtung?: "links" | "rechts";
  breite?: string;
  /** auf kleinen Bildschirmen ausblenden */
  optional?: boolean;
}

export interface Filter<T> {
  id: string;
  label: string;
  optionen: Array<{ wert: string; label: string }>;
  passt: (zeile: T, wert: string) => boolean;
}

export interface DatenTabelleProps<T> {
  zeilen: T[];
  spalten: Spalte<T>[];
  schluessel: (zeile: T) => string;
  onZeileKlick?: (zeile: T) => void;
  /** Text, in dem die Suche sucht; ohne Angabe keine Suche */
  suchText?: (zeile: T) => string;
  suchPlatzhalter?: string;
  filter?: Filter<T>[];
  startSortierung?: { id: string; richtung: "auf" | "ab" };
  leer?: ReactNode;
  /** maximale Höhe; Kopfzeile bleibt fixiert */
  maxHoehe?: string;
  zeilenKlasse?: (zeile: T) => string | undefined;
  aktiveZeile?: string | null;
  fusszeile?: ReactNode;
  label: string;
}

export function DatenTabelle<T>({
  zeilen,
  spalten,
  schluessel,
  onZeileKlick,
  suchText,
  suchPlatzhalter = "Suchen…",
  filter = [],
  startSortierung,
  leer,
  maxHoehe = "none",
  zeilenKlasse,
  aktiveZeile,
  fusszeile,
  label,
}: DatenTabelleProps<T>) {
  const [suche, setSuche] = useState("");
  const [sortierung, setSortierung] = useState(startSortierung ?? null);
  const [filterWerte, setFilterWerte] = useState<Record<string, string>>({});

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    let ergebnis = zeilen.filter((z) => {
      if (q && suchText && !suchText(z).toLowerCase().includes(q)) return false;
      for (const f of filter) {
        const w = filterWerte[f.id];
        if (w && w !== "*" && !f.passt(z, w)) return false;
      }
      return true;
    });
    if (sortierung) {
      const spalte = spalten.find((s) => s.id === sortierung.id);
      if (spalte?.sortierWert) {
        const faktor = sortierung.richtung === "auf" ? 1 : -1;
        ergebnis = [...ergebnis].sort((a, b) => {
          const va = spalte.sortierWert!(a);
          const vb = spalte.sortierWert!(b);
          if (va === vb) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
          return (va < vb ? -1 : 1) * faktor;
        });
      }
    }
    return ergebnis;
  }, [zeilen, suche, suchText, filter, filterWerte, sortierung, spalten]);

  const sortiere = (id: string) =>
    setSortierung((s) =>
      s?.id === id
        ? { id, richtung: s.richtung === "auf" ? "ab" : "auf" }
        : { id, richtung: "auf" },
    );

  const hatWerkzeuge = Boolean(suchText) || filter.length > 0;

  return (
    <div className="overflow-hidden rounded-[10px] border border-hairline bg-surface shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
      {hatWerkzeuge ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2.5">
          {suchText ? (
            <label className="relative flex min-w-[200px] flex-1 items-center">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-text-subtle" />
              <span className="sr-only">{suchPlatzhalter}</span>
              <input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder={suchPlatzhalter}
                className="h-8 w-full border border-transparent bg-surface-muted pl-8 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-text-subtle focus:border-input focus:bg-surface"
              />
            </label>
          ) : null}
          {filter.map((f) => (
            <label key={f.id} className="flex items-center">
              <span className="sr-only">{f.label}</span>
              <select
                value={filterWerte[f.id] ?? "*"}
                onChange={(e) =>
                  setFilterWerte((w) => ({ ...w, [f.id]: e.target.value }))
                }
                className="h-8 cursor-pointer border border-hairline bg-surface pl-2.5 pr-7 text-sm text-foreground outline-none hover:bg-surface-muted"
              >
                <option value="*">{f.label}: alle</option>
                {f.optionen.map((o) => (
                  <option key={o.wert} value={o.wert}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <span className="ml-auto text-xs text-text-subtle tabular-nums">
            {sichtbar.length} von {zeilen.length}
          </span>
        </div>
      ) : null}
      <div className="overflow-auto" style={{ maxHeight: maxHoehe }}>
        <table className="w-full border-collapse text-sm" aria-label={label}>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="shadow-[inset_0_-1px_0_var(--hairline)]">
              {spalten.map((s) => {
                const aktiv = sortierung?.id === s.id;
                const ausrichtung =
                  s.ausrichtung === "rechts" ? "text-right" : "text-left";
                return (
                  <th
                    key={s.id}
                    scope="col"
                    style={{ width: s.breite }}
                    aria-sort={
                      aktiv
                        ? sortierung!.richtung === "auf"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "h-9 whitespace-nowrap px-3 text-xs font-medium text-text-muted first:pl-4 last:pr-4",
                      ausrichtung,
                      s.optional && "hidden lg:table-cell",
                    )}
                  >
                    {s.sortierWert ? (
                      <button
                        onClick={() => sortiere(s.id)}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground [--board-r:4px]",
                          aktiv && "text-foreground",
                          s.ausrichtung === "rechts" && "flex-row-reverse",
                        )}
                      >
                        {s.kopf}
                        {aktiv ? (
                          sortierung!.richtung === "auf" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      s.kopf
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sichtbar.map((z) => {
              const key = schluessel(z);
              return (
                <tr
                  key={key}
                  onClick={onZeileKlick ? () => onZeileKlick(z) : undefined}
                  onKeyDown={
                    onZeileKlick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onZeileKlick(z);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onZeileKlick ? 0 : undefined}
                  className={cn(
                    "border-b border-hairline transition-colors duration-150 last:border-0",
                    onZeileKlick &&
                      "cursor-pointer outline-none hover:bg-surface-muted focus-visible:bg-accent-soft",
                    aktiveZeile === key &&
                      "bg-accent-soft hover:bg-accent-soft",
                    zeilenKlasse?.(z),
                  )}
                >
                  {spalten.map((s) => (
                    <td
                      key={s.id}
                      className={cn(
                        "h-11 px-3 align-middle first:pl-4 last:pr-4",
                        s.ausrichtung === "rechts" &&
                          "whitespace-nowrap text-right tabular-nums",
                        s.optional && "hidden lg:table-cell",
                      )}
                    >
                      {s.zelle(z)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {sichtbar.length === 0 ? (
          zeilen.length > 0 ? (
            <Leerzustand
              icon={SearchX}
              titel="Keine Treffer"
              text="Suche oder Filter anpassen."
              kompakt
            />
          ) : (
            (leer ?? (
              <Leerzustand icon={SearchX} titel="Keine Einträge" kompakt />
            ))
          )
        ) : null}
      </div>
      {fusszeile ? (
        <div className="border-t border-hairline bg-surface-muted/50 px-4 py-2.5 text-sm">
          {fusszeile}
        </div>
      ) : null}
    </div>
  );
}
