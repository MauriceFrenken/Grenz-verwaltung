import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Download,
  FilePlus2,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base64Herunterladen } from "@/lib/download";
import { formatDate } from "@/lib/format";
import {
  BERICHT_FARBEN,
  STATUS_STUFEN,
  euroKurz,
  monatJahr,
} from "@/lib/mandate/vermarktungsbericht";

import { MandatReiter } from "./MandatReiter";
import {
  mandatBeschreibung,
  mandatTitel,
  useMandatDetail,
} from "./useMandatDetail";

const STATUS_TEXT: Record<string, { text: string; klasse: string }> = {
  entwurf: {
    text: "Entwurf",
    klasse: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  freigegeben: {
    text: "Freigegeben",
    klasse: "bg-sky-50 text-sky-800 ring-sky-200",
  },
  versendet: {
    text: "Versendet",
    klasse: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
};

type Stand = Awaited<
  ReturnType<typeof import("@/lib/mandate/server-fn").mandatVermarktungFn>
>;

/** Reiter „Eigentümer-Report“: aktueller Stand nach Grenz-Vorlage, Berichte anlegen und öffnen. */
export function MandatReportsPage({ sfId }: { sfId: string }) {
  const { token, detail, von, setVon, bis, setBis } = useMandatDetail(sfId);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [stand, setStand] = useState<Stand | null>(null);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { mandatVermarktungFn } = await import("@/lib/mandate/server-fn");
        setStand(
          await mandatVermarktungFn({
            data: { supabaseAccessToken: token, sfId },
          }),
        );
      } catch {
        setStand(null);
      }
    })();
  }, [token, sfId]);

  const reportAnlegen = async () => {
    setBusy("neu");
    try {
      const { reportAnlegenFn } = await import("@/lib/mandate/server-fn");
      const { id } = await reportAnlegenFn({
        data: { supabaseAccessToken: token, sfId, von, bis },
      });
      toast.success("Bericht angelegt. Zahlen sind auf heute eingefroren.");
      await navigate({ to: "/mandate/$sfId/report/$id", params: { sfId, id } });
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Bericht konnte nicht angelegt werden.",
      );
    } finally {
      setBusy(null);
    }
  };

  const pdf = async (id: string) => {
    setBusy(id);
    try {
      const { reportDateiFn } = await import("@/lib/mandate/server-fn");
      base64Herunterladen(
        await reportDateiFn({
          data: { supabaseAccessToken: token, id, format: "pdf" },
        }),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "PDF konnte nicht erzeugt werden.",
      );
    } finally {
      setBusy(null);
    }
  };

  const angesprochen = stand
    ? Object.values(stand.status).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <>
      <PageHeader
        titel={mandatTitel(detail)}
        beschreibung={mandatBeschreibung(detail)}
        reiter={<MandatReiter sfId={sfId} aktiv="reports" />}
      />
      <PageWrapper>
        <section className="grid overflow-hidden border border-hairline bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div
            className="flex flex-col justify-between gap-6 p-6 text-white"
            style={{ background: BERICHT_FARBEN.navy }}
          >
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-white/70">
                Vermarktungsbericht
              </span>
              <h2 className="text-xl font-light">
                Aktueller Stand für den Eigentümer
              </h2>
              <p className="text-sm text-white/75">
                Titelseite, Zielgruppe, Vermarktungsstand sowie Aktivitäten und
                Angebote im Layout der Grenz-Vorlage. Zahlen aus Salesforce,
                jeder Wert im Editor anpassbar. Export als PDF und PowerPoint.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-white/70">
                Zeitraum von
                <Input
                  type="date"
                  value={von}
                  onChange={(e) => setVon(e.target.value)}
                  className="bg-white text-heading"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-white/70">
                bis
                <Input
                  type="date"
                  value={bis}
                  onChange={(e) => setBis(e.target.value)}
                  className="bg-white text-heading"
                />
              </label>
              <Button
                onClick={() => void reportAnlegen()}
                disabled={!!busy || !detail}
                className="bg-white text-heading hover:bg-white/90"
              >
                {busy === "neu" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FilePlus2 className="h-4 w-4" />
                )}
                Neuen Bericht anlegen
              </Button>
            </div>
          </div>

          <div
            className="flex flex-col gap-4 p-6"
            style={{ background: "#F7F9FB" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-heading">
                Vermarktungsstand laut Salesforce
              </h3>
              {stand ? (
                <span className="text-xs text-text-subtle">
                  Beginn {monatJahr(stand.vermarktungsbeginn) || "–"} ·
                  Angebotspreis {euroKurz(stand.angebotspreis)}
                </span>
              ) : null}
            </div>
            {!stand ? (
              <Loader2 className="h-4 w-4 animate-spin text-text-subtle" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Angesprochen", angesprochen.toLocaleString("de-DE")],
                    [
                      "Rückmeldungen",
                      (
                        angesprochen - stand.status.exposeInPruefung
                      ).toLocaleString("de-DE"),
                    ],
                    [
                      "Kaufangebote",
                      stand.status.kaufangebot.toLocaleString("de-DE"),
                    ],
                    ["Höchstes Angebot", euroKurz(stand.hoechstesAngebot)],
                  ].map(([label, wert]) => (
                    <div
                      key={label}
                      className="border-t-2 bg-white px-3 py-2"
                      style={{ borderColor: BERICHT_FARBEN.navy }}
                    >
                      <div
                        className="text-lg font-light"
                        style={{ color: BERICHT_FARBEN.navy }}
                      >
                        {wert}
                      </div>
                      <div className="text-[11px] text-text-muted">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5">
                  {STATUS_STUFEN.map((s) => {
                    const n = stand.status[s.key];
                    return (
                      <div
                        key={s.key}
                        className="grid grid-cols-[170px_1fr_40px] items-center gap-3 text-xs"
                      >
                        <span className="text-text-muted">{s.label}</span>
                        <div className="h-2 bg-white">
                          <div
                            className="h-2"
                            style={{
                              width: `${angesprochen ? Math.max(n ? 2 : 0, (n / angesprochen) * 100) : 0}%`,
                              background: s.key.startsWith("absage")
                                ? "#A6A6A6"
                                : BERICHT_FARBEN.navy,
                            }}
                          />
                        </div>
                        <span className="text-right tabular-nums">{n}</span>
                      </div>
                    );
                  })}
                </div>
                {stand.vorgemerkt ? (
                  <p className="text-[11px] text-text-subtle">
                    {stand.vorgemerkt} weitere Investoren sind vorgemerkt, aber
                    noch nicht angeschrieben.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-heading">Berichte</h2>
          {!detail ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : detail.reports.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {detail.reports.map((r) => {
                const st = STATUS_TEXT[r.status] ?? {
                  text: r.status,
                  klasse: "",
                };
                return (
                  <div
                    key={r.id}
                    className="flex flex-col gap-3 border border-hairline bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center text-white"
                          style={{ background: BERICHT_FARBEN.navy }}
                        >
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-heading">
                            {r.titel ?? "Vermarktungsbericht"}
                          </div>
                          <div className="text-xs text-text-subtle">
                            Stand {formatDate(r.createdAt)}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${st.klasse}`}
                      >
                        {st.text}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">
                      Aktivitäten {formatDate(r.zeitraumVon)} bis{" "}
                      {formatDate(r.zeitraumBis)}
                      {r.versendetAm
                        ? ` · versendet ${formatDate(r.versendetAm)} an ${r.versendetAn}`
                        : ""}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" asChild>
                        <Link
                          to="/mandate/$sfId/report/$id"
                          params={{ sfId, id: r.id }}
                        >
                          Öffnen <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => void pdf(r.id)}
                      >
                        {busy === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        PDF
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="border border-dashed border-hairline bg-surface p-6 text-sm text-text-muted">
              Noch kein Bericht. „Neuen Bericht anlegen“ übernimmt den aktuellen
              Salesforce-Stand, danach lässt sich jeder Wert im Editor anpassen.
            </p>
          )}
        </section>
      </PageWrapper>
    </>
  );
}
