import { Loader2 } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { formatDate, formatEuro, formatFlaeche } from "@/lib/format";
import type { Funnel } from "@/lib/mandate/report";

import { MandatReiter } from "./MandatReiter";
import { ObjektordnerKarte } from "./ObjektordnerKarte";
import {
  mandatBeschreibung,
  mandatTitel,
  useMandatDetail,
} from "./useMandatDetail";

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="flex flex-col gap-1 border border-hairline bg-surface p-4">
      <span className="text-xs text-text-subtle">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-heading">
        {wert}
      </span>
    </div>
  );
}

export function FunnelBalken({ funnel }: { funnel: Funnel }) {
  const stufen: [string, number][] = [
    ["Ausgewählt", funnel.angesprochen],
    ["Angeschrieben", funnel.angeschrieben],
    ["Rückmeldung", funnel.geantwortet],
    ["Interesse", funnel.interesse],
    ["Besichtigung", funnel.besichtigung],
    ["Kaufangebot", funnel.kaufangebot],
  ];
  const max = Math.max(1, funnel.angesprochen);
  return (
    <div className="flex flex-col gap-2">
      {stufen.map(([label, wert]) => (
        <div key={label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 text-text-muted">{label}</span>
          <div className="h-4 flex-1 bg-surface-muted">
            <div
              className="h-4 bg-brand"
              style={{ width: `${(wert / max) * 100}%` }}
            />
          </div>
          <span className="w-12 text-right font-medium tabular-nums">
            {wert}
          </span>
        </div>
      ))}
      <p className="text-xs text-text-subtle">Absagen: {funnel.absagen}</p>
    </div>
  );
}

export function MandatDetailPage({ sfId }: { sfId: string }) {
  const { token, detail, von, setVon, bis, setBis } = useMandatDetail(sfId);

  const m = detail?.mandat;
  const v = detail?.vorschau;

  return (
    <>
      <PageHeader
        titel={mandatTitel(detail)}
        beschreibung={mandatBeschreibung(detail)}
        reiter={<MandatReiter sfId={sfId} aktiv="ueberblick" />}
      />
      <PageWrapper>
        {!detail || !m || !v ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kennzahl
                label="Angebotspreis"
                wert={
                  m.angebotspreis
                    ? formatEuro(m.angebotspreis)
                    : "nicht gepflegt"
                }
              />
              <Kennzahl
                label="Provision"
                wert={
                  m.provisionProzent != null
                    ? `${m.provisionProzent.toLocaleString("de-DE")} %`
                    : "k. A."
                }
              />
              <Kennzahl label="Eigentümer" wert={m.eigentuemer ?? "k. A."} />
              <Kennzahl
                label="Beauftragt am"
                wert={m.beauftragtAm ? formatDate(m.beauftragtAm) : "k. A."}
              />
              {detail.objekt ? (
                <>
                  <Kennzahl
                    label="Objektart"
                    wert={detail.objekt.objektart ?? "k. A."}
                  />
                  <Kennzahl
                    label="Baujahr"
                    wert={
                      detail.objekt.baujahr
                        ? String(detail.objekt.baujahr)
                        : "k. A."
                    }
                  />
                  <Kennzahl
                    label="Fläche Wohnen / Gewerbe"
                    wert={`${formatFlaeche(detail.objekt.wohnflaeche)} / ${formatFlaeche(detail.objekt.gewerbeflaeche)}`}
                  />
                  <Kennzahl
                    label="Jahresmiete"
                    wert={
                      detail.objekt.jahresmiete
                        ? formatEuro(detail.objekt.jahresmiete)
                        : "k. A."
                    }
                  />
                </>
              ) : null}
            </div>

            <ObjektordnerKarte token={token} sfId={sfId} />

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-subtle">
                Zeitraum von
                <Input
                  type="date"
                  value={von}
                  onChange={(e) => setVon(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-subtle">
                bis
                <Input
                  type="date"
                  value={bis}
                  onChange={(e) => setBis(e.target.value)}
                />
              </label>
              <p className="pb-2 text-xs text-text-subtle">
                Der Zeitraum gilt für die Aktivitäten unten.
              </p>
            </div>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">
                Vermarktungsverlauf ({v.kampagnen.length} Kampagne
                {v.kampagnen.length === 1 ? "" : "n"}, {v.angebote.length}{" "}
                Kaufangebot{v.angebote.length === 1 ? "" : "e"})
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
                Aktivitäten im Zeitraum ({v.aktivitaeten.zeitraum} von{" "}
                {v.aktivitaeten.gesamt})
              </h2>
              {v.aktivitaeten.nachArt.length ? (
                <p className="text-xs text-text-subtle">
                  {v.aktivitaeten.nachArt
                    .map((a) => `${a.art}: ${a.anzahl}`)
                    .join(" · ")}
                </p>
              ) : null}
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {v.aktivitaetsListe.map((a) => (
                      <tr key={a.sfId} className="border-t border-hairline">
                        <td className="w-24 py-1 pr-3 tabular-nums text-text-subtle">
                          {formatDate(a.datum)}
                        </td>
                        <td className="w-28 py-1 pr-3">{a.art}</td>
                        <td className="py-1">{a.betreff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </PageWrapper>
    </>
  );
}
