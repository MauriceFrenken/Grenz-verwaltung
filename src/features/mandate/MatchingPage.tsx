import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { formatEuro } from "@/lib/format";
import type { MatchingDto } from "@/lib/matching/server-fn";

import { MandatReiter } from "./MandatReiter";

function ScoreBalken({ wert, gedimmt }: { wert: number; gedimmt?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 bg-surface-muted">
        <div
          className={gedimmt ? "h-2 bg-text-subtle" : "h-2 bg-[#c4922a]"}
          style={{ width: `${wert}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{wert}</span>
    </div>
  );
}

function reaktionenText(r: { deals: number; rueckmeldungen: number }) {
  return [
    r.deals ? `${r.deals} ${r.deals === 1 ? "Deal" : "Deals"} bei Grenz` : "",
    r.rueckmeldungen
      ? `${r.rueckmeldungen} ${r.rueckmeldungen === 1 ? "Rückmeldung" : "Rückmeldungen"}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function MatchingPage({ sfId }: { sfId: string }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [klasse, setKlasse] = useState("");
  const [dto, setDto] = useState<MatchingDto | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [mitAusschluss, setMitAusschluss] = useState(false);
  const [mindestScore, setMindestScore] = useState(60);
  const [kampagnenName, setKampagnenName] = useState("");
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { matchingFn } = await import("@/lib/matching/server-fn");
      const r = await matchingFn({
        data: {
          supabaseAccessToken: token,
          mandatSfId: sfId,
          objektklasse: klasse || null,
        },
      });
      setDto(r);
      setKampagnenName((n) => n || `Vermarktung ${r.objekt.name}`.slice(0, 80));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Matching fehlgeschlagen.");
    }
  }, [token, sfId, klasse]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const sichtbar = useMemo(
    () =>
      (dto?.treffer ?? []).filter(
        (t) => (mitAusschluss || !t.ausschluss) && t.score >= mindestScore,
      ),
    [dto, mitAusschluss, mindestScore],
  );

  const waehlbar = (t: MatchingDto["treffer"][number]) =>
    Boolean(t.kontaktSfId) && !t.bereitsAngesprochen;

  const kampagneAnlegen = async () => {
    const ids = [...auswahl];
    if (
      !window.confirm(
        `In Salesforce eine Kampagne „${kampagnenName}“ anlegen und ${ids.length} Kontakt(e) als „Geplante Ansprache“ hinzufügen?`,
      )
    )
      return;
    setBusy(true);
    try {
      const { kampagneAusMatchingFn } =
        await import("@/lib/matching/server-fn");
      const { salesforceSessionHintFrisch } =
        await import("@/lib/salesforce/api");
      const sfSitzung = await salesforceSessionHintFrisch();
      const r = await kampagneAusMatchingFn({
        data: {
          supabaseAccessToken: token,
          mandatSfId: sfId,
          kontaktSfIds: ids,
          name: kampagnenName,
          bestaetigt: true,
          sfSitzung,
        },
      });
      toast.success(
        `${r.neuAngelegt ? "Kampagne angelegt" : "Bestehende Vermarktungskampagne ergänzt"}, ${r.mitglieder} Mitglieder${r.fehler.length ? `, ${r.fehler.length} Fehler: ${r.fehler[0]}` : ""}.`,
        {
          duration: 12_000,
        },
      );
      setAuswahl(new Set());
      await laden();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Kampagne konnte nicht angelegt werden.",
        { duration: 14_000 },
      );
    } finally {
      setBusy(false);
    }
  };

  const poolUebernehmen = async (poolId: string, name: string) => {
    if (
      !window.confirm(
        `${name} als Kontakt in Salesforce anlegen (Owner Sebastian Grenz)?`,
      )
    )
      return;
    setBusy(true);
    try {
      const { poolNachSalesforceFn } = await import("@/lib/matching/server-fn");
      const { salesforceSessionHintFrisch } =
        await import("@/lib/salesforce/api");
      const sfSitzung = await salesforceSessionHintFrisch();
      const { kontaktSfId } = await poolNachSalesforceFn({
        data: {
          supabaseAccessToken: token,
          poolId,
          bestaetigt: true,
          sfSitzung,
        },
      });
      setAuswahl((a) => new Set([...a, kontaktSfId]));
      toast.success(
        `${name} in Salesforce angelegt und für die Kampagne ausgewählt.`,
      );
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Übernahme fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const o = dto?.objekt;

  return (
    <>
      <PageHeader
        titel={o ? o.name : "Käufer-Matching"}
        beschreibung={
          o
            ? [
                o.objektart,
                o.orte.join(", "),
                o.preis ? formatEuro(o.preis) : "Preis nicht gepflegt",
                o.einheiten ? `${o.einheiten} Einheiten` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        reiter={<MandatReiter sfId={sfId} aktiv="matching" />}
      />
      <PageWrapper>
        {!dto ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-4 text-xs">
              <label className="flex flex-col gap-1 text-text-subtle">
                Objektklasse (optional)
                <select
                  className="h-9 border border-input bg-background px-2 text-sm"
                  value={klasse}
                  onChange={(e) => setKlasse(e.target.value)}
                >
                  <option value="">nicht bewerten</option>
                  {dto.klassen.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-text-subtle">
                Mindest-Score
                <Input
                  type="number"
                  className="w-24"
                  min={0}
                  max={100}
                  value={mindestScore}
                  onChange={(e) => setMindestScore(Number(e.target.value) || 0)}
                />
              </label>
              <label className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={mitAusschluss}
                  onChange={(e) => setMitAusschluss(e.target.checked)}
                />
                Ausschlüsse zeigen (falsche Nutzung oder Region)
              </label>
              <span className="pb-2 text-text-subtle">
                {sichtbar.length} von {dto.profileGesamt} Ankaufsprofilen
              </span>
            </div>

            <div className="overflow-x-auto border border-hairline bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs text-text-subtle">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2">Investor</th>
                    <th className="px-2 py-2">Profil</th>
                    <th className="px-2 py-2">Score</th>
                    <th className="px-2 py-2 text-right">Abdeckung</th>
                    <th className="px-2 py-2">Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {sichtbar.map((t) => (
                    <Fragment key={t.profilSfId}>
                      <tr className="border-t border-hairline hover:bg-surface-muted">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            disabled={!waehlbar(t)}
                            checked={auswahl.has(t.kontaktSfId ?? "")}
                            onChange={(e) =>
                              setAuswahl((a) => {
                                const n = new Set(a);
                                if (e.target.checked) n.add(t.kontaktSfId!);
                                else n.delete(t.kontaktSfId!);
                                return n;
                              })
                            }
                            aria-label="Für Kampagne auswählen"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            className="flex items-start gap-1 text-left"
                            onClick={() =>
                              setOffen(
                                offen === t.profilSfId ? null : t.profilSfId,
                              )
                            }
                          >
                            {offen === t.profilSfId ? (
                              <ChevronDown className="mt-0.5 h-4 w-4" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-4 w-4" />
                            )}
                            <span>
                              <span className="font-medium text-heading">
                                {t.kontaktName ??
                                  t.firma ??
                                  "Kontakt nicht im Cache"}
                              </span>
                              {t.firma && t.kontaktName ? (
                                <span className="block text-xs text-text-subtle">
                                  {t.firma}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </td>
                        <td className="px-2 py-2 text-xs text-text-subtle">
                          {t.profilName}
                          {t.investorTyp ? ` · ${t.investorTyp}` : ""}
                        </td>
                        <td className="px-2 py-2">
                          <ScoreBalken wert={t.score} gedimmt={t.ausschluss} />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-text-subtle">
                          {t.abdeckung} %
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {t.bereitsAngesprochen
                            ? "bereits angesprochen"
                            : t.ausschluss
                              ? "Ausschluss"
                              : !t.kontaktSfId
                                ? "kein Hauptkontakt"
                                : ""}
                          {t.reaktionen.deals || t.reaktionen.rueckmeldungen ? (
                            <span className="block text-text-subtle">
                              {reaktionenText(t.reaktionen)}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      {offen === t.profilSfId ? (
                        <tr className="bg-surface-muted/50">
                          <td />
                          <td colSpan={5} className="px-2 pb-3 text-xs">
                            <ul className="flex flex-col gap-1">
                              {t.kriterien.map((k) => (
                                <li key={k.id} className="flex gap-3">
                                  <span className="w-24 shrink-0 text-text-subtle">
                                    {k.label} ({k.gewicht})
                                  </span>
                                  <span className="w-10 shrink-0 text-right tabular-nums">
                                    {k.punkte ?? "k. A."}
                                  </span>
                                  <span>{k.begruendung}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">
                Kampagne in Salesforce anlegen
              </h2>
              <p className="text-xs text-text-subtle">
                Nutzt die bestehende Vermarktungskampagne am Objekt oder legt
                eine an und fügt die {auswahl.size} ausgewählten Kontakte mit
                Status „Geplante Ansprache“ hinzu. Es wird nichts versendet.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="max-w-md"
                  value={kampagnenName}
                  onChange={(e) => setKampagnenName(e.target.value)}
                />
                <Button
                  onClick={() => void kampagneAnlegen()}
                  disabled={busy || auswahl.size === 0 || !kampagnenName.trim()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Megaphone className="h-4 w-4" />
                  )}
                  Kampagne mit {auswahl.size} Kontakt(en) anlegen
                </Button>
              </div>
            </section>

            <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">
                Recherche-Pool (nicht in Salesforce)
              </h2>
              <p className="text-xs text-text-subtle">
                Nie kontaktierte Adressen mit Bezug zum Standort. Getrennt vom
                Matching; bei Erstkontakt nach Salesforce übernehmen.
              </p>
              {dto.recherche.length ? (
                <ul className="text-sm">
                  {dto.recherche.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 border-t border-hairline py-1"
                    >
                      <span className="flex-1">
                        {r.name}
                        {r.firma ? `, ${r.firma}` : ""}{" "}
                        <span className="text-text-subtle">
                          ({r.ort}, Quelle {r.quelle}, noch nie kontaktiert)
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void poolUebernehmen(r.id, r.name)}
                      >
                        Nach Salesforce übernehmen
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">
                  Keine Einträge zum Standort.
                </p>
              )}
            </section>
          </div>
        )}
      </PageWrapper>
    </>
  );
}
