import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Megaphone,
  Radar,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatEuro } from "@/lib/format";
import type { MatchingDto } from "@/lib/matching/server-fn";

import {
  KreisMarke,
  ScoreAufschluesselung,
  ScoreModellHinweis,
} from "./KaeuferScore";
import { MandatReiter } from "./MandatReiter";

const KREIS_FILTER: Record<string, { label: string; kreise: string[] }> = {
  A: { label: "nur A-Kreis", kreise: ["A"] },
  AB: { label: "A und B", kreise: ["A", "B"] },
  ABC: { label: "A, B und C", kreise: ["A", "B", "C"] },
  alle: { label: "alle passenden", kreise: ["A", "B", "C", "unter"] },
};

function ScoreBalken({ wert, gedimmt }: { wert: number; gedimmt?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 bg-surface-muted">
        <div
          className={gedimmt ? "h-2 bg-text-subtle" : "h-2 bg-brand"}
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
  const [kreisFilter, setKreisFilter] = useState("alle");
  const [listenAnzahl, setListenAnzahl] = useState(200);
  const [kampagnenName, setKampagnenName] = useState("");
  const [busy, setBusy] = useState(false);
  const [marktAlle, setMarktAlle] = useState(false);
  const [marktSuche, setMarktSuche] = useState(false);
  const [listenAuswahl, setListenAuswahl] = useState<Set<string>>(new Set());

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
      (dto?.treffer ?? []).filter((t) =>
        t.ausschluss
          ? mitAusschluss
          : KREIS_FILTER[kreisFilter].kreise.includes(t.bewertung.kreis),
      ),
    [dto, mitAusschluss, kreisFilter],
  );

  const listenSichtbar = useMemo(
    () =>
      (dto?.listen ?? []).filter((t) =>
        KREIS_FILTER[kreisFilter].kreise.includes(t.kreis),
      ),
    [dto, kreisFilter],
  );

  const listenAnlegen = async () => {
    const schluessel = [...listenAuswahl].slice(0, 25);
    if (
      !window.confirm(
        `${schluessel.length} Investor(en) aus den Listen in Salesforce anlegen (Account, Kontakt und Ankaufsprofil, Owner Sebastian Grenz)? Dubletten und insolvente Firmen werden übersprungen. Danach stehen sie oben bei den Ankaufsprofilen und lassen sich zur Kampagne hinzufügen.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { quellenAnlegenFn } = await import("@/lib/investoren/server-fn");
      const r = await quellenAnlegenFn({
        data: { supabaseAccessToken: token, schluessel, bestaetigt: true },
      });
      toast.success(
        `${r.angelegt} in Salesforce angelegt${r.fehler.length ? `, ${r.fehler.length} nicht: ${r.fehler[0]}` : ""}.`,
        { duration: 12_000 },
      );
      setListenAuswahl(new Set());
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Anlegen fehlgeschlagen.", {
        duration: 14_000,
      });
    } finally {
      setBusy(false);
    }
  };

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

  const marktSuchen = async () => {
    setMarktSuche(true);
    try {
      const { marktSucheFuerMandatFn } =
        await import("@/lib/matching/server-fn");
      const r = await marktSucheFuerMandatFn({
        data: { supabaseAccessToken: token, mandatSfId: sfId },
      });
      toast.success(
        r.neu
          ? `${r.neu} neue aktive Käufer gefunden.`
          : "Keine neuen Käufer mit belegter Quelle gefunden.",
      );
      await laden();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Marktsuche fehlgeschlagen.",
        {
          duration: 12_000,
        },
      );
    } finally {
      setMarktSuche(false);
    }
  };

  const umschalten = (id: string, an: boolean) =>
    setAuswahl((a) => {
      const n = new Set(a);
      if (an) n.add(id);
      else n.delete(id);
      return n;
    });

  const markt = (dto?.markt ?? []).filter((m) => marktAlle || m.score >= 40);

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
        aktionen={
          <Button variant="outline" size="sm" asChild>
            <Link to="/investoren" search={{ tab: "vermarktungen" }}>
              Alle Vermarktungen
            </Link>
          </Button>
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
                Kreis
                <select
                  className="h-9 border border-input bg-background px-2 text-sm"
                  value={kreisFilter}
                  onChange={(e) => setKreisFilter(e.target.value)}
                >
                  {Object.entries(KREIS_FILTER).map(([k, f]) => (
                    <option key={k} value={k}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={mitAusschluss}
                  onChange={(e) => setMitAusschluss(e.target.checked)}
                />
                Ausschlüsse zeigen (DO_NOT_CONTACT, Absage, falsche Nutzung oder
                Region)
              </label>
              <span className="pb-2 text-text-subtle">
                {sichtbar.length} von {dto.profileGesamt}{" "}
                {dto.profilQuelle === "investoren"
                  ? "Investoren aus Salesforce"
                  : "Ankaufsprofilen"}
                , dazu {listenSichtbar.length} von{" "}
                {dto.listenGesamt.toLocaleString("de-DE")} aus den Listen
                (gesamte Investorendatenbank, ohne erloschene, gesperrte und
                insolvente Firmen)
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-heading">
                Interne Datenbank
              </h2>
              <p className="text-xs text-text-subtle">
                Ankaufsprofile aus Salesforce, Investoren aus den Listen und
                Kontakte, die bei ähnlichen Grenz-Mandaten Interesse gezeigt
                haben.
              </p>
              <ScoreModellHinweis />
              {!o?.preis ? (
                <p className="text-xs font-medium text-warn">
                  Angebotspreis fehlt im Mandat: Volumen und Faktor zählen nur
                  mit 40 %, dadurch erreicht kaum ein Investor den A-Kreis.
                </p>
              ) : null}
            </div>
            <h3 className="text-sm font-semibold text-heading">
              Ankaufsprofile in Salesforce
            </h3>
            <div className="overflow-x-auto border border-hairline bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs text-text-subtle">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2">Kreis</th>
                    <th className="px-2 py-2">Investor</th>
                    <th className="px-2 py-2">Profil</th>
                    <th className="px-2 py-2">Score</th>
                    <th
                      className="px-2 py-2 text-right"
                      title="Reine Objektpassung aus den Ankaufskriterien und deren Abdeckung"
                    >
                      Passung
                    </th>
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
                          <KreisMarke kreis={t.bewertung.kreis} />
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
                          {t.investorStatus === "aktiv" ? (
                            <span className="ml-1 font-medium text-ok">
                              · aktiv
                            </span>
                          ) : t.investorStatus === "kein_interesse" ? (
                            <span className="ml-1 font-medium text-warn">
                              · kein Interesse
                            </span>
                          ) : null}
                          {t.prioritaet ? ` · ${t.prioritaet}` : ""}
                        </td>
                        <td className="px-2 py-2">
                          <ScoreBalken wert={t.score} gedimmt={t.ausschluss} />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-xs text-text-subtle">
                          {t.passung}
                          <span className="block">{t.abdeckung} % belegt</span>
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
                          <td colSpan={6} className="px-2 pb-3">
                            <ScoreAufschluesselung b={t.bewertung} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-heading">
                  Weitere Investoren aus der Datenbank, noch nicht in Salesforce
                  ({listenSichtbar.length})
                </h3>
                <p className="text-xs text-text-subtle">
                  Aus 7Plus, Leadliste, Suchkunden und Recherche, alle ohne
                  Ausschluss nach Score. Ohne Suchgebiet zählen NRW-Bezug oder
                  Firmensitz. Für die Kampagne zuerst in Salesforce anlegen.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || listenAuswahl.size === 0}
                onClick={() => void listenAnlegen()}
              >
                {Math.min(listenAuswahl.size, 25)} in Salesforce anlegen
              </Button>
            </div>
            {listenSichtbar.length ? (
              <div className="max-h-[480px] overflow-auto border border-hairline bg-surface">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-muted text-left text-xs text-text-subtle">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-2 py-2">Kreis</th>
                      <th className="px-2 py-2">Investor</th>
                      <th className="px-2 py-2">Score</th>
                      <th className="px-2 py-2">Warum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listenSichtbar.slice(0, listenAnzahl).map((t) => (
                      <tr
                        key={t.schluessel}
                        className="border-t border-hairline align-top hover:bg-surface-muted"
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={listenAuswahl.has(t.schluessel)}
                            onChange={(e) =>
                              setListenAuswahl((a) => {
                                const n = new Set(a);
                                if (e.target.checked) n.add(t.schluessel);
                                else n.delete(t.schluessel);
                                return n;
                              })
                            }
                            aria-label="Zum Anlegen auswählen"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <KreisMarke kreis={t.kreis} />
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-medium text-heading">
                            {t.firma ?? t.person ?? "k. A."}
                          </span>
                          <span className="block text-xs text-text-subtle">
                            {[
                              t.person && t.person !== t.firma
                                ? t.person
                                : null,
                              t.ort,
                              t.quelle,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <ScoreBalken wert={t.score} />
                        </td>
                        <td
                          className="px-2 py-2 text-xs text-text-muted"
                          title={t.bewertung.bausteine
                            .map(
                              (b) =>
                                `${b.label}: ${b.punkte}/${b.max} – ${b.begruendung}`,
                            )
                            .join("\n")}
                        >
                          {t.gruende.join(" ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {listenSichtbar.length > listenAnzahl ? (
                  <div className="border-t border-hairline p-2 text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setListenAnzahl((n) => n + 200)}
                    >
                      Weitere{" "}
                      {Math.min(200, listenSichtbar.length - listenAnzahl)} von{" "}
                      {listenSichtbar.length - listenAnzahl} anzeigen
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                Keine passenden Investoren in den Listen.
              </p>
            )}

            <h3 className="text-sm font-semibold text-heading">
              Interessenten ähnlicher Mandate ({dto.historie.length})
            </h3>
            {dto.historie.length ? (
              <div className="overflow-x-auto border border-hairline bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-muted text-left text-xs text-text-subtle">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-2 py-2">Kontakt</th>
                      <th className="px-2 py-2">Reagiert auf</th>
                      <th className="px-2 py-2">Score</th>
                      <th className="px-2 py-2">Hinweis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dto.historie.map((h) => (
                      <tr
                        key={h.kontaktSfId}
                        className="border-t border-hairline align-top hover:bg-surface-muted"
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            disabled={!h.waehlbar || h.bereitsAngesprochen}
                            checked={auswahl.has(h.kontaktSfId)}
                            onChange={(e) =>
                              umschalten(h.kontaktSfId, e.target.checked)
                            }
                            aria-label="Für Kampagne auswählen"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-medium text-heading">
                            {h.kontaktName ??
                              h.firma ??
                              "Kontakt nicht im Cache"}
                          </span>
                          {h.firma && h.kontaktName ? (
                            <span className="block text-xs text-text-subtle">
                              {h.firma}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {h.objekte.slice(0, 3).map((x) => (
                            <span key={x.mandat.sfId} className="block">
                              {x.mandat.name}
                              <span className="text-text-subtle">
                                {" "}
                                · {x.stufe}
                                {x.mandat.objektart
                                  ? ` · ${x.mandat.objektart}`
                                  : ""}
                              </span>
                            </span>
                          ))}
                          {h.objekte.length > 3 ? (
                            <span className="text-text-subtle">
                              und {h.objekte.length - 3} weitere
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <ScoreBalken wert={h.score} />
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {h.bereitsAngesprochen
                            ? "bereits angesprochen"
                            : !h.waehlbar
                              ? "Firma ohne Kontaktperson"
                              : ""}
                          {h.hatAnkaufsprofil ? (
                            <span className="block text-text-subtle">
                              hat Ankaufsprofil
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                Keine Rückmeldungen auf vergleichbare Mandate.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-heading">
                  Extern: gerade aktiv am Markt
                </h2>
                <p className="text-xs text-text-subtle">
                  Käufer aus der Online-Recherche (Immobiliennews, öffentliche
                  LinkedIn- und Instagram-Beiträge, nur mit belegter Quelle),
                  bewertet nach Nutzung, Region, Ticketgröße und Aktualität.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={marktAlle}
                    onChange={(e) => setMarktAlle(e.target.checked)}
                  />
                  auch schwache Treffer
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void marktSuchen()}
                  disabled={marktSuche}
                >
                  {marktSuche ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Radar className="h-4 w-4" />
                  )}
                  Käufer für dieses Objekt suchen
                </Button>
              </div>
            </div>
            {marktSuche ? (
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Die KI durchsucht
                Immobiliennews der letzten 12 Monate nach Käufern vergleichbarer
                Objekte. Das dauert einige Minuten.
              </p>
            ) : null}
            {markt.length ? (
              <div className="overflow-x-auto border border-hairline bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-muted text-left text-xs text-text-subtle">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-2 py-2">Käufer</th>
                      <th className="px-2 py-2">Was ist passiert</th>
                      <th className="px-2 py-2">Passung</th>
                      <th className="px-2 py-2">Quelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markt.map((m) => {
                      const sfKontakt =
                        m.sfKontaktSfId?.startsWith("003") === true;
                      return (
                        <tr
                          key={m.id}
                          className="border-t border-hairline align-top hover:bg-surface-muted"
                        >
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              disabled={!sfKontakt}
                              checked={auswahl.has(m.sfKontaktSfId ?? "")}
                              onChange={(e) =>
                                umschalten(m.sfKontaktSfId!, e.target.checked)
                              }
                              aria-label="Für Kampagne auswählen"
                              title={
                                sfKontakt
                                  ? undefined
                                  : "Erst als Kontakt in Salesforce anlegen (Investoren › Vermarktungen gegen aktive Käufer › Alle Funde)"
                              }
                            />
                          </td>
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
                                ({formatEuro(m.volumenEur)})
                              </span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">
                            <ScoreBalken wert={m.score} />
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                {dto.markt.length
                  ? "Nur schwache Treffer im Markt-Radar."
                  : "Noch keine aktiven Käufer im Markt-Radar."}{" "}
                Mit „Käufer für dieses Objekt suchen“ sucht die KI gezielt nach
                Käufern vergleichbarer Objekte.
              </p>
            )}

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
