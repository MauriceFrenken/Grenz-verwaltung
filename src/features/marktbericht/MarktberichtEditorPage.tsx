import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { base64Herunterladen, dateiAlsBase64 } from "@/lib/download";
import { formatDate } from "@/lib/format";
import { fmt, kacheln, median, spanne } from "@/lib/marktbericht/bericht";
import type { MarktberichtVoll } from "@/lib/marktbericht/server-fn";
import {
  MINDEST_FALLZAHL,
  periodeText,
  type Benchmark,
  type MarktberichtTexte,
  type Trend,
} from "@/lib/marktbericht/typen";

const TEXTFELDER: {
  feld: keyof MarktberichtTexte;
  titel: string;
  hilfe: string;
}[] = [
  {
    feld: "einleitung",
    titel: "Kurzfassung",
    hilfe: "steht unter den Kennzahlen auf „Auf einen Blick“",
  },
  {
    feld: "rahmen",
    titel: "Rahmenbedingungen",
    hilfe: "Zins- und Finanzierungsumfeld",
  },
  {
    feld: "angebot",
    titel: "Angebotsmarkt",
    hilfe: "Faktoren und Preise nach Teilmarkt",
  },
  {
    feld: "nachfrage",
    titel: "Nachfrage",
    hilfe: "Käuferindex aus den Ankaufsprofilen",
  },
  {
    feld: "vermarktung",
    titel: "Vermarktung",
    hilfe: "Grenz & Co. im Markt, Markt-Radar",
  },
  {
    feld: "ausblick",
    titel: "Ausblick",
    hilfe: "Erwartung für das nächste Halbjahr",
  },
];

const TRENDS: Trend[] = ["steigend", "stabil", "fallend"];

function leererWert(): Benchmark {
  return {
    id: crypto.randomUUID(),
    kennzahl: "",
    region: "",
    wert: 0,
    einheit: "",
    quelle: "",
    stichtag: new Date().toISOString().slice(0, 10),
    geprueft: true,
  };
}

