import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { darlehenApi } from "@/api/darlehen";
import { boardRepository } from "@/lib/db/config";
import { datum, euro } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import { BOARD_DATEN_KEY } from "@/modules/shell/daten";
import type { DarlehenBuchung, DarlehenBuchungTyp } from "@/types";

const TYPEN: DarlehenBuchungTyp[] = [
  "Auszahlung",
  "Rückzahlung",
  "Zinsen",
  "Tilgung",
  "unklar",
];

/**
 * Bankbuchungen, die dem Darlehen zugeordnet sind (Tabelle `darlehen_buchungen`).
 * Unklare Buchungen lassen sich hier einordnen; das ändert `darlehen_stand`.
 * Nur mit Bens Datenbank, im Demo-Modus ausgeblendet.
 */
export function Kontobewegungen({ darlehenId }: { darlehenId: string }) {
  const live = boardRepository().quelle === "live";
  const queryClient = useQueryClient();
  const [speichert, setSpeichert] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["board", "darlehen-buchungen", darlehenId],
    queryFn: () => darlehenApi.listBuchungen(darlehenId),
    enabled: live,
  });

  if (!live) return null;

  const typAendern = async (b: DarlehenBuchung, typ: DarlehenBuchungTyp) => {
    setSpeichert(b.id);
    try {
      await darlehenApi.setBuchungTyp(b, typ);
      toast.success("Buchung aktualisiert");
      await refetch();
      await queryClient.invalidateQueries({ queryKey: BOARD_DATEN_KEY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(null);
    }
  };

  if (isLoading)
    return <p className="text-sm text-text-muted">Buchungen werden geladen…</p>;
  if (error)
    return <p className="text-sm text-bad">{(error as Error).message}</p>;
  if (!data?.length)
    return (
      <p className="text-sm text-text-muted">
        Noch keine Bankbuchung diesem Darlehen zugeordnet.
      </p>
    );

  return (
    <ul className="divide-y divide-hairline border border-hairline">
      {data.map((b) => (
        <li
          key={b.id}
          className={cn(
            "flex flex-col gap-1 px-3 py-2",
            b.typ === "unklar" && "bg-warn-soft/50",
          )}
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="tabular-nums">{datum(b.buchungsdatum)}</span>
            <span className="font-medium tabular-nums">{euro(b.betrag)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-text-muted">
              {[b.auftraggeberName, b.verwendungszweck]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {b.typ === "Rate" ? (
              <span className="text-xs text-text-muted">
                Rate: Zins {euro(b.zinsAnteil)} · Tilgung{" "}
                {euro(b.tilgungAnteil)}
              </span>
            ) : (
              <select
                aria-label="Buchungsart"
                value={b.typ}
                disabled={speichert === b.id}
                onChange={(e) =>
                  void typAendern(b, e.target.value as DarlehenBuchungTyp)
                }
                className="h-7 cursor-pointer rounded-md border border-input bg-surface px-2 text-xs text-foreground outline-none"
              >
                {TYPEN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
