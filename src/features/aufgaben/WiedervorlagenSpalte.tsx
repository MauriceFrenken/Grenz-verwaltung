import { CalendarDays, Cloud, ExternalLink, Loader2 } from "lucide-react";

import { sfLink, useAkquiseDaten } from "@/features/akquise/useAkquiseDaten";
import { MASSNAHME_LABEL } from "@/lib/akquise/klassifizieren";
import type { Wiedervorlage } from "@/lib/akquise/typen";
import type { Filter, Person } from "@/lib/aufgaben/typen";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function passt(w: Wiedervorlage, filter: Filter, personen: Person[]): boolean {
  if (filter.ruecksprache) return false;
  if (filter.nurUeberfaellig && !w.ueberfaelligTage) return false;
  if (filter.person === "ohne" && w.bearbeiter) return false;
  if (filter.person && filter.person !== "ohne") {
    const name = personen.find((p) => p.id === filter.person)?.name;
    if (!name || w.bearbeiter?.toLowerCase() !== name.toLowerCase())
      return false;
  }
  const q = filter.suche.trim().toLowerCase();
  if (!q) return true;
  return [w.betreff, w.wer, w.firma]
    .filter(Boolean)
    .some((t) => t!.toLowerCase().includes(q));
}

/**
 * Offene Wiedervorlagen der Akquise aus Salesforce als letzte Spalte des Boards, damit es
 * nur eine Liste für „zu tun“ gibt. Nur lesend: erledigt wird in Salesforce.
 */
export function WiedervorlagenSpalte({
  filter,
  personen,
}: {
  filter: Filter;
  personen: Person[];
}) {
  const { daten, laedt, fehler } = useAkquiseDaten();
  const liste = (daten?.wiedervorlagen.liste ?? []).filter((w) =>
    passt(w, filter, personen),
  );
  return (
    <section className="flex max-h-full w-72 shrink-0 flex-col border border-dashed border-hairline bg-surface">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <Cloud className="size-4 text-text-muted" />
        <h2 className="flex-1 text-sm font-medium text-heading">
          Wiedervorlagen aus Salesforce
        </h2>
        <span className="text-xs tabular-nums text-text-muted">
          {daten ? daten.wiedervorlagen.gesamt : ""}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {!daten && laedt && (
          <span className="flex items-center gap-2 px-1 py-2 text-xs text-text-muted">
            <Loader2 className="size-3.5 animate-spin" />
            Salesforce wird geladen …
          </span>
        )}
        {!daten && fehler && (
          <span className="px-1 py-2 text-xs text-bad">{fehler}</span>
        )}
        {daten && liste.length === 0 && (
          <span className="px-1 py-2 text-xs text-text-muted">
            Keine offenen Wiedervorlagen.
          </span>
        )}
        {liste.map((w) => {
          const inhalt = (
            <>
              <span className="text-[11px] text-text-muted">
                {MASSNAHME_LABEL[w.massnahme]}
                {w.wer || w.firma ? ` · ${w.wer ?? w.firma}` : ""}
              </span>
              <span className="text-sm leading-snug text-heading">
                {w.betreff}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                {w.faelligAm && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5",
                      w.ueberfaelligTage
                        ? "bg-bad-soft text-bad"
                        : "bg-surface-muted text-text-muted",
                    )}
                  >
                    <CalendarDays className="size-3" />
                    {formatDate(w.faelligAm)}
                  </span>
                )}
                {w.bearbeiter && <span>{w.bearbeiter}</span>}
                {w.sf && <ExternalLink className="ml-auto size-3.5" />}
              </span>
            </>
          );
          const stil =
            "flex flex-col gap-2 border border-hairline bg-elevated p-3 text-left";
          return w.sf ? (
            <a
              key={w.id}
              href={sfLink(w.sf.typ, w.sf.id)}
              target="_blank"
              rel="noreferrer"
              title="In Salesforce öffnen"
              className={cn(stil, "hover:border-[var(--gc-navy-hell)]")}
            >
              {inhalt}
            </a>
          ) : (
            <div key={w.id} className={stil}>
              {inhalt}
            </div>
          );
        })}
      </div>
    </section>
  );
}
