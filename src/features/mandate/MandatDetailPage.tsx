import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatEuro, formatFlaeche } from "@/lib/format";
import type { Funnel } from "@/lib/mandate/report";
import type { MandatDetail } from "@/lib/mandate/server-fn";

import { DokumenteKarte } from "./DokumenteKarte";

const STATUS_TEXT: Record<string, string> = { entwurf: "Entwurf", freigegeben: "Freigegeben", versendet: "Versendet" };

function tagVor(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="flex flex-col gap-1 border border-hairline bg-surface p-4">
      <span className="text-xs text-text-subtle">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-heading">{wert}</span>
    </div>
  );
}

export function FunnelBalken({ funnel }: { funnel: Funnel }) {
  const stufen: [string, number][] = [
    ["Angesprochen", funnel.angesprochen],
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
            <div className="h-4 bg-[#c4922a]" style={{ width: `${(wert / max) * 100}%` }} />
          </div>
          <span className="w-12 text-right font-medium tabular-nums">{wert}</span>
        </div>
      ))}
      <p className="text-xs text-text-subtle">Absagen: {funnel.absagen}</p>
    </div>
  );
}

export function MandatDetailPage({ sfId }: { sfId: string }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const navigate = useNavigate();
  const [von, setVon] = useState(tagVor(30));
  const [bis, setBis] = useState(tagVor(0));
  const [detail, setDetail] = useState<MandatDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { mandatDetailFn } = await import("@/lib/mandate/server-fn");
      setDetail(await mandatDetailFn({ data: { supabaseAccessToken: token, sfId, von, bis } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mandat konnte nicht geladen werden.");
    }
  }, [token, sfId, von, bis]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const reportAnlegen = async () => {
    setBusy(true);
    try {
      const { reportAnlegenFn } = await import("@/lib/mandate/server-fn");
      const { id } = await reportAnlegenFn({ data: { supabaseAccessToken: token, sfId, von, bis } });
      toast.success("Bericht angelegt. Zahlen sind auf heute eingefroren.");
      await navigate({ to: "/mandate/$sfId/report/$id", params: { sfId, id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bericht konnte nicht angelegt werden.");
    } finally {
      setBusy(false);
    }
  };

  const m = detail?.mandat;
  const v = detail?.vorschau;

  return (
    <>
      <PageHeader
        titel={m ? (m.objekt ?? m.name) : "Mandat"}
        beschreibung={m ? [m.name, m.adresse, m.status].filter(Boolean).join(" · ") : undefined}
        aktionen={
          <Button onClick={() => void reportAnlegen()} disabled={busy || !detail}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            Vermarktungsbericht anlegen
          </Button>
        }
      />
      <PageWrapper>
        {!detail || !m || !v ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kennzahl label="Angebotspreis" wert={m.angebotspreis ? formatEuro(m.angebotspreis) : "nicht gepflegt"} />
              <Kennzahl label="Provision" wert={m.provisionProzent != null ? `${m.provisionProzent.toLocaleString("de-DE")} %` : "k. A."} />
              <Kennzahl label="Eigentümer" wert={m.eigentuemer ?? "k. A."} />
              <Kennzahl label="Beauftragt am" wert={m.beauftragtAm ? formatDate(m.beauftragtAm) : "k. A."} />
              {detail.objekt ? (
                <>
                  <Kennzahl label="Objektart" wert={detail.objekt.objektart ?? "k. A."} />
                  <Kennzahl label="Baujahr" wert={detail.objekt.baujahr ? String(detail.objekt.baujahr) : "k. A."} />
                  <Kennzahl
                    label="Fläche Wohnen / Gewerbe"
                    wert={`${formatFlaeche(detail.objekt.wohnflaeche)} / ${formatFlaeche(detail.objekt.gewerbeflaeche)}`}
                  />
                  <Kennzahl label="Jahresmiete" wert={detail.objekt.jahresmiete ? formatEuro(detail.objekt.jahresmiete) : "k. A."} />
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-subtle">
                Zeitraum von
                <Input type="date" value={von} onChange={(e) => setVon(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-subtle">
                bis
                <Input type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
              </label>
              <p className="pb-2 text-xs text-text-subtle">Der Zeitraum gilt für Aktivitäten und den neuen Bericht.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                <h2 className="text-sm font-semibold text-heading">
                  Vermarktungsverlauf ({v.kampagnen.length} Kampagne{v.kampagnen.length === 1 ? "" : "n"})
                </h2>
                {v.kampagnen.length ? (
                  <FunnelBalken funnel={v.funnel} />
                ) : (
                  <p className="text-sm text-text-muted">In Salesforce ist keine Kampagne mit diesem Objekt verknüpft.</p>
                )}
              </section>

              <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                <h2 className="text-sm font-semibold text-heading">Angebote ({v.angebote.length})</h2>
                {v.angebote.length ? (
                  <table className="text-sm">
                    <tbody>
                      {v.angebote.map((a) => (
                        <tr key={a.quelleId} className="border-t border-hairline">
                          <td className="py-1 pr-3">{a.bieter}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{a.betrag ? formatEuro(a.betrag) : "ohne Betrag"}</td>
                          <td className="py-1 text-text-subtle">{a.phase}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-text-muted">Noch keine Kaufangebote.</p>
                )}
              </section>
            </div>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">
                Aktivitäten im Zeitraum ({v.aktivitaeten.zeitraum} von {v.aktivitaeten.gesamt})
              </h2>
              {v.aktivitaeten.nachArt.length ? (
                <p className="text-xs text-text-subtle">{v.aktivitaeten.nachArt.map((a) => `${a.art}: ${a.anzahl}`).join(" · ")}</p>
              ) : null}
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {v.aktivitaetsListe.map((a) => (
                      <tr key={a.sfId} className="border-t border-hairline">
                        <td className="w-24 py-1 pr-3 tabular-nums text-text-subtle">{formatDate(a.datum)}</td>
                        <td className="w-28 py-1 pr-3">{a.art}</td>
                        <td className="py-1">{a.betreff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <DokumenteKarte token={token} sfId={sfId} />

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">Vermarktungsberichte</h2>
              {detail.reports.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {detail.reports.map((r) => (
                      <tr key={r.id} className="border-t border-hairline">
                        <td className="py-2 pr-3">
                          <Link
                            to="/mandate/$sfId/report/$id"
                            params={{ sfId, id: r.id }}
                            className="font-medium text-heading hover:underline"
                          >
                            {formatDate(r.zeitraumVon)} bis {formatDate(r.zeitraumBis)}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{STATUS_TEXT[r.status] ?? r.status}</td>
                        <td className="py-2 text-text-subtle">
                          angelegt {formatDate(r.createdAt)}
                          {r.versendetAm ? `, versendet ${formatDate(r.versendetAm)} an ${r.versendetAn}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-text-muted">Noch kein Bericht. Zeitraum wählen und „Vermarktungsbericht anlegen“.</p>
              )}
            </section>
          </div>
        )}
      </PageWrapper>
    </>
  );
}
