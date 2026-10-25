import { Loader2 } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatEuro } from "@/lib/format";

import { FunnelBalken } from "./MandatDetailPage";
import { MandatReiter } from "./MandatReiter";
import {
  mandatBeschreibung,
  mandatTitel,
  useMandatDetail,
} from "./useMandatDetail";

/** Reiter „Interessenten“: Vermarktungs-Funnel und Kaufangebote. */
export function MandatInteressentenPage({ sfId }: { sfId: string }) {
  const { detail } = useMandatDetail(sfId);
  const v = detail?.vorschau;

  return (
    <>
      <PageHeader
        titel={mandatTitel(detail)}
        beschreibung={mandatBeschreibung(detail)}
        reiter={<MandatReiter sfId={sfId} aktiv="interessenten" />}
      />
      <PageWrapper>
        {!v ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">
                Vermarktungs-Funnel ({v.kampagnen.length} Kampagne
                {v.kampagnen.length === 1 ? "" : "n"})
              </h2>
              {v.kampagnen.length ? (
                <FunnelBalken funnel={v.funnel} />
              ) : (
                <p className="text-sm text-text-muted">
                  In Salesforce ist keine Kampagne mit diesem Objekt verknüpft.
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">
                Kaufangebote ({v.angebote.length})
              </h2>
              {v.angebote.length ? (
                <table className="text-sm">
                  <tbody>
                    {v.angebote.map((a) => (
                      <tr key={a.quelleId} className="border-t border-hairline">
                        <td className="py-1 pr-3">{a.bieter}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {a.betrag ? formatEuro(a.betrag) : "ohne Betrag"}
                        </td>
                        <td className="py-1 text-text-subtle">{a.phase}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-text-muted">
                  Noch keine Kaufangebote.
                </p>
              )}
            </section>
          </div>
        )}
      </PageWrapper>
    </>
  );
}
