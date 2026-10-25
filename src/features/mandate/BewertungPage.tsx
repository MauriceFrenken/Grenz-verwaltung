import { useCallback, useEffect, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Download,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { base64Herunterladen } from "@/lib/download";
import { formatDate, formatEuro } from "@/lib/format";
import type {
  BewertungVorschau,
  BewertungZeile,
} from "@/lib/bewertung/server-fn";

import { MandatReiter } from "./MandatReiter";

type Felder = {
  objektart: string;
  flaeche: string;
  jahresmiete: string;
  baujahr: string;
  einheiten: string;
  radiusKm: string;
  maxAlterMonate: string;
  abschlagProzent: string;
};

const LEER: Felder = {
  objektart: "",
  flaeche: "",
  jahresmiete: "",
  baujahr: "",
  einheiten: "",
  radiusKm: "10",
  maxAlterMonate: "36",
  abschlagProzent: "",
};

function zahl(n: number, stellen = 1): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: stellen });
}

export function BewertungPage({ sfId }: { sfId: string }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [felder, setFelder] = useState<Felder>(LEER);
  const [vorschau, setVorschau] = useState<BewertungVorschau | null>(null);
  const [liste, setListe] = useState<BewertungZeile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const eingabe = useCallback(
    (f: Felder | null) => ({
      supabaseAccessToken: token,
      mandatSfId: sfId,
      objekt: f
        ? {
            objektart: f.objektart,
            flaeche: f.flaeche,
            jahresmiete: f.jahresmiete,
            baujahr: f.baujahr,
            einheiten: f.einheiten,
          }
        : {},
      parameter: f
        ? {
            radiusKm: f.radiusKm,
            maxAlterMonate: f.maxAlterMonate,
            abschlagProzent: f.abschlagProzent,
          }
        : {},
    }),
    [token, sfId],
  );

  const ladeListe = useCallback(async () => {
    const { bewertungenFn } = await import("@/lib/bewertung/server-fn");
    setListe(
      await bewertungenFn({
        data: { supabaseAccessToken: token, mandatSfId: sfId },
      }),
    );
  }, [token, sfId]);

  const rechnen = useCallback(
    async (f: Felder | null) => {
      setBusy("rechnen");
      try {
        const { bewertungVorschauFn } =
          await import("@/lib/bewertung/server-fn");
        const v = await bewertungVorschauFn({ data: eingabe(f) });
        setVorschau(v);
        if (!f) {
          const s = (n: number | null) => (n == null ? "" : String(n));
          setFelder({
            ...LEER,
            objektart: v.objekt.objektart ?? "",
            flaeche: s(v.objekt.flaeche),
            jahresmiete: s(v.objekt.jahresmiete),
            baujahr: s(v.objekt.baujahr),
            einheiten: s(v.objekt.einheiten),
          });
        }
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Bewertung fehlgeschlagen.",
          { duration: 12_000 },
        );
      } finally {
        setBusy(null);
      }
    },
    [eingabe],
  );

  useEffect(() => {
    if (!token) return;
    void rechnen(null);
    void ladeListe().catch(() => undefined);
  }, [token, rechnen, ladeListe]);

  const speichern = async () => {
    setBusy("speichern");
    try {
      const { bewertungSpeichernFn } =
        await import("@/lib/bewertung/server-fn");
      await bewertungSpeichernFn({ data: eingabe(felder) });
      toast.success("Bewertung als Entwurf gespeichert.");
      await ladeListe();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const aktion = async (id: string, art: "pdf" | "pptx" | "freigeben") => {
    setBusy(`${art}:${id}`);
    try {
      const fn = await import("@/lib/bewertung/server-fn");
      if (art === "freigeben") {
        if (!window.confirm("Bewertung freigeben?")) return;
        await fn.bewertungFreigebenFn({
          data: { supabaseAccessToken: token, id },
        });
        await ladeListe();
      } else {
        base64Herunterladen(
          await fn.bewertungDateiFn({
            data: { supabaseAccessToken: token, id, format: art },
          }),
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const feld = (
    k: keyof Felder,
    label: string,
    props: Record<string, unknown> = {},
  ) => (
    <label className="flex flex-col gap-1 text-xs text-text-subtle">
      {label}
      <Input
        value={felder[k]}
        onChange={(e) => setFelder((f) => ({ ...f, [k]: e.target.value }))}
        {...props}
      />
    </label>
  );

  const e = vorschau?.ergebnis;

  return (
    <>
      <PageHeader
        titel={vorschau ? vorschau.objekt.bezeichnung : "Indikative Bewertung"}
        beschreibung="Faktor- und Vergleichswertverfahren aus Vergleichsdaten. Kein Gutachten."
        reiter={<MandatReiter sfId={sfId} aktiv="bewertung" />}
      />
      <PageWrapper>
        <div className="grid max-w-7xl gap-6 xl:grid-cols-[320px_1fr]">
          <aside className="flex flex-col gap-3 border border-hairline bg-surface p-4">
            <h2 className="text-sm font-semibold text-heading">Eingaben</h2>
            {feld("objektart", "Objektart")}
            {feld("flaeche", "Fläche (m²)", { inputMode: "decimal" })}
            {feld("jahresmiete", "Ist-Nettokaltmiete p. a. (€)", {
              inputMode: "decimal",
            })}
            {feld("baujahr", "Baujahr")}
            {feld("einheiten", "Einheiten")}
            <div className="grid grid-cols-2 gap-2">
              {feld("radiusKm", "Umkreis (km)")}
              {feld("maxAlterMonate", "Max. Alter (Monate)")}
            </div>
            {vorschau?.darfAbschlag ? (
              feld("abschlagProzent", "Abschlag auf Angebotspreise (%)", {
                placeholder: "leer = kein Abschlag",
              })
            ) : (
              <p className="text-xs text-text-subtle">
                Einen Abschlag auf Angebotspreise setzt nur ein Administrator.
              </p>
            )}
            <Button onClick={() => void rechnen(felder)} disabled={!!busy}>
              {busy === "rechnen" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              Berechnen
            </Button>
            <Button
              variant="outline"
              onClick={() => void speichern()}
              disabled={!!busy || !vorschau}
            >
              {busy === "speichern" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Als Entwurf speichern
            </Button>
          </aside>

          <div className="flex flex-col gap-5">
            {!e ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
                  <h2 className="text-sm font-semibold text-heading">
                    Indikative Wertspanne
                  </h2>
                  {e.ergebnis ? (
                    <p className="text-2xl font-semibold tabular-nums text-heading">
                      {formatEuro(e.ergebnis.min)} bis{" "}
                      {formatEuro(e.ergebnis.max)}
                      <span className="ml-3 text-base font-normal text-text-muted">
                        Mittel {formatEuro(e.ergebnis.mittel)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-text-muted">
                      Keine Spanne möglich.
                    </p>
                  )}
                  <ul className="flex flex-col gap-1 text-xs text-text-subtle">
                    {e.hinweise.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </section>

                {e.verfahren.length ? (
                  <section className="border border-hairline bg-surface p-5">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-text-subtle">
                        <tr>
                          <th className="py-1">Verfahren</th>
                          <th className="py-1">Basis</th>
                          <th className="py-1 text-right">Anzahl</th>
                          <th className="py-1 text-right">
                            Kennwert 25 / 50 / 75 %
                          </th>
                          <th className="py-1 text-right">Wert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.verfahren.map((v) => {
                          const w = v.wertNachAbschlag ?? v.wert;
                          return (
                            <tr
                              key={`${v.verfahren}-${v.basis}`}
                              className="border-t border-hairline"
                            >
                              <td className="py-1">
                                {v.verfahren === "faktor"
                                  ? "Faktor"
                                  : "Vergleichswert €/m²"}
                              </td>
                              <td className="py-1">
                                {v.basis === "kauf"
                                  ? "Kaufpreise"
                                  : `Angebotspreise${v.wertNachAbschlag ? " nach Abschlag" : ""}`}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {v.anzahl}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {zahl(v.kennwert.min)} /{" "}
                                {zahl(v.kennwert.mittel)} /{" "}
                                {zahl(v.kennwert.max)}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {formatEuro(w.min)} bis {formatEuro(w.max)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                ) : null}

                <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
                  <h2 className="text-sm font-semibold text-heading">
                    Marktdaten zum Standort
                  </h2>
                  {vorschau?.marktdaten.length ? (
                    <table className="w-full text-sm">
                      <tbody>
                        {vorschau.marktdaten.map((m, i) => (
                          <tr key={i} className="border-t border-hairline">
                            <td className="py-1">{m.art}</td>
                            <td className="py-1 text-right tabular-nums">
                              {zahl(m.wert, 2)} {m.einheit}
                            </td>
                            <td className="py-1 text-text-subtle">
                              Quelle {m.quelle.toUpperCase().replace("_", " ")},
                              Stichtag {formatDate(m.stichtag)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-text-muted">
                      Noch keine Marktdaten (IMV, BORIS NRW, Kaufpreissammlung)
                      zu diesem Standort importiert.
                    </p>
                  )}
                </section>

                <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
                  <h2 className="text-sm font-semibold text-heading">
                    Vergleichsobjekte ({e.vergleiche.length}, nach Entfernung)
                  </h2>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-text-subtle">
                        <tr>
                          <th className="py-1">Ort</th>
                          <th className="py-1">Objektart</th>
                          <th className="py-1">Preisart</th>
                          <th className="py-1 text-right">km</th>
                          <th className="py-1 text-right">Preis</th>
                          <th className="py-1 text-right">Faktor</th>
                          <th className="py-1 text-right">€/m²</th>
                          <th className="py-1">Stichtag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.vergleiche.map((v) => (
                          <tr
                            key={`${v.quelle}-${v.quelleId}`}
                            className="border-t border-hairline"
                          >
                            <td className="py-1">
                              {[v.adresse, v.ort].filter(Boolean).join(", ") ||
                                "k. A."}
                            </td>
                            <td className="py-1">{v.objektart ?? "k. A."}</td>
                            <td className="py-1">
                              {v.preisart === "kauf" ? "Kaufpreis" : "Angebot"}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {v.km == null ? "k. A." : zahl(v.km)}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {v.kaufpreis ? formatEuro(v.kaufpreis) : "k. A."}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {v.faktor ? zahl(v.faktor) : "k. A."}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {v.preisM2 ? zahl(v.preisM2, 0) : "k. A."}
                            </td>
                            <td className="py-1">
                              {v.stichtag ? formatDate(v.stichtag) : "k. A."}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">
                Gespeicherte Bewertungen
              </h2>
              {liste.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {liste.map((b) => (
                      <tr key={b.id} className="border-t border-hairline">
                        <td className="py-2">{formatDate(b.createdAt)}</td>
                        <td className="py-2 tabular-nums">
                          {b.wertMittel
                            ? `${formatEuro(b.wertMin)} bis ${formatEuro(b.wertMax)}`
                            : "ohne Spanne"}
                        </td>
                        <td className="py-2">
                          {b.status === "freigegeben"
                            ? "Freigegeben"
                            : "Entwurf"}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void aktion(b.id, "pdf")}
                              disabled={!!busy}
                            >
                              <Download className="h-4 w-4" /> PDF
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void aktion(b.id, "pptx")}
                              disabled={!!busy}
                            >
                              <Download className="h-4 w-4" /> PPTX
                            </Button>
                            {b.status === "entwurf" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void aktion(b.id, "freigeben")}
                                disabled={!!busy}
                              >
                                <CheckCircle2 className="h-4 w-4" /> Freigeben
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-text-muted">
                  Noch keine gespeicherte Bewertung.
                </p>
              )}
            </section>
          </div>
        </div>
      </PageWrapper>
    </>
  );
}
