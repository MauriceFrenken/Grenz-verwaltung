import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { formatEuro, formatInt } from "@/lib/format";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { LeistungDto } from "@/lib/personal/typen";

import { Kasten } from "./bausteine";
import type { PersonalKontext } from "./usePersonal";

/** Abschlüsse, Provision und Aktivität je Makler aus dem Salesforce-Cache. */
export function LeistungTab({
  k,
  nurId,
}: {
  k: PersonalKontext;
  /** Nur diesen Mitarbeiter zeigen (Profilseite). */
  nurId?: string;
}) {
  const { daten, token } = k;
  const [leistung, setLeistung] = useState<LeistungDto | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLeistung(null);
    void (async () => {
      try {
        const { personalLeistungFn } = await import("@/lib/personal/server-fn");
        setLeistung(
          await personalLeistungFn({
            data: { supabaseAccessToken: token, jahr: daten.jahr },
          }),
        );
        setFehler(null);
      } catch (err) {
        setFehler(apiFehlermeldung(err));
      }
    })();
  }, [token, daten.jahr]);

  if (fehler) return <p className="text-sm text-danger">{fehler}</p>;
  if (!leistung) return <Loader2 className="size-4 animate-spin" />;
  const zeilen = nurId
    ? leistung.zeilen.filter((z) => z.mitarbeiterId === nurId)
    : leistung.zeilen;

  return (
    <div className="flex flex-col gap-4">
      <Kasten titel={`Leistung ${leistung.jahr}`}>
        {zeilen.length === 0 ? (
          <p className="text-sm text-text-muted">
            Keine Mitarbeiter mit Salesforce-Verknüpfung. Verknüpfe in der Akte
            den Salesforce-Benutzer.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-subtle">
                  <th className="py-2 pr-3 font-medium">Mitarbeiter</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Aktivitäten
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Termine</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Neue Mandate
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Abschlüsse
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Vermittelter Kaufpreis
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Provision
                  </th>
                  <th className="py-2 font-medium">Ziel</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => {
                  const quote = z.zielEur
                    ? Math.min(1, z.provisionEur / z.zielEur)
                    : null;
                  return (
                    <tr
                      key={z.mitarbeiterId}
                      className="border-t border-hairline"
                    >
                      <td className="py-2 pr-3 font-medium text-heading">
                        {z.name}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatInt(z.aktivitaeten)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatInt(z.termine)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatInt(z.mandateNeu)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatInt(z.abschluesse)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {z.kaufpreisEur ? formatEuro(z.kaufpreisEur) : "–"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {z.provisionEur ? formatEuro(z.provisionEur) : "–"}
                      </td>
                      <td className="min-w-40 py-2">
                        {quote !== null ? (
                          <div className="flex flex-col gap-1">
                            <div className="h-2 w-full bg-surface-muted">
                              <div
                                className="h-2 bg-[var(--gc-navy)]"
                                style={{ width: `${quote * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-text-subtle">
                              {Math.round((z.provisionEur / z.zielEur!) * 100)}{" "}
                              % von {formatEuro(z.zielEur)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-text-subtle">
                            kein Ziel
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-text-subtle">
          Aus dem Salesforce-Abgleich: Aktivitäten und Termine nach Bearbeiter,
          neue Mandate nach Beauftragungsdatum und Ersteller, Abschlüsse = Deals
          in „Invoice Paid“ bzw. „Closed Won“ nach Abschlussdatum, Provision aus
          dem Deal-Feld „Provision“. Ziele werden in der Akte je Jahr gepflegt.
          {leistung.ohneSalesforce.length
            ? ` Ohne Salesforce-Verknüpfung: ${leistung.ohneSalesforce.join(", ")}.`
            : ""}
        </p>
      </Kasten>
    </div>
  );
}
