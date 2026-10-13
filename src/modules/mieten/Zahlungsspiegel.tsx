import { Fragment } from "react";
import type { Mietkonto, MonatStatus } from "@/lib/db/mieten";
import { euro, monat as monatLang, monatKurz } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import { MONAT_LABEL } from "./logik/mieten";

const ZELLE: Record<MonatStatus, string> = {
  bezahlt: "bg-ok",
  teilweise: "bg-warn",
  ueberfaellig: "bg-bad",
  noch_nicht_faellig: "border border-dashed border-input bg-transparent",
};

/**
 * Zahlungsspiegel: je Vertrag ein Feld pro Monat, gruppiert nach Objekt.
 * Grün bezahlt, gelb teilweise, rot nicht bezahlt, gestrichelt noch nicht fällig.
 */
export function Zahlungsspiegel({
  konten,
  monate,
  onKlick,
}: {
  konten: Mietkonto[];
  monate: string[];
  onKlick: (k: Mietkonto) => void;
}) {
  const objekte = [...new Set(konten.map((k) => k.objektId))].sort();
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface schatten-karte">
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm"
          aria-label="Zahlungsspiegel"
        >
          <thead>
            <tr className="shadow-[inset_0_-1px_0_var(--hairline)]">
              <th className="h-9 min-w-[220px] px-4 text-left text-xs font-medium text-text-muted">
                Mieter
              </th>
              {monate.map((m) => (
                <th
                  key={m}
                  className="h-9 w-10 px-0.5 text-center text-[11px] font-medium text-text-muted"
                >
                  {monatKurz(m).split(" ")[0]}
                </th>
              ))}
              <th className="h-9 px-4 text-right text-xs font-medium text-text-muted">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody>
            {objekte.map((o) => {
              const zeilen = konten
                .filter((k) => k.objektId === o)
                .sort((a, b) => a.einheitId.localeCompare(b.einheitId));
              return (
                <Fragment key={o}>
                  <tr>
                    <td
                      colSpan={monate.length + 2}
                      className="bg-surface-muted/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted"
                    >
                      {zeilen[0]?.objektName ?? o}
                    </td>
                  </tr>
                  {zeilen.map((k) => {
                    const jeMonat = new Map(k.monate.map((m) => [m.monat, m]));
                    return (
                      <tr
                        key={k.leaseId}
                        onClick={() => onKlick(k)}
                        className="cursor-pointer border-t border-hairline/70 transition-colors hover:bg-surface-muted/60"
                      >
                        <td className="max-w-[260px] truncate px-4 py-1.5">
                          <span className="text-foreground">{k.mieter}</span>
                          <span className="ml-2 text-xs text-text-subtle">
                            {k.einheitId}
                          </span>
                        </td>
                        {monate.map((m) => {
                          const x = jeMonat.get(m);
                          return (
                            <td key={m} className="px-0.5 py-1.5 text-center">
                              {x ? (
                                <span
                                  title={`${monatLang(m)}: ${MONAT_LABEL[x.status]} · Soll ${euro(x.soll)}, bezahlt ${euro(x.bezahlt)}`}
                                  className={cn(
                                    "mx-auto block h-4 w-6 rounded-[4px]",
                                    ZELLE[x.status],
                                  )}
                                />
                              ) : (
                                <span className="mx-auto block h-px w-3 bg-hairline" />
                              )}
                            </td>
                          );
                        })}
                        <td
                          className={cn(
                            "ziffern whitespace-nowrap px-4 py-1.5 text-right",
                            k.saldo >= 1
                              ? "font-medium text-bad"
                              : k.saldo <= -1
                                ? "text-text-muted"
                                : "text-text-subtle",
                          )}
                        >
                          {Math.abs(k.saldo) < 1
                            ? "0"
                            : k.saldo > 0
                              ? `−${euro(k.saldo)}`
                              : `+${euro(-k.saldo)}`}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline px-4 py-2.5 text-xs text-text-muted">
        {(
          [
            "bezahlt",
            "teilweise",
            "ueberfaellig",
            "noch_nicht_faellig",
          ] as const
        ).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("block h-3 w-4 rounded-[3px]", ZELLE[s])} />
            {MONAT_LABEL[s]}
          </span>
        ))}
        <span className="ml-auto">
          Saldo: − Rückstand, + Guthaben · Zahlungen tilgen immer die älteste
          offene Miete
        </span>
      </div>
    </div>
  );
}
