import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  Download,
  FileUp,
  Loader2,
  Plus,
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
import { base64Herunterladen } from "@/lib/download";
import { formatDate } from "@/lib/format";
import {
  FELDER,
  type Aussage,
  type FeldId,
  type FeldWert,
  type TextAbschnitt,
} from "@/lib/expose-generator/modell";
import type { FeldVorschlag } from "@/lib/expose-generator/ki";
import type { EntwurfVoll } from "@/lib/expose-generator/server-fn";
import type { Quelle } from "@/lib/vorlagen/typen";

const GRUPPEN: { id: string; titel: string }[] = [
  { id: "eckdaten", titel: "Eckdaten" },
  { id: "flaechen", titel: "Flächen und Mieten" },
  { id: "investment", titel: "Preis und Provision" },
  { id: "energie", titel: "Energieausweis (GEG § 87)" },
];

const TEXT_ABSCHNITTE: {
  id: TextAbschnitt;
  titel: string;
  nurExpose?: boolean;
}[] = [
  { id: "objekt", titel: "Objektbeschreibung" },
  { id: "lage", titel: "Lage", nurExpose: true },
  { id: "investment", titel: "Investment-Summary" },
];

const STATUS_TEXT: Record<string, string> = {
  entwurf: "Entwurf",
  in_pruefung: "In Prüfung",
  freigegeben: "Freigegeben",
  versendet: "Versendet",
  archiviert: "Archiviert",
};

function quelleText(q: Quelle | null | undefined): string {
  if (!q) return "ohne Quelle";
  if (q.art === "dokument")
    return `${q.bezeichnung}, S. ${q.seite}${q.zitat ? `: „${q.zitat}“` : ""}`;
  return q.bezeichnung;
}

