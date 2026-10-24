import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Download, Loader2, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { base64Herunterladen } from "@/lib/download";
import { formatDate, formatEuro } from "@/lib/format";
import type { ReportTexte } from "@/lib/mandate/report";
import type { ReportVoll } from "@/lib/mandate/server-fn";

import { FunnelBalken } from "./MandatDetailPage";

type Aussage = { text: string; quellen: string[] };

const STATUS_TEXT: Record<string, string> = {
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
  versendet: "Versendet",
};

export function ReportEditorPage({ sfId, id }: { sfId: string; id: string }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [report, setReport] = useState<ReportVoll | null>(null);
  const [texte, setTexte] = useState<ReportTexte>({});
  const [geaendert, setGeaendert] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [empfaenger, setEmpfaenger] = useState("");
  const [bestaetigt, setBestaetigt] = useState(false);

  const uebernehmen = useCallback((r: ReportVoll) => {
    setReport(r);
    setTexte(r.texte ?? {});
    setGeaendert(false);
    setEmpfaenger((e) => e || r.eigentuemerEmail || "");
  }, []);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { reportLadenFn } = await import("@/lib/mandate/server-fn");
        uebernehmen(await reportLadenFn({ data: { supabaseAccessToken: token, id } }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Bericht konnte nicht geladen werden.");
      }
    })();
  }, [token, id, uebernehmen]);

  const setze = (teil: Partial<ReportTexte>) => {
    setTexte((t) => ({ ...t, ...teil }));
    setGeaendert(true);
  };

  const mitBusy = async (name: string, lauf: () => Promise<void>) => {
    setBusy(name);
    try {
      await lauf();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.", { duration: 12_000 });
    } finally {
      setBusy(null);
    }
  };

  const speichern = () =>
    mitBusy("speichern", async () => {
      const { reportTexteSpeichernFn } = await import("@/lib/mandate/server-fn");
      uebernehmen(await reportTexteSpeichernFn({ data: { supabaseAccessToken: token, id, texte } }));
      toast.success("Gespeichert.");
    });

  const kiEntwurf = () =>
    mitBusy("ki", async () => {
      const { reportMarktfeedbackFn } = await import("@/lib/mandate/server-fn");
      const r = await reportMarktfeedbackFn({ data: { supabaseAccessToken: token, id } });
      setze({ marktfeedback: r.marktfeedback ?? [], marktfeedbackLuecken: r.marktfeedbackLuecken ?? [] });
      toast.success("KI-Entwurf eingefügt. Bitte prüfen und speichern.");
    });

  const herunterladen = (format: "pdf" | "pptx") =>
    mitBusy(format, async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      const { reportDateiFn } = await import("@/lib/mandate/server-fn");
      base64Herunterladen(await reportDateiFn({ data: { supabaseAccessToken: token, id, format } }));
    });

  const freigeben = () =>
    mitBusy("freigeben", async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      if (!window.confirm("Bericht freigeben? Danach ist er bereit zum Versand an den Eigentümer.")) return;
      const { reportFreigebenFn } = await import("@/lib/mandate/server-fn");
      uebernehmen(await reportFreigebenFn({ data: { supabaseAccessToken: token, id } }));
      toast.success("Bericht freigegeben.");
    });

  const versandProtokollieren = () =>
    mitBusy("versand", async () => {
      const { reportVersandProtokollierenFn } = await import("@/lib/mandate/server-fn");
      const { salesforceSessionHintFrisch } = await import("@/lib/salesforce/api");
      const sfSitzung = await salesforceSessionHintFrisch();
      uebernehmen(
        await reportVersandProtokollierenFn({
          data: { supabaseAccessToken: token, id, empfaenger, bestaetigt, sfSitzung },
        }),
      );
      toast.success("Versand in Salesforce als erledigte Aufgabe am Mandat protokolliert.");
    });

  if (!report) {
    return (
      <PageWrapper>
        <Loader2 className="h-4 w-4 animate-spin" />
      </PageWrapper>
    );
  }

  const k = report.kennzahlen;
  const aktivitaet = new Map(k.aktivitaetsListe.map((a) => [a.sfId, a]));
  const feedback = texte.marktfeedback ?? [];
  const setzeAussage = (i: number, a: Aussage | null) => {
    const liste = [...feedback];
    if (a) liste[i] = a;
    else liste.splice(i, 1);
    setze({ marktfeedback: liste });
  };
  const gesperrt = report.status === "versendet";

  return (
    <>
      <PageHeader
        titel={report.titel ?? "Vermarktungsbericht"}
        beschreibung={`Zeitraum ${formatDate(report.zeitraumVon)} bis ${formatDate(report.zeitraumBis)} · Zahlen eingefroren am ${formatDate(k.stand)} · Status: ${STATUS_TEXT[report.status]}`}
        aktionen={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/mandate/$sfId" params={{ sfId }}>
                Zum Mandat
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void herunterladen("pdf")} disabled={!!busy}>
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </Button>
            <Button variant="outline" onClick={() => void herunterladen("pptx")} disabled={!!busy}>
              {busy === "pptx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PowerPoint
            </Button>
            {!gesperrt ? (
              <Button onClick={() => void speichern()} disabled={!!busy || !geaendert}>
                {busy === "speichern" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Speichern
              </Button>
            ) : null}
          </div>
        }
      />
      <PageWrapper>
        <div className="grid max-w-6xl gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">Einleitung (optional)</h2>
              <Textarea
                rows={3}
                disabled={gesperrt}
                value={texte.einleitung ?? ""}
                onChange={(e) => setze({ einleitung: e.target.value })}
                placeholder="z. B. Sehr geehrte Frau …, anbei der aktuelle Stand der Vermarktung."
              />
            </section>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-heading">Marktfeedback</h2>
                {!gesperrt ? (
                  <Button size="sm" variant="outline" onClick={() => void kiEntwurf()} disabled={!!busy}>
                    {busy === "ki" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    KI-Entwurf aus Aktivitäten
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-text-subtle">
                Jede Aussage braucht mindestens eine Aktivität als Beleg. Aussagen ohne Beleg erscheinen im Bericht als Lücke.
              </p>
              {feedback.map((a, i) => (
                <div key={i} className="flex flex-col gap-2 border border-hairline p-3">
                  <Textarea
                    rows={2}
                    disabled={gesperrt}
                    value={a.text}
                    onChange={(e) => setzeAussage(i, { ...a, text: e.target.value })}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {a.quellen.map((q) => (
                      <span key={q} className="inline-flex items-center gap-1 bg-surface-muted px-2 py-1">
                        {aktivitaet.get(q) ? `${formatDate(aktivitaet.get(q)!.datum)} ${aktivitaet.get(q)!.art}: ${aktivitaet.get(q)!.betreff}` : q}
                        {!gesperrt ? (
                          <button
                            className="text-text-subtle hover:text-heading"
                            onClick={() => setzeAussage(i, { ...a, quellen: a.quellen.filter((x) => x !== q) })}
                            aria-label="Beleg entfernen"
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    ))}
                    {a.quellen.length === 0 ? <span className="text-red-700">Ohne Beleg</span> : null}
                    {!gesperrt ? (
                      <>
                        <select
                          className="h-7 max-w-64 border border-input bg-background px-1"
                          value=""
                          onChange={(e) =>
                            e.target.value && setzeAussage(i, { ...a, quellen: [...new Set([...a.quellen, e.target.value])] })
                          }
                        >
                          <option value="">Beleg hinzufügen …</option>
                          {k.aktivitaetsListe.map((x) => (
                            <option key={x.sfId} value={x.sfId}>
                              {formatDate(x.datum)} {x.art}: {x.betreff}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="ghost" onClick={() => setzeAussage(i, null)} aria-label="Aussage entfernen">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {!gesperrt ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={() => setze({ marktfeedback: [...feedback, { text: "", quellen: [] }] })}
                >
                  <Plus className="h-4 w-4" /> Aussage hinzufügen
                </Button>
              ) : null}
              {(texte.marktfeedbackLuecken ?? []).length ? (
                <div className="flex flex-col gap-1">
                  <h3 className="text-xs font-semibold text-text-muted">Lücken (erscheinen im Bericht als fehlende Angabe)</h3>
                  {(texte.marktfeedbackLuecken ?? []).map((l, i) => (
                    <div key={i} className="flex items-start gap-2 border-l-2 border-red-600 bg-red-50 px-2 py-1 text-xs text-red-900">
                      <span className="flex-1">{l}</span>
                      {!gesperrt ? (
                        <button
                          aria-label="Lücke entfernen"
                          onClick={() => setze({ marktfeedbackLuecken: (texte.marktfeedbackLuecken ?? []).filter((_, j) => j !== i) })}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">Nächste Schritte (eine Zeile je Punkt)</h2>
              <Textarea
                rows={4}
                disabled={gesperrt}
                value={(texte.naechsteSchritte ?? []).join("\n")}
                onChange={(e) => setze({ naechsteSchritte: e.target.value.split("\n") })}
              />
              <h2 className="mt-2 text-sm font-semibold text-heading">Kommentar (optional)</h2>
              <Textarea
                rows={3}
                disabled={gesperrt}
                value={texte.kommentar ?? ""}
                onChange={(e) => setze({ kommentar: e.target.value })}
              />
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 border border-hairline bg-surface p-4">
              <h2 className="text-sm font-semibold text-heading">Zahlen im Bericht</h2>
              <FunnelBalken funnel={k.funnel} />
              <p className="text-xs text-text-subtle">
                Aktivitäten im Zeitraum: {k.aktivitaeten.zeitraum} · Angebote: {k.angebote.length}
                {k.angebote[0]?.betrag ? ` · höchstes ${formatEuro(k.angebote[0].betrag)}` : ""}
              </p>
            </section>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-4">
              <h2 className="text-sm font-semibold text-heading">Freigabe und Versand</h2>
              {report.status === "entwurf" ? (
                <>
                  <p className="text-xs text-text-subtle">
                    Der Bericht ist ein Entwurf (Stempel ENTWURF im PDF). Freigeben kann nur ein Nutzer.
                  </p>
                  <Button onClick={() => void freigeben()} disabled={!!busy}>
                    {busy === "freigeben" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Bericht freigeben
                  </Button>
                </>
              ) : null}
              {report.status === "freigegeben" ? (
                <>
                  <p className="text-xs text-text-subtle">
                    Freigegeben am {formatDate(report.freigegebenAm)}. PDF herunterladen, an den Eigentümer senden und hier den
                    Versand protokollieren. Dabei wird in Salesforce eine erledigte Aufgabe am Mandat angelegt.
                  </p>
                  <Input placeholder="Empfänger (E-Mail)" value={empfaenger} onChange={(e) => setEmpfaenger(e.target.value)} />
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} />
                    Ja, Aufgabe „Vermarktungsbericht versendet“ in Salesforce anlegen.
                  </label>
                  <Button onClick={() => void versandProtokollieren()} disabled={!!busy || !bestaetigt || !empfaenger.trim()}>
                    {busy === "versand" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Versand protokollieren
                  </Button>
                </>
              ) : null}
              {report.status === "versendet" ? (
                <p className="text-xs text-text-subtle">
                  Versendet am {formatDate(report.versendetAm)} an {report.versendetAn}. In Salesforce protokolliert
                  {report.sfTaskId ? ` (Aufgabe ${report.sfTaskId})` : ""}.
                </p>
              ) : null}
            </section>
          </aside>
        </div>
      </PageWrapper>
    </>
  );
}