export function MarktberichtEditorPage({ id }: { id: string }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const navigate = useNavigate();
  const [bericht, setBericht] = useState<MarktberichtVoll | null>(null);
  const [texte, setTexte] = useState<MarktberichtTexte>({});
  const [werte, setWerte] = useState<Benchmark[]>([]);
  const [geaendert, setGeaendert] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const dateiInput = useRef<HTMLInputElement>(null);

  const uebernehmen = useCallback((b: MarktberichtVoll) => {
    setBericht(b);
    setTexte(b.inhalt.texte);
    setWerte(b.inhalt.benchmarks);
    setGeaendert(false);
  }, []);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { marktberichtLadenFn } =
          await import("@/lib/marktbericht/server-fn");
        uebernehmen(
          await marktberichtLadenFn({
            data: { supabaseAccessToken: token, id },
          }),
        );
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Bericht konnte nicht geladen werden.",
        );
      }
    })();
  }, [token, id, uebernehmen]);

  const mitBusy = async (name: string, lauf: () => Promise<void>) => {
    setBusy(name);
    try {
      await lauf();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.", {
        duration: 12_000,
      });
    } finally {
      setBusy(null);
    }
  };

  const setzeTexte = (teil: Partial<MarktberichtTexte>) => {
    setTexte((t) => ({ ...t, ...teil }));
    setGeaendert(true);
  };
  const setzeWert = (i: number, teil: Partial<Benchmark> | null) => {
    setWerte((liste) => {
      const neu = [...liste];
      if (teil) neu[i] = { ...neu[i], ...teil };
      else neu.splice(i, 1);
      return neu;
    });
    setGeaendert(true);
  };

  const speichern = () =>
    mitBusy("speichern", async () => {
      const { marktberichtSpeichernFn } =
        await import("@/lib/marktbericht/server-fn");
      uebernehmen(
        await marktberichtSpeichernFn({
          data: { supabaseAccessToken: token, id, texte, benchmarks: werte },
        }),
      );
      toast.success("Gespeichert.");
    });

  const neuBerechnen = () =>
    mitBusy("rechnen", async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      const { marktberichtNeuBerechnenFn } =
        await import("@/lib/marktbericht/server-fn");
      uebernehmen(
        await marktberichtNeuBerechnenFn({
          data: { supabaseAccessToken: token, id },
        }),
      );
      toast.success("Kennzahlen neu berechnet.");
    });

  const kiTexte = () =>
    mitBusy("ki", async () => {
      const { marktberichtKiTexteFn } =
        await import("@/lib/marktbericht/server-fn");
      const t = await marktberichtKiTexteFn({
        data: { supabaseAccessToken: token, id, benchmarks: werte },
      });
      setzeTexte(t);
      toast.success("KI-Entwurf eingefügt. Bitte prüfen und speichern.");
    });

  const pdfAuslesen = (datei: File) =>
    mitBusy("auslesen", async () => {
      const { marktberichtPdfAuslesenFn } =
        await import("@/lib/marktbericht/server-fn");
      const neu = await marktberichtPdfAuslesenFn({
        data: {
          supabaseAccessToken: token,
          base64: await dateiAlsBase64(datei),
          dateiname: datei.name,
        },
      });
      setWerte((liste) => [...liste, ...neu]);
      setGeaendert(true);
      toast.success(
        `${neu.length} Kennzahlen ausgelesen. Bitte je Wert prüfen und bestätigen.`,
      );
    });

  const herunterladen = () =>
    mitBusy("pdf", async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      const { marktberichtPdfFn } =
        await import("@/lib/marktbericht/server-fn");
      base64Herunterladen(
        await marktberichtPdfFn({ data: { supabaseAccessToken: token, id } }),
      );
    });

  const freigeben = () =>
    mitBusy("freigeben", async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      const { marktberichtFreigebenFn } =
        await import("@/lib/marktbericht/server-fn");
      uebernehmen(
        await marktberichtFreigebenFn({
          data: { supabaseAccessToken: token, id },
        }),
      );
      toast.success("Bericht freigegeben.");
    });

  const loeschen = () =>
    mitBusy("loeschen", async () => {
      const { marktberichtLoeschenFn } =
        await import("@/lib/marktbericht/server-fn");
      await marktberichtLoeschenFn({
        data: { supabaseAccessToken: token, id },
      });
      toast.success("Entwurf gelöscht.");
      void navigate({ to: "/tools/marktbericht" });
    });

  if (!bericht) {
    return (
      <PageWrapper>
        <Loader2 className="h-4 w-4 animate-spin" />
      </PageWrapper>
    );
  }

  const k = bericht.kennzahlen;
  const gesperrt = bericht.status !== "entwurf";
  const ungeprueft = werte.filter((w) => !w.geprueft).length;
  const vorschau = kacheln(k, werte);
  const symbol = (n: string) =>
    busy === n ? <Loader2 className="h-4 w-4 animate-spin" /> : null;

  return (
    <>
      <PageHeader
        titel={`Marktbericht ${periodeText(k.periode)}`}
        beschreibung={`Zinshäuser Rheinland · ${k.vorlaeufig ? "vorläufig, " : ""}Stichtag ${formatDate(k.stichtag)} · Status: ${gesperrt ? `freigegeben am ${formatDate(bericht.freigegebenAm)}` : "Entwurf"}`}
        aktionen={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/tools/marktbericht">Alle Berichte</Link>
            </Button>
            {!gesperrt ? (
              <Button
                variant="outline"
                onClick={() => void neuBerechnen()}
                disabled={!!busy}
              >
                {symbol("rechnen") ?? <RefreshCw className="h-4 w-4" />}
                Zahlen neu berechnen
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void herunterladen()}
              disabled={!!busy}
            >
              {symbol("pdf") ?? <Download className="h-4 w-4" />}
              PDF
            </Button>
            {!gesperrt ? (
              <Button
                onClick={() => void speichern()}
                disabled={!!busy || !geaendert}
              >
                {symbol("speichern")}
                Speichern
              </Button>
            ) : null}
          </div>
        }
      />
      <PageWrapper>
        <div className="grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-heading">Texte</h2>
                {!gesperrt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void kiTexte()}
                    disabled={!!busy}
                  >
                    {symbol("ki") ?? <Sparkles className="h-4 w-4" />}
                    KI-Entwurf aus den Kennzahlen
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-text-subtle">
                Die KI schreibt nur mit Zahlen aus den eingefrorenen Kennzahlen
                und geprüften Vergleichswerten. Zahlen, die dort nicht stehen,
                erscheinen unten als Prüfhinweis.
              </p>
              {(texte.pruefhinweise ?? []).map((h, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 border-l-2 border-amber-600 bg-amber-50 px-2 py-1 text-xs text-amber-900"
                >
                  <span className="flex-1">{h}</span>
                  {!gesperrt ? (
                    <button
                      aria-label="Hinweis entfernen"
                      onClick={() =>
                        setzeTexte({
                          pruefhinweise: (texte.pruefhinweise ?? []).filter(
                            (_, j) => j !== i,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}

              <h3 className="mt-2 text-xs font-semibold text-text-muted">
                Drei Kernthesen (Stichwort, Doppelpunkt, Aussage)
              </h3>
              {[0, 1, 2].map((i) => (
                <Input
                  key={i}
                  id={`mb-these-${i}`}
                  disabled={gesperrt}
                  value={texte.thesen?.[i] ?? ""}
                  placeholder={
                    i === 0
                      ? "z. B. Köln vorn: Angebotsfaktor über Düsseldorf"
                      : ""
                  }
                  onChange={(e) => {
                    const thesen = [...(texte.thesen ?? [])];
                    thesen[i] = e.target.value;
                    setzeTexte({ thesen });
                  }}
                />
              ))}

              {TEXTFELDER.map(({ feld, titel, hilfe }) => (
                <div key={feld} className="mt-2 flex flex-col gap-1">
                  <h3 className="text-xs font-semibold text-text-muted">
                    {titel}{" "}
                    <span className="font-normal text-text-subtle">
                      · {hilfe}
                    </span>
                  </h3>
                  <Textarea
                    id={`mb-${feld}`}
                    rows={4}
                    disabled={gesperrt}
                    value={(texte[feld] as string | undefined) ?? ""}
                    onChange={(e) => setzeTexte({ [feld]: e.target.value })}
                  />
                </div>
              ))}

              {texte.ausblickTrends?.length ? (
                <div className="mt-2 flex flex-col gap-1">
                  <h3 className="text-xs font-semibold text-text-muted">
                    Trend und Prognose je Kennzahl
                  </h3>
                  {texte.ausblickTrends.map((tr, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <Input
                        className="h-8 max-w-56"
                        disabled={gesperrt}
                        value={tr.kennzahl}
                        onChange={(e) => {
                          const l = [...texte.ausblickTrends!];
                          l[i] = { ...tr, kennzahl: e.target.value };
                          setzeTexte({ ausblickTrends: l });
                        }}
                      />
                      {(["trend", "prognose"] as const).map((f) => (
                        <select
                          key={f}
                          aria-label={f === "trend" ? "Trend" : "Prognose"}
                          disabled={gesperrt}
                          className="h-8 border border-input bg-background px-1"
                          value={tr[f]}
                          onChange={(e) => {
                            const l = [...texte.ausblickTrends!];
                            l[i] = { ...tr, [f]: e.target.value as Trend };
                            setzeTexte({ ausblickTrends: l });
                          }}
                        >
                          {TRENDS.map((x) => (
                            <option key={x} value={x}>
                              {f === "trend" ? "Trend" : "Prognose"}: {x}
                            </option>
                          ))}
                        </select>
                      ))}
                      {!gesperrt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Zeile entfernen"
                          onClick={() =>
                            setzeTexte({
                              ausblickTrends: texte.ausblickTrends!.filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-heading">
                  Vergleichswerte anderer Häuser
                </h2>
                {!gesperrt ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={dateiInput}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void pdfAuslesen(f);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => dateiInput.current?.click()}
                    >
                      {symbol("auslesen") ?? <FileUp className="h-4 w-4" />}
                      Marktbericht-PDF auslesen
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setWerte((l) => [...l, leererWert()]);
                        setGeaendert(true);
                      }}
                    >
                      <Plus className="h-4 w-4" /> Wert von Hand
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="text-xs text-text-subtle">
                PDF von BNP Paribas RE, JLL, CBRE, Cushman & Wakefield, Savills,
                Colliers oder dem Gutachterausschuss hochladen (bis 3 MB). Die
                KI liest Kennzahlen mit Seite und Zitat aus; gedruckt werden nur
                bestätigte Werte, immer mit Quelle.
                {ungeprueft
                  ? ` ${ungeprueft} Wert(e) noch nicht bestätigt.`
                  : ""}
              </p>
              {werte.length === 0 ? (
                <p className="text-sm text-text-muted">
                  Noch keine Vergleichswerte.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {werte.map((w, i) => (
                    <div
                      key={w.id}
                      className={`flex flex-col gap-2 border p-3 ${w.geprueft ? "border-hairline" : "border-amber-400 bg-amber-50/40"}`}
                    >
                      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_0.8fr_0.8fr_1fr]">
                        <Input
                          aria-label="Kennzahl"
                          placeholder="Kennzahl, z. B. Spitzenrendite MFH"
                          disabled={gesperrt}
                          value={w.kennzahl}
                          onChange={(e) =>
                            setzeWert(i, { kennzahl: e.target.value })
                          }
                        />
                        <Input
                          aria-label="Region"
                          placeholder="Region"
                          disabled={gesperrt}
                          value={w.region}
                          onChange={(e) =>
                            setzeWert(i, { region: e.target.value })
                          }
                        />
                        <Input
                          aria-label="Wert"
                          inputMode="decimal"
                          disabled={gesperrt}
                          defaultValue={String(w.wert).replace(".", ",")}
                          onBlur={(e) => {
                            const n = Number(
                              e.target.value
                                .replace(/\./g, "")
                                .replace(",", "."),
                            );
                            if (Number.isFinite(n)) setzeWert(i, { wert: n });
                          }}
                        />
                        <Input
                          aria-label="Einheit"
                          placeholder="%, Mio. €"
                          disabled={gesperrt}
                          value={w.einheit}
                          onChange={(e) =>
                            setzeWert(i, { einheit: e.target.value })
                          }
                        />
                        <Input
                          aria-label="Veränderung"
                          placeholder="+10 bp"
                          disabled={gesperrt}
                          value={w.veraenderung ?? ""}
                          onChange={(e) =>
                            setzeWert(i, { veraenderung: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr]">
                        <Input
                          aria-label="Quelle"
                          placeholder="Quelle, z. B. BNP Paribas RE, Investmentmarkt Düsseldorf H1 2026"
                          disabled={gesperrt}
                          value={w.quelle}
                          onChange={(e) =>
                            setzeWert(i, { quelle: e.target.value })
                          }
                        />
                        <Input
                          aria-label="Stand"
                          type="date"
                          disabled={gesperrt}
                          value={w.stichtag}
                          onChange={(e) =>
                            setzeWert(i, { stichtag: e.target.value })
                          }
                        />
                        <Input
                          aria-label="Link zur Quelle"
                          placeholder="https://…"
                          disabled={gesperrt}
                          value={w.url ?? ""}
                          onChange={(e) =>
                            setzeWert(i, { url: e.target.value })
                          }
                        />
                      </div>
                      {w.zitat ? (
                        <p className="text-xs text-text-muted">
                          Seite {w.seite ?? "?"}: „{w.zitat}“
                        </p>
                      ) : null}
                      {!gesperrt ? (
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={w.geprueft}
                              onChange={(e) =>
                                setzeWert(i, { geprueft: e.target.checked })
                              }
                            />
                            Geprüft, im Bericht zitieren
                          </label>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Wert entfernen"
                            onClick={() => setzeWert(i, null)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <section className="flex flex-col gap-3 border border-hairline bg-surface p-4">
              <h2 className="text-sm font-semibold text-heading">
                Auf einen Blick
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {vorschau.map((kc, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-0.5 border-t-2 border-[#233567] pt-1.5"
                  >
                    <span className="text-lg text-heading tabular-nums">
                      {kc.wert}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-text-muted">
                      {kc.label}
                    </span>
                    {kc.veraenderung ? (
                      <span className="text-[11px] text-text-subtle">
                        {kc.veraenderung}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2 border border-hairline bg-surface p-4">
              <h2 className="text-sm font-semibold text-heading">
                Angebotsmarkt
              </h2>
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="text-left text-text-muted">
                    <th className="py-1 font-medium">Teilmarkt</th>
                    <th className="py-1 text-right font-medium">n</th>
                    <th className="py-1 text-right font-medium">Faktor</th>
                    <th className="py-1 text-right font-medium">Spanne</th>
                  </tr>
                </thead>
                <tbody>
                  {k.angebot.zeilen.map((z) => (
                    <tr key={z.teilmarkt} className="border-t border-hairline">
                      <td
                        className={`py-1 ${z.teilmarkt === "Gesamt" ? "font-semibold" : ""}`}
                      >
                        {z.teilmarkt}
                      </td>
                      <td className="py-1 text-right">{z.angebote}</td>
                      <td className="py-1 text-right">
                        {median(z.faktor, fmt.faktor)}
                      </td>
                      <td className="py-1 text-right">
                        {spanne(z.faktor, fmt.faktor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-text-subtle">
                Werte ab {MINDEST_FALLZAHL} Angeboten. Erfassung seit{" "}
                {formatDate(k.angebot.ersterEingang)}.
                {k.angebot.vorperiode
                  ? ""
                  : " Für den Vorjahresvergleich fehlen noch Daten."}
              </p>
            </section>

            <section className="flex flex-col gap-1 border border-hairline bg-surface p-4 text-xs">
              <h2 className="mb-1 text-sm font-semibold text-heading">
                Weitere Daten
              </h2>
              <p>
                Ankaufsprofile: {k.kaeufer.profile} ({k.kaeufer.mitVolumen} mit
                Volumen)
              </p>
              <p>
                Vermarktung: {k.vermarktung.neueMandate} neue Mandate,{" "}
                {k.vermarktung.abschluesse} Abschlüsse
              </p>
              <p>
                Markt-Radar: {k.radar.kaeufer} Käufer-, {k.radar.verkaeufer}{" "}
                Verkäufer-Meldungen
              </p>
              <p>
                Zinsen:{" "}
                {k.zinsen.reihen
                  .map(
                    (r) =>
                      `${r.label.split(" (")[0]} ${fmt.prozent(r.werte.at(-1)!.wert)}`,
                  )
                  .join(" · ") || "–"}
              </p>
              {k.zinsen.fehler ? (
                <p className="text-red-700">{k.zinsen.fehler}</p>
              ) : null}
            </section>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-4">
              <h2 className="text-sm font-semibold text-heading">Freigabe</h2>
              {gesperrt ? (
                <p className="text-xs text-text-subtle">
                  Freigegeben am {formatDate(bericht.freigegebenAm)}. Das PDF
                  ist ohne Entwurfsstempel und kann versendet werden.
                </p>
              ) : (
                <>
                  <p className="text-xs text-text-subtle">
                    Bis zur Freigabe trägt das PDF den Stempel ENTWURF. Danach
                    sind Zahlen und Texte gesperrt.
                  </p>
                  <Button
                    onClick={() => void freigeben()}
                    disabled={!!busy || ungeprueft > 0}
                  >
                    {symbol("freigeben") ?? (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Bericht freigeben
                  </Button>
                  {loeschenFrage ? (
                    <div className="flex flex-col gap-2 border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                      Entwurf endgültig löschen?
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void loeschen()}
                          disabled={!!busy}
                        >
                          {symbol("loeschen")}
                          Löschen
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLoeschenFrage(false)}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => setLoeschenFrage(true)}
                    >
                      <Trash2 className="h-4 w-4" /> Entwurf löschen
                    </Button>
                  )}
                </>
              )}
            </section>
          </aside>
        </div>
      </PageWrapper>
    </>
  );
}
