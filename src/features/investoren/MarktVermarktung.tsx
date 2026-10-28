import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Radar,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { euroKurz } from "@/features/kennzahlen/hilfen";
import { RadarListe } from "@/features/markt-radar/RadarListe";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";
import type { MarktVermarktungZeile } from "@/lib/matching/server-fn";

function Score({ wert }: { wert: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-14 bg-surface-muted">
        <div className="h-2 bg-brand" style={{ width: `${wert}%` }} />
      </div>
      <span className="w-7 text-right tabular-nums">{wert}</span>
    </div>
  );
}

/**
 * Laufende Vermarktungen gegen gerade aktive Käufer aus der Online-Recherche (Markt-Radar:
 * Immobilien Zeitung, Thomas Daily, öffentliche LinkedIn- und Instagram-Beiträge, Pressemitteilungen).
 */
export function MarktVermarktung() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [zeilen, setZeilen] = useState<MarktVermarktungZeile[] | null>(null);
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [sucht, setSucht] = useState<string | null>(null);

  async function laden() {
    setZeilen(null);
    try {
      const { marktVermarktungFn } = await import("@/lib/matching/server-fn");
      const z = await marktVermarktungFn({
        data: { supabaseAccessToken: token },
      });
      setZeilen(z);
      setOffen(
        new Set(
          z
            .filter((m) => m.treffer.length)
            .slice(0, 1)
            .map((m) => m.mandatSfId),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Abgleich fehlgeschlagen.");
      setZeilen([]);
    }
  }

  useEffect(() => {
    if (token) void laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function suchen(mandatSfId: string) {
    setSucht(mandatSfId);
    try {
      const { marktSucheFuerMandatFn } =
        await import("@/lib/matching/server-fn");
      const r = await marktSucheFuerMandatFn({
        data: { supabaseAccessToken: token, mandatSfId },
      });
      toast.success(
        r.neu
          ? `${r.neu} neue aktive Käufer gefunden.`
          : "Keine neuen Käufer mit belegter Quelle gefunden.",
      );
      await laden();
      setOffen((o) => new Set(o).add(mandatSfId));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Marktsuche fehlgeschlagen.",
      );
    } finally {
      setSucht(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-heading">
              Laufende Vermarktungen gegen aktive Käufer am Markt
            </h2>
            <p className="text-xs text-text-subtle">
              Käufer, die in den letzten 180 Tagen öffentlich als aktiv belegt
              sind: Immobilien Zeitung, Thomas Daily, Pressemitteilungen,
              öffentliche LinkedIn- und Instagram-Beiträge. Nur mit Quelle,
              nichts hinter Login oder Paywall. Bewertet nach Nutzung, Region,
              Ticketgröße und Aktualität, ab Passung 40.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void laden()}
            disabled={!zeilen}
          >
            <RefreshCw className="mr-1 h-4 w-4" /> Neu abgleichen
          </Button>
        </div>

        {!zeilen ? (
          <div className="flex items-center gap-2 text-sm text-text-subtle">
            <Loader2 className="h-4 w-4 animate-spin" /> Gleiche die
            Vermarktungen mit den aktiven Käufern ab …
          </div>
        ) : !zeilen.length ? (
          <p className="text-sm text-text-subtle">
            Keine Mandate in Beauftragung.
          </p>
        ) : (
          zeilen.map((z) => {
            const auf = offen.has(z.mandatSfId);
            return (
              <div key={z.mandatSfId} className="border border-hairline">
                <button
                  type="button"
                  onClick={() =>
                    setOffen((o) => {
                      const n = new Set(o);
                      if (n.has(z.mandatSfId)) n.delete(z.mandatSfId);
                      else n.add(z.mandatSfId);
                      return n;
                    })
                  }
                  className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-muted"
                >
                  {auf ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-medium text-heading">
                    {z.objekt.name}
                  </span>
                  <span className="text-xs text-text-subtle">
                    {[
                      z.objekt.objektart,
                      z.objekt.orte.join(", "),
                      z.objekt.preis ? euroKurz(z.objekt.preis) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="ml-auto text-xs text-text-subtle">
                    {z.treffer.length} aktive Käufer passen
                  </span>
                </button>
                {auf ? (
                  <div className="flex flex-col gap-3 border-t border-hairline p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <Link
                        to="/mandate/$sfId/matching"
                        params={{ sfId: z.mandatSfId }}
                        className="text-brand-text underline"
                      >
                        Käufer-Matching des Mandats (dort zur Kampagne)
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void suchen(z.mandatSfId)}
                        disabled={sucht !== null}
                      >
                        {sucht === z.mandatSfId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Radar className="h-4 w-4" />
                        )}
                        Gezielt Käufer für dieses Objekt suchen
                      </Button>
                    </div>
                    {sucht === z.mandatSfId ? (
                      <p className="flex items-center gap-2 text-sm text-text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" /> Die KI
                        durchsucht Immobiliennews und öffentliche Beiträge der
                        letzten 12 Monate. Das dauert einige Minuten.
                      </p>
                    ) : null}
                    {z.treffer.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-text-subtle">
                            <tr>
                              <th className="px-2 py-2">Käufer</th>
                              <th className="px-2 py-2">Was ist passiert</th>
                              <th className="px-2 py-2">Passung</th>
                              <th className="px-2 py-2">Quelle</th>
                            </tr>
                          </thead>
                          <tbody>
                            {z.treffer.map((m) => (
                              <tr
                                key={m.id}
                                className="border-t border-hairline align-top"
                              >
                                <td className="px-2 py-2">
                                  <span className="font-medium text-heading">
                                    {m.akteur}
                                  </span>
                                  <span className="block text-xs text-text-subtle">
                                    {[
                                      m.akteurTyp,
                                      m.sfBekanntAls
                                        ? `in Salesforce: ${m.sfBekanntAls}`
                                        : "nicht in Salesforce",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </td>
                                <td className="max-w-md px-2 py-2 text-xs">
                                  {m.ereignis}
                                  {m.volumenEur ? (
                                    <span className="text-text-subtle">
                                      {" "}
                                      ({euroKurz(m.volumenEur)})
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-2 py-2">
                                  <Score wert={m.score} />
                                  {m.gruende.length ? (
                                    <span className="mt-1 block text-xs text-text-subtle">
                                      {m.gruende.join(", ")}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-2 py-2 text-xs">
                                  <a
                                    href={m.quelleUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 hover:underline"
                                  >
                                    {m.quelleMedium ?? "Quelle"}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                  <span className="block text-text-subtle">
                                    {formatDate(m.ereignisAm ?? m.createdAt)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-text-subtle">
                        Noch kein passender aktiver Käufer belegt. Die gezielte
                        Suche findet Käufer vergleichbarer Objekte.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-heading">
          Alle Funde der Online-Recherche (prüfen, verwerfen, in Salesforce
          anlegen)
        </summary>
        <div className="mt-3">
          <RadarListe seite="kaeufer" />
        </div>
      </details>
    </div>
  );
}
