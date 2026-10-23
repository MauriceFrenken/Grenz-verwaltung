import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { EbicsUmsaetzeDto } from "@/lib/ebics/types";
import { formatDate, formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Kontostände und letzte Buchungen aus dem EBICS-Abruf. */
export function EbicsUmsaetze({ neuLaden }: { neuLaden: number }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [daten, setDaten] = useState<EbicsUmsaetzeDto | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    setLaedt(true);
    try {
      const { ebicsUmsaetzeLadenFn } = await import("@/lib/ebics/server-fn");
      setDaten(
        await ebicsUmsaetzeLadenFn({ data: { supabaseAccessToken: token } }),
      );
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLaedt(false);
    }
  }, [token]);

  useEffect(() => {
    void laden();
  }, [laden, neuLaden]);

  const konten = daten?.konten ?? [];
  const buchungen = daten?.buchungen ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="label-caps text-text-muted">Konten</h2>
        <ul className="divide-y divide-hairline border border-hairline">
          {konten.length === 0 ? (
            <li className="px-4 py-3 text-sm text-text-muted">
              {laedt ? "Lädt…" : "Noch keine Konten abgerufen."}
            </li>
          ) : null}
          {konten.map((k) => (
            <li
              key={k.iban}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-mono text-heading">{k.iban}</div>
                {k.bezeichnung ? (
                  <div className="text-xs text-text-muted">{k.bezeichnung}</div>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-medium tabular-nums text-heading">
                  {formatEuro(k.saldo)}
                </div>
                <div className="text-xs text-text-muted">
                  {k.saldoStichtag
                    ? `Stand ${formatDate(k.saldoStichtag)}`
                    : "–"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="label-caps text-text-muted">Letzte Buchungen</h2>
        <div className="overflow-x-auto border border-hairline">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Datum</th>
                <th className="px-4 py-2 font-medium">
                  Auftraggeber / Empfänger
                </th>
                <th className="px-4 py-2 font-medium">Verwendungszweck</th>
                <th className="px-4 py-2 text-right font-medium">Betrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {buchungen.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-text-muted">
                    {laedt ? "Lädt…" : "Noch keine Buchungen."}
                  </td>
                </tr>
              ) : null}
              {buchungen.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                    {formatDate(b.buchungsdatum)}
                  </td>
                  <td className="max-w-[16rem] truncate px-4 py-2 text-heading">
                    {b.auftraggeberName || "–"}
                  </td>
                  <td
                    className="max-w-[24rem] truncate px-4 py-2 text-text-muted"
                    title={b.verwendungszweck ?? undefined}
                  >
                    {b.verwendungszweck || "–"}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-2 text-right tabular-nums",
                      b.betrag < 0 ? "text-danger" : "text-heading",
                    )}
                  >
                    {formatEuro(b.betrag)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