export function ExposeEditorPage({ sfId, id }: { sfId: string; id: string }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [entwurf, setEntwurf] = useState<EntwurfVoll | null>(null);
  const [titel, setTitel] = useState("");
  const [felder, setFelder] = useState<Partial<Record<FeldId, FeldWert>>>({});
  const [texte, setTexte] = useState<Partial<Record<TextAbschnitt, Aussage[]>>>(
    {},
  );
  const [luecken, setLuecken] = useState<string[]>([]);
  const [belege, setBelege] = useState<Quelle[]>([]);
  const [vorschlaege, setVorschlaege] = useState<FeldVorschlag[]>([]);
  const [geaendert, setGeaendert] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sfBestaetigt, setSfBestaetigt] = useState(false);

  const uebernehmen = useCallback((e: EntwurfVoll) => {
    setEntwurf(e);
    setTitel(e.titel);
    setFelder(e.inhalt.felder);
    setTexte(e.inhalt.texte);
    setLuecken(e.inhalt.luecken);
    setBelege(e.inhalt.belege);
    setGeaendert(false);
  }, []);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { entwurfLadenFn } =
          await import("@/lib/expose-generator/server-fn");
        uebernehmen(
          await entwurfLadenFn({ data: { supabaseAccessToken: token, id } }),
        );
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Entwurf konnte nicht geladen werden.",
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
        duration: 14_000,
      });
    } finally {
      setBusy(null);
    }
  };

  const aendern = () => setGeaendert(true);

  const setzeFeld = (fid: FeldId, wert: string, quelle?: Quelle | null) => {
    setFelder((f) => ({
      ...f,
      [fid]: { wert, quelle: quelle === undefined ? null : quelle },
    }));
    aendern();
  };

  const speichern = () =>
    mitBusy("speichern", async () => {
      const { entwurfSpeichernFn } =
        await import("@/lib/expose-generator/server-fn");
      uebernehmen(
        await entwurfSpeichernFn({
          data: {
            supabaseAccessToken: token,
            id,
            titel,
            felder,
            texte,
            luecken,
            belege,
          },
        }),
      );
      toast.success("Gespeichert und geprüft.");
    });

  const unterlageHochladen = (datei: File | undefined) =>
    datei &&
    mitBusy("unterlage", async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      const { extractPdfForChat } =
        await import("@/features/exposes/expose-import/extractPdfText");
      const pdf = await extractPdfForChat(datei);
      const { unterlageHinzufuegenFn, entwurfLadenFn } =
        await import("@/lib/expose-generator/server-fn");
      const r = await unterlageHinzufuegenFn({
        data: {
          supabaseAccessToken: token,
          id,
          name: datei.name,
          text: pdf.modelContext,
          seiten: pdf.pages.length,
        },
      });
      uebernehmen(
        await entwurfLadenFn({ data: { supabaseAccessToken: token, id } }),
      );
      setVorschlaege((v) => [...v, ...r.vorschlaege]);
      toast.success(
        `${r.vorschlaege.length} Angabe(n) mit Beleg gefunden${r.verworfen ? `, ${r.verworfen} ohne passendes Zitat verworfen` : ""}.`,
      );
    });

  const texteEntwerfen = () =>
    mitBusy("texte", async () => {
      if (geaendert)
        throw new Error(
          "Bitte zuerst speichern, damit die KI die aktuellen Angaben nutzt.",
        );
      const { texteEntwerfenFn } =
        await import("@/lib/expose-generator/server-fn");
      const r = await texteEntwerfenFn({
        data: { supabaseAccessToken: token, id },
      });
      setTexte(r.texte);
      setBelege((b) => [...b, ...r.belege]);
      setLuecken(r.luecken);
      aendern();
      toast.success("KI-Entwurf eingefügt. Bitte prüfen und speichern.");
    });

  const herunterladen = (format: "pdf" | "pptx") =>
    mitBusy(format, async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      const { entwurfDateiFn } =
        await import("@/lib/expose-generator/server-fn");
      base64Herunterladen(
        await entwurfDateiFn({
          data: { supabaseAccessToken: token, id, format },
        }),
      );
    });

  const freigeben = () =>
    mitBusy("freigeben", async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      if (
        !window.confirm(
          "Dokument freigeben? Danach ist es für den Versand bestimmt.",
        )
      )
        return;
      const { entwurfFreigebenFn } =
        await import("@/lib/expose-generator/server-fn");
      uebernehmen(
        await entwurfFreigebenFn({ data: { supabaseAccessToken: token, id } }),
      );
      toast.success("Freigegeben.");
    });

  const inSalesforce = () =>
    mitBusy("sf", async () => {
      const { entwurfInSalesforceAblegenFn } =
        await import("@/lib/expose-generator/server-fn");
      const { salesforceSessionHintFrisch } =
        await import("@/lib/salesforce/api");
      const sfSitzung = await salesforceSessionHintFrisch();
      uebernehmen(
        await entwurfInSalesforceAblegenFn({
          data: { supabaseAccessToken: token, id, bestaetigt: true, sfSitzung },
        }),
      );
      toast.success("PDF in Salesforce am Mandat abgelegt.");
    });

  const belegOptionen = useMemo(() => {
    const o: { id: string; label: string }[] = [];
    for (const f of FELDER) {
      const w = felder[f.id];
      if (w?.wert && w.quelle)
        o.push({ id: `feld:${f.id}`, label: `${f.label}: ${w.wert}` });
    }
    for (const b of belege) o.push({ id: b.id, label: quelleText(b) });
    return o;
  }, [felder, belege]);
  const belegLabel = (bid: string) =>
    belegOptionen.find((o) => o.id === bid)?.label ?? bid;

  if (!entwurf) {
    return (
      <PageWrapper>
        <Loader2 className="h-4 w-4 animate-spin" />
      </PageWrapper>
    );
  }

  const gesperrt = entwurf.status !== "entwurf";
  const offen = entwurf.pruefung.punkte.filter((p) => p.status !== "ok");

  return (
    <>
      <PageHeader
        titel={titel || entwurf.titel}
        beschreibung={`${entwurf.typ === "teaser" ? "Teaser" : "Exposé"} · Version ${entwurf.version} · ${STATUS_TEXT[entwurf.status]} · zuletzt geändert ${formatDate(entwurf.updatedAt)}`}
        aktionen={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/mandate/$sfId" params={{ sfId }}>
                Zum Mandat
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => void herunterladen("pdf")}
              disabled={!!busy}
            >
              {busy === "pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => void herunterladen("pptx")}
              disabled={!!busy}
            >
              {busy === "pptx" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PowerPoint
            </Button>
            {!gesperrt ? (
              <Button
                onClick={() => void speichern()}
                disabled={!!busy || !geaendert}
              >
                {busy === "speichern" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Speichern und prüfen
              </Button>
            ) : null}
          </div>
        }
      />
      <PageWrapper>
        <div className="grid max-w-7xl gap-6 xl:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
              <label className="flex flex-col gap-1 text-xs text-text-subtle">
                Titel
                <Input
                  disabled={gesperrt}
                  value={titel}
                  onChange={(e) => (setTitel(e.target.value), aendern())}
                />
              </label>
            </section>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-heading">
                  Unterlagen
                </h2>
                {!gesperrt ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 border border-hairline px-3 py-1.5 text-sm hover:bg-surface-muted">
                    {busy === "unterlage" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileUp className="h-4 w-4" />
                    )}
                    PDF hinzufügen (Energieausweis, Mieterliste, Flächen …)
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      disabled={!!busy}
                      onChange={(e) => {
                        void unterlageHochladen(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
              {entwurf.inhalt.unterlagen.length ? (
                <ul className="text-sm">
                  {entwurf.inhalt.unterlagen.map((u) => (
                    <li key={u.id}>
                      {u.name}{" "}
                      <span className="text-text-subtle">
                        ({u.seiten} Seiten)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-subtle">
                  Die KI liest Angaben nur mit Seite und wörtlichem Zitat aus.
                  Ein Wert ohne passendes Zitat wird verworfen.
                </p>
              )}
              {vorschlaege.length ? (
                <div className="flex flex-col gap-2 border border-l-[3px] border-hairline border-l-[var(--gc-hellblau)] p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-heading">
                      Gefundene Angaben ({vorschlaege.length})
                    </h3>
                    <Button
                      size="sm"
                      onClick={() => {
                        for (const v of vorschlaege)
                          setzeFeld(v.feld, v.wert, v.quelle);
                        setVorschlaege([]);
                      }}
                    >
                      Alle übernehmen
                    </Button>
                  </div>
                  {vorschlaege.map((v, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <div className="flex-1">
                        <span className="font-medium">
                          {FELDER.find((f) => f.id === v.feld)?.label}:
                        </span>{" "}
                        {v.wert}
                        {felder[v.feld]?.wert &&
                        felder[v.feld]?.wert !== v.wert ? (
                          <span className="text-red-700">
                            {" "}
                            (bisher: {felder[v.feld]?.wert})
                          </span>
                        ) : null}
                        <div className="text-text-subtle">
                          {quelleText(v.quelle)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setzeFeld(v.feld, v.wert, v.quelle);
                          setVorschlaege((l) => l.filter((_, j) => j !== i));
                        }}
                      >
                        Übernehmen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setVorschlaege((l) => l.filter((_, j) => j !== i))
                        }
                      >
                        Verwerfen
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            {GRUPPEN.map((g) => (
              <section
                key={g.id}
                className="flex flex-col gap-3 border border-hairline bg-surface p-5"
              >
                <h2 className="text-sm font-semibold text-heading">
                  {g.titel}
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {FELDER.filter((f) => f.gruppe === g.id).map((f) => {
                    const w = felder[f.id];
                    return (
                      <label key={f.id} className="flex flex-col gap-1 text-xs">
                        <span className="text-text-subtle">{f.label}</span>
                        <Input
                          disabled={gesperrt}
                          value={w?.wert ?? ""}
                          onChange={(e) => setzeFeld(f.id, e.target.value)}
                        />
                        <span
                          className={
                            w?.wert && !w.quelle
                              ? "text-text-subtle italic"
                              : "text-text-subtle"
                          }
                        >
                          {w?.wert
                            ? w.quelle
                              ? quelleText(w.quelle)
                              : "wird beim Speichern als deine Eingabe belegt"
                            : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-heading">Texte</h2>
                {!gesperrt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void texteEntwerfen()}
                    disabled={!!busy}
                  >
                    {busy === "texte" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    KI-Entwurf aus belegten Angaben
                  </Button>
                ) : null}
              </div>
              {TEXT_ABSCHNITTE.filter(
                (t) => !(t.nurExpose && entwurf.typ === "teaser"),
              ).map((t) => {
                const liste = texte[t.id] ?? [];
                const setzeListe = (neu: Aussage[]) => {
                  setTexte((x) => ({ ...x, [t.id]: neu }));
                  aendern();
                };
                return (
                  <div key={t.id} className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold text-text-muted">
                      {t.titel}
                    </h3>
                    {liste.map((a, i) => (
                      <div
                        key={i}
                        className="flex flex-col gap-1 border border-hairline p-2"
                      >
                        <Textarea
                          rows={2}
                          disabled={gesperrt}
                          value={a.text}
                          onChange={(e) =>
                            setzeListe(
                              liste.map((x, j) =>
                                j === i ? { ...x, text: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {a.quellen.map((q) => (
                            <span
                              key={q}
                              className="inline-flex items-center gap-1 bg-surface-muted px-2 py-0.5"
                            >
                              {belegLabel(q)}
                              {!gesperrt ? (
                                <button
                                  aria-label="Beleg entfernen"
                                  onClick={() =>
                                    setzeListe(
                                      liste.map((x, j) =>
                                        j === i
                                          ? {
                                              ...x,
                                              quellen: x.quellen.filter(
                                                (y) => y !== q,
                                              ),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              ) : null}
                            </span>
                          ))}
                          {!a.quellen.length ? (
                            <span className="text-red-700">Ohne Beleg</span>
                          ) : null}
                          {!gesperrt ? (
                            <>
                              <select
                                className="h-7 max-w-72 border border-input bg-background px-1"
                                value=""
                                onChange={(e) =>
                                  e.target.value &&
                                  setzeListe(
                                    liste.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            quellen: [
                                              ...new Set([
                                                ...x.quellen,
                                                e.target.value,
                                              ]),
                                            ],
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              >
                                <option value="">Beleg hinzufügen …</option>
                                {belegOptionen.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label.slice(0, 90)}
                                  </option>
                                ))}
                              </select>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setzeListe(liste.filter((_, j) => j !== i))
                                }
                                aria-label="Aussage entfernen"
                              >
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
                        onClick={() =>
                          setzeListe([...liste, { text: "", quellen: [] }])
                        }
                      >
                        <Plus className="h-4 w-4" /> Aussage
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              {luecken.length ? (
                <div className="flex flex-col gap-1">
                  <h3 className="text-xs font-semibold text-text-muted">
                    Lücken laut KI (nicht im Dokument, nur Hinweis)
                  </h3>
                  {luecken.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 border-l-2 border-red-600 bg-red-50 px-2 py-1 text-xs text-red-900"
                    >
                      <span className="flex-1">{l}</span>
                      {!gesperrt ? (
                        <button
                          aria-label="Lücke entfernen"
                          onClick={() => (
                            setLuecken((x) => x.filter((_, j) => j !== i)),
                            aendern()
                          )}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="flex flex-col gap-2 border border-hairline bg-surface p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-heading">
                {entwurf.pruefung.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-green-700" />
                ) : (
                  <CircleAlert className="h-4 w-4 text-red-700" />
                )}
                Pflichtangaben-Prüfung
              </h2>
              <p className="text-xs text-text-subtle">
                Stand {formatDate(entwurf.pruefung.geprueftAm)}
                {geaendert
                  ? ", ungespeicherte Änderungen werden beim Speichern geprüft"
                  : ""}
                .
              </p>
              <ul className="flex flex-col gap-1 text-xs">
                {entwurf.pruefung.punkte.map((p) => (
                  <li key={p.id} className="flex items-start gap-2">
                    <span
                      className={
                        p.status === "ok" ? "text-green-700" : "text-red-700"
                      }
                    >
                      {p.status === "ok" ? "✓" : "✗"}
                    </span>
                    <span>
                      {p.label}
                      {p.status === "ohne_quelle"
                        ? " (ohne Quelle)"
                        : p.status === "fehlt"
                          ? " (fehlt)"
                          : ""}
                      {p.hinweis && p.status !== "ok" ? (
                        <span className="block text-text-subtle">
                          {p.hinweis}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-4">
              <h2 className="text-sm font-semibold text-heading">Freigabe</h2>
              {entwurf.status === "entwurf" ? (
                <>
                  <p className="text-xs text-text-subtle">
                    {offen.length
                      ? `Gesperrt, solange ${offen.length} Pflichtpunkt(e) offen sind.`
                      : "Alle Pflichtangaben belegt. Freigeben kann nur ein Nutzer."}
                  </p>
                  <Button
                    onClick={() => void freigeben()}
                    disabled={!!busy || offen.length > 0 || geaendert}
                  >
                    {busy === "freigeben" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Freigeben
                  </Button>
                </>
              ) : (
                <p className="text-xs text-text-subtle">
                  Freigegeben am {formatDate(entwurf.freigegebenAm)}. Änderungen
                  nur in einer neuen Version.
                </p>
              )}
              {entwurf.status === "freigegeben" ? (
                entwurf.sfContentDocumentId ? (
                  <p className="text-xs text-text-subtle">
                    In Salesforce am Mandat abgelegt (
                    {entwurf.sfContentDocumentId}).
                  </p>
                ) : (
                  <>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={sfBestaetigt}
                        onChange={(e) => setSfBestaetigt(e.target.checked)}
                      />
                      Ja, das freigegebene PDF als Datei am Mandat in Salesforce
                      ablegen.
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => void inSalesforce()}
                      disabled={!!busy || !sfBestaetigt}
                    >
                      {busy === "sf" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CloudUpload className="h-4 w-4" />
                      )}
                      In Salesforce ablegen
                    </Button>
                  </>
                )
              ) : null}
            </section>
          </aside>
        </div>
      </PageWrapper>
    </>
  );
}
