import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Loader2, Megaphone, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { euroKurz } from "@/features/kennzahlen/hilfen";
import { useAuth } from "@/hooks/useAuth";
import type { VermarktungZeile } from "@/lib/matching/server-fn";

import { StatusMarke } from "./hilfen";

type Frage = { art: "kampagne"; zeile: VermarktungZeile; ids: string[] } | { art: "anlegen"; zeile: VermarktungZeile; ids: string[] };

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
 * Laufende Vermarktungen gegen die Investorendatenbank: je Mandat qualifizierte Investoren,
 * die noch nicht in der Kampagne sind, und passende Listen-Investoren zum Anlegen.
 */
export function VermarktungsAbgleich() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [zeilen, setZeilen] = useState<VermarktungZeile[] | null>(null);
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [auswahl, setAuswahl] = useState<Record<string, Set<string>>>({});
  const [listenAuswahl, setListenAuswahl] = useState<Record<string, Set<string>>>({});
  const [frage, setFrage] = useState<Frage | null>(null);
  const [busy, setBusy] = useState(false);

  async function laden() {
    setZeilen(null);
    try {
      const { vermarktungsAbgleichFn } = await import("@/lib/matching/server-fn");
      const z = await vermarktungsAbgleichFn({ data: { supabaseAccessToken: token } });
      setZeilen(z);
      // Vorauswahl: alle Treffer mit Kontakt; das erste Mandat aufgeklappt.
      setAuswahl(Object.fromEntries(z.map((m) => [m.mandatSfId, new Set(m.treffer.flatMap((t) => (t.kontaktSfId ? [t.kontaktSfId] : [])))])));
      setListenAuswahl({});
      setOffen(new Set(z.slice(0, 1).map((m) => m.mandatSfId)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Abgleich fehlgeschlagen.");
      setZeilen([]);
    }
  }

  useEffect(() => {
    if (token) void laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function umschalten(ziel: Record<string, Set<string>>, setzen: (x: Record<string, Set<string>>) => void, mandat: string, id: string) {
    const s = new Set(ziel[mandat] ?? []);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setzen({ ...ziel, [mandat]: s });
  }

  async function ausfuehren() {
    if (!frage) return;
    setBusy(true);
    try {
      if (frage.art === "kampagne") {
        const { kampagneAusMatchingFn } = await import("@/lib/matching/server-fn");
        const { salesforceSessionHintFrisch } = await import("@/lib/salesforce/api");
        const r = await kampagneAusMatchingFn({
          data: {
            supabaseAccessToken: token,
            mandatSfId: frage.zeile.mandatSfId,
            kontaktSfIds: frage.ids,
            name: frage.zeile.kampagne?.name ?? `Vermarktung ${frage.zeile.objekt.name}`,
            bestaetigt: true,
            sfSitzung: await salesforceSessionHintFrisch(),
          },
        });
        toast.success(
          `${r.neuAngelegt ? "Kampagne angelegt" : "Kampagne ergänzt"}: ${r.mitglieder} Investoren als „Geplante Ansprache“${r.fehler.length ? `, ${r.fehler.length} Fehler: ${r.fehler[0]}` : ""}.`,
          { duration: 12_000 },
        );
      } else {
        const { quellenAnlegenFn } = await import("@/lib/investoren/server-fn");
        const r = await quellenAnlegenFn({ data: { supabaseAccessToken: token, schluessel: frage.ids.slice(0, 25), bestaetigt: true } });
        toast.success(
          `${r.angelegt} in Salesforce angelegt${r.fehler.length ? `, ${r.fehler.length} nicht: ${r.fehler[0]}` : ""}. Sie stehen nach dem Neuladen bei den Salesforce-Investoren.`,
          { duration: 12_000 },
        );
      }
      setFrage(null);
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vorgang fehlgeschlagen.", { duration: 14_000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-heading">Laufende Vermarktungen gegen die Investorendatenbank</h2>
          <p className="text-xs text-text-subtle">
            Mandate in Beauftragung. Qualifiziert heißt: Score ab 70, mindestens zwei Kernkriterien belegt, kein Ausschluss,
            noch nicht in einer Kampagne des Mandats, kein „kein Interesse“. In Salesforce wird erst nach Bestätigung geschrieben.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void laden()} disabled={!zeilen}>
          <RefreshCw className="mr-1 h-4 w-4" /> Neu abgleichen
        </Button>
      </div>

      {!zeilen ? (
        <div className="flex items-center gap-2 text-sm text-text-subtle">
          <Loader2 className="h-4 w-4 animate-spin" /> Gleiche alle Investoren mit den laufenden Vermarktungen ab …
        </div>
      ) : !zeilen.length ? (
        <p className="text-sm text-text-subtle">Keine Mandate in Beauftragung.</p>
      ) : (
        zeilen.map((z) => {
          const auf = offen.has(z.mandatSfId);
          const gewaehlt = auswahl[z.mandatSfId] ?? new Set<string>();
          const listeGewaehlt = listenAuswahl[z.mandatSfId] ?? new Set<string>();
          return (
            <div key={z.mandatSfId} className="border border-hairline">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left hover:bg-surface-muted"
                onClick={() => {
                  const s = new Set(offen);
                  if (auf) s.delete(z.mandatSfId);
                  else s.add(z.mandatSfId);
                  setOffen(s);
                }}
              >
                {auf ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium text-heading">{z.objekt.name}</span>
                <span className="text-xs text-text-subtle">
                  {[z.objekt.objektart, z.objekt.orte[0], z.objekt.preis ? euroKurz(z.objekt.preis) : null].filter(Boolean).join(" · ")}
                </span>
                <span className="ml-auto text-xs text-text-muted">
                  {z.treffer.length} aus Salesforce · {z.listen.length} aus Listen · {z.angesprochen} schon angesprochen
                </span>
              </button>
              {auf ? (
                <div className="flex flex-col gap-4 border-t border-hairline p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                    Kampagne: {z.kampagne ? z.kampagne.name : "noch keine, wird beim Hinzufügen angelegt"}
                    <Link to="/mandate/$sfId/matching" params={{ sfId: z.mandatSfId }} className="text-brand-text underline">
                      Käufer-Matching des Mandats
                    </Link>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Salesforce-Investoren</h3>
                      <Button size="sm" disabled={!gewaehlt.size || busy} onClick={() => setFrage({ art: "kampagne", zeile: z, ids: [...gewaehlt] })}>
                        <Megaphone className="mr-1 h-4 w-4" /> {gewaehlt.size} zur Kampagne
                      </Button>
                    </div>
                    {z.treffer.length ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-text-subtle">
                            <th className="w-8 py-1" />
                            <th className="py-1 pr-3 font-medium">Investor</th>
                            <th className="py-1 pr-3 font-medium">Score</th>
                            <th className="py-1 pr-3 font-medium">Warum</th>
                            <th className="py-1 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {z.treffer.map((t) => (
                            <tr key={t.profilSfId} className="border-t border-hairline align-top">
                              <td className="py-2">
                                <input
                                  type="checkbox"
                                  disabled={!t.kontaktSfId}
                                  title={t.kontaktSfId ? undefined : "Kein Hauptkontakt in Salesforce"}
                                  checked={Boolean(t.kontaktSfId && gewaehlt.has(t.kontaktSfId))}
                                  onChange={() => t.kontaktSfId && umschalten(auswahl, setAuswahl, z.mandatSfId, t.kontaktSfId)}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <div className="font-medium text-heading">{t.firma ?? "k. A."}</div>
                                <div className="text-xs text-text-subtle">
                                  {t.kontaktName ?? "kein Hauptkontakt"}
                                  {t.email ? ` · ${t.email}` : ""}
                                  {t.reaktionen.deals || t.reaktionen.rueckmeldungen
                                    ? ` · ${t.reaktionen.deals} Deals, ${t.reaktionen.rueckmeldungen} Rückmeldungen`
                                    : ""}
                                </div>
                              </td>
                              <td className="py-2 pr-3">
                                <Score wert={t.score} />
                              </td>
                              <td className="py-2 pr-3 text-xs text-text-muted">{t.gruende.join(" ")}</td>
                              <td className="py-2">
                                {t.investorStatus ? <StatusMarke status={t.investorStatus} /> : null}
                                {t.prioritaet ? <div className="mt-1 text-xs text-text-subtle">{t.prioritaet}</div> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-text-subtle">Keine weiteren qualifizierten Salesforce-Investoren.</p>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Aus den Listen, noch nicht in Salesforce</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!listeGewaehlt.size || busy}
                        onClick={() => setFrage({ art: "anlegen", zeile: z, ids: [...listeGewaehlt] })}
                      >
                        <Plus className="mr-1 h-4 w-4" /> {listeGewaehlt.size} in Salesforce anlegen
                      </Button>
                    </div>
                    {z.listen.length ? (
                      <table className="w-full text-sm">
                        <tbody>
                          {z.listen.map((t) => (
                            <tr key={t.schluessel} className="border-t border-hairline align-top">
                              <td className="w-8 py-2">
                                <input
                                  type="checkbox"
                                  checked={listeGewaehlt.has(t.schluessel)}
                                  onChange={() => umschalten(listenAuswahl, setListenAuswahl, z.mandatSfId, t.schluessel)}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <div className="font-medium text-heading">{t.firma ?? t.person ?? "k. A."}</div>
                                <div className="text-xs text-text-subtle">{[t.person !== t.firma ? t.person : null, t.ort, t.quelle].filter(Boolean).join(" · ")}</div>
                              </td>
                              <td className="py-2 pr-3">
                                <Score wert={t.score} />
                              </td>
                              <td className="py-2 text-xs text-text-muted">{t.gruende.join(" ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-text-subtle">Keine qualifizierten Listen-Investoren.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })
      )}

      <AlertDialog open={Boolean(frage)} onOpenChange={(o) => !o && setFrage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{frage?.art === "kampagne" ? "Zur Vermarktungskampagne hinzufügen?" : "In Salesforce anlegen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {frage?.art === "kampagne"
                ? `${frage.ids.length} Kontakte kommen als „Geplante Ansprache“ in ${frage.zeile.kampagne ? `die Kampagne „${frage.zeile.kampagne.name}“` : `eine neue Kampagne „Vermarktung ${frage.zeile.objekt.name}“`}. Es wird nichts versendet.`
                : `${Math.min(frage?.ids.length ?? 0, 25)} Investoren werden als Account mit Kontakt und Ankaufsprofil in Salesforce angelegt (Owner Sebastian Grenz). Dubletten und insolvente Firmen werden übersprungen. Danach lassen sie sich zur Kampagne hinzufügen.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void ausfuehren();
              }}
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Bestätigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
