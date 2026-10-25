import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { base64Herunterladen } from "@/lib/download";
import { formatDate } from "@/lib/format";
import type { ReportTexte } from "@/lib/mandate/report";
import type { ReportVoll } from "@/lib/mandate/server-fn";
import {
  ABSAGEGRUENDE,
  angeboteAusKennzahlen,
  euroKurz,
  KUNDENGRUPPEN,
  berichtStand,
  herausforderungenAus,
  statusLabel,
  type BerichtWerte,
  type KundengruppeSchluessel,
  type StatusSchluessel,
} from "@/lib/mandate/vermarktungsbericht";

import { BerichtVorschau } from "./BerichtVorschau";
import { MandatReiter } from "./MandatReiter";

const STATUS_TEXT: Record<string, string> = {
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
  versendet: "Versendet",
};

/** Foto im Browser auf höchstens 2400 px verkleinern und als JPEG (Base64) liefern. */
async function fotoVerkleinern(datei: File): Promise<string> {
  const url = URL.createObjectURL(datei);
  try {
    const bild = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("Das Foto konnte nicht gelesen werden."));
      img.src = url;
    });
    const faktor = Math.min(
      1,
      2400 / Math.max(bild.naturalWidth, bild.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bild.naturalWidth * faktor);
    canvas.height = Math.round(bild.naturalHeight * faktor);
    canvas.getContext("2d")!.drawImage(bild, 0, 0, canvas.width, canvas.height);
    return canvas
      .toDataURL("image/jpeg", 0.86)
      .replace(/^data:[^;]+;base64,/, "");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Feld({
  label,
  wert,
  vorschlag,
  gesperrt,
  onChange,
  hinweis,
}: {
  label: string;
  wert: string | undefined;
  vorschlag: string;
  gesperrt: boolean;
  onChange: (v: string | undefined) => void;
  hinweis?: string;
}) {
  const eigen = wert != null && wert.trim() !== "";
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-text-muted">
        {label}
        {eigen && !gesperrt ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] font-normal text-text-subtle hover:text-heading"
            onClick={() => onChange(undefined)}
          >
            <RotateCcw className="h-3 w-3" /> Salesforce-Wert
          </button>
        ) : null}
      </span>
      <Input
        disabled={gesperrt}
        value={wert ?? ""}
        placeholder={vorschlag || "nicht gepflegt"}
        onChange={(e) => onChange(e.target.value)}
        className={eigen ? "border-[var(--gc-hellblau)]" : undefined}
      />
      {hinweis ? (
        <span className="text-[11px] text-text-subtle">{hinweis}</span>
      ) : null}
    </label>
  );
}

function ZahlZeile({
  label,
  wert,
  ausSalesforce,
  eigen,
  gesperrt,
  onChange,
}: {
  label: string;
  wert: number;
  ausSalesforce: number | null;
  eigen: boolean;
  gesperrt: boolean;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_96px_120px] items-center gap-3 border-b border-hairline py-1.5 text-sm last:border-b-0">
      <span>{label}</span>
      <Input
        type="number"
        min={0}
        disabled={gesperrt}
        value={wert}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? undefined
              : Math.max(0, Number(e.target.value)),
          )
        }
        className={`h-8 text-right ${eigen ? "border-[var(--gc-hellblau)]" : ""}`}
      />
      <span className="flex items-center gap-1 text-xs text-text-subtle">
        {ausSalesforce == null
          ? "–"
          : `SF: ${ausSalesforce.toLocaleString("de-DE")}`}
        {eigen && !gesperrt ? (
          <button
            type="button"
            aria-label="Salesforce-Wert übernehmen"
            title="Salesforce-Wert übernehmen"
            className="ml-1 hover:text-heading"
            onClick={() => onChange(undefined)}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function FotoFeld({
  titel,
  url,
  gesperrt,
  busy,
  onWahl,
  onEntfernen,
}: {
  titel: string;
  url: string | null;
  gesperrt: boolean;
  busy: boolean;
  onWahl: (datei: File) => void;
  onEntfernen: () => void;
}) {
  const eingabe = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-text-muted">{titel}</span>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-28 items-center justify-center overflow-hidden border border-hairline bg-surface-muted">
          {url ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-5 w-5 text-text-subtle" />
          )}
        </div>
        {!gesperrt ? (
          <div className="flex flex-col gap-1">
            <input
              ref={eingabe}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const d = e.target.files?.[0];
                if (d) onWahl(d);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => eingabe.current?.click()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {url ? "Ersetzen" : "Hochladen"}
            </Button>
            {url ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={onEntfernen}
              >
                <Trash2 className="h-4 w-4" /> Entfernen
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ReportEditorPage({ sfId, id }: { sfId: string; id: string }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [report, setReport] = useState<ReportVoll | null>(null);
  const [texte, setTexte] = useState<ReportTexte>({});
  const [fotoUrls, setFotoUrls] = useState<ReportVoll["fotoUrls"]>({
    titel: null,
    objekt: null,
  });
  const [geaendert, setGeaendert] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [empfaenger, setEmpfaenger] = useState("");
  const [bestaetigt, setBestaetigt] = useState(false);

  const uebernehmen = useCallback((r: ReportVoll) => {
    setReport(r);
    setTexte(r.texte ?? {});
    setFotoUrls(r.fotoUrls ?? { titel: null, objekt: null });
    setGeaendert(false);
    setEmpfaenger((e) => e || r.eigentuemerEmail || "");
  }, []);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { reportLadenFn } = await import("@/lib/mandate/server-fn");
        uebernehmen(
          await reportLadenFn({ data: { supabaseAccessToken: token, id } }),
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

  const setze = (teil: Partial<ReportTexte>) => {
    setTexte((t) => ({ ...t, ...teil }));
    setGeaendert(true);
  };
  const setzeWerte = (teil: Partial<BerichtWerte>) =>
    setze({ werte: { ...(texte.werte ?? {}), ...teil } });

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

  const speichern = () =>
    mitBusy("speichern", async () => {
      const { reportTexteSpeichernFn } =
        await import("@/lib/mandate/server-fn");
      uebernehmen(
        await reportTexteSpeichernFn({
          data: { supabaseAccessToken: token, id, texte },
        }),
      );
      toast.success("Gespeichert.");
    });

  const aktualisieren = () =>
    mitBusy("aktualisieren", async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      const { reportAktualisierenFn } = await import("@/lib/mandate/server-fn");
      uebernehmen(
        await reportAktualisierenFn({
          data: { supabaseAccessToken: token, id },
        }),
      );
      toast.success(
        "Zahlen aus Salesforce neu geladen. Eigene Werte sind erhalten.",
      );
    });

  const kiEntwurf = () =>
    mitBusy("ki", async () => {
      const { reportMarktfeedbackFn } = await import("@/lib/mandate/server-fn");
      const r = await reportMarktfeedbackFn({
        data: { supabaseAccessToken: token, id },
      });
      const punkte = (r.marktfeedback ?? []).map((a) => a.text).filter(Boolean);
      if (!punkte.length) {
        toast.info(
          r.marktfeedbackLuecken?.[0] ??
            "In den Salesforce-Aktivitäten steht kein verwertbares Marktfeedback.",
        );
        return;
      }
      setze({ herausforderungen: punkte });
      toast.success(
        "KI-Vorschlag eingefügt. Bitte prüfen, anpassen und speichern.",
      );
    });

  const foto = (rolle: "titel" | "objekt", datei: File | null) =>
    mitBusy(`foto-${rolle}`, async () => {
      const base64 = datei ? await fotoVerkleinern(datei) : "";
      const { reportFotoFn } = await import("@/lib/mandate/server-fn");
      const r = await reportFotoFn({
        data: { supabaseAccessToken: token, id, rolle, base64 },
      });
      setTexte((t) => ({ ...t, fotos: { ...t.fotos, [rolle]: r.pfad } }));
      setFotoUrls((f) => ({ ...f, [rolle]: r.url }));
      setReport((alt) => (alt ? { ...alt, status: "entwurf" } : alt));
    });

  const herunterladen = (format: "pdf" | "pptx") =>
    mitBusy(format, async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      const { reportDateiFn } = await import("@/lib/mandate/server-fn");
      base64Herunterladen(
        await reportDateiFn({
          data: { supabaseAccessToken: token, id, format },
        }),
      );
    });

  const freigeben = () =>
    mitBusy("freigeben", async () => {
      if (geaendert) throw new Error("Bitte zuerst speichern.");
      if (
        !window.confirm(
          "Bericht freigeben? Danach ist er bereit zum Versand an den Eigentümer.",
        )
      )
        return;
      const { reportFreigebenFn } = await import("@/lib/mandate/server-fn");
      uebernehmen(
        await reportFreigebenFn({ data: { supabaseAccessToken: token, id } }),
      );
      toast.success("Bericht freigegeben.");
    });

  const versandProtokollieren = () =>
    mitBusy("versand", async () => {
      const { reportVersandProtokollierenFn } =
        await import("@/lib/mandate/server-fn");
      const { salesforceSessionHintFrisch } =
        await import("@/lib/salesforce/api");
      const sfSitzung = await salesforceSessionHintFrisch();
      uebernehmen(
        await reportVersandProtokollierenFn({
          data: {
            supabaseAccessToken: token,
            id,
            empfaenger,
            bestaetigt,
            sfSitzung,
          },
        }),
      );
      toast.success(
        "Versand in Salesforce als erledigte Aufgabe am Mandat protokolliert.",
      );
    });

  const stand = useMemo(
    () =>
      report
        ? berichtStand(report.kennzahlen, texte, {
            freigegeben: report.status !== "entwurf",
          })
        : null,
    [report, texte],
  );

  if (!report || !stand) {
    return (
      <PageWrapper>
        <Loader2 className="h-4 w-4 animate-spin" />
      </PageWrapper>
    );
  }

  const k = report.kennzahlen;
  const v = k.vermarktung;
  const w = texte.werte ?? {};
  const gesperrt = report.status === "versendet";
  const absagenSoll =
    (stand.status.find((s) => s.key === "absagen")?.wert ?? 0) +
    (stand.status.find((s) => s.key === "absageNachInteresse")?.wert ?? 0);
  const gruende =
    w.absagegruende ??
    stand.absagegruende.map((g) => ({ grund: g.label, anzahl: g.wert }));
  const setzeGruende = (liste: { grund: string; anzahl: number }[]) =>
    setzeWerte({ absagegruende: liste });

  return (
    <>
      <PageHeader
        titel={report.titel ?? "Vermarktungsbericht"}
        reiter={<MandatReiter sfId={sfId} aktiv="reports" />}
        beschreibung={`Salesforce-Stand vom ${formatDate(k.stand)} · Status: ${STATUS_TEXT[report.status]} · Gelb umrandete Felder sind händisch angepasst und haben Vorrang vor Salesforce.`}
        aktionen={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/mandate/$sfId/reports" params={{ sfId }}>
                Alle Berichte
              </Link>
            </Button>
            {!gesperrt ? (
              <Button
                variant="outline"
                onClick={() => void aktualisieren()}
                disabled={!!busy}
              >
                {busy === "aktualisieren" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Aus Salesforce aktualisieren
              </Button>
            ) : null}
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
                Speichern
              </Button>
            ) : null}
          </div>
        }
      />
      <PageWrapper>
        {!v ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-l-2 border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
            Dieser Bericht wurde vor der neuen Grenz-Vorlage angelegt. Bitte die
            Zahlen einmal aus Salesforce laden, damit Status, Kundengruppen und
            Absagegründe befüllt werden.
            <Button
              size="sm"
              onClick={() => void aktualisieren()}
              disabled={!!busy || gesperrt}
            >
              <RefreshCw className="h-4 w-4" /> Zahlen laden
            </Button>
          </div>
        ) : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <Tabs defaultValue="stand">
              <TabsList className="flex-wrap">
                <TabsTrigger value="titel">Titel & Objekt</TabsTrigger>
                <TabsTrigger value="zielgruppe">Zielgruppe</TabsTrigger>
                <TabsTrigger value="stand">Vermarktungsstand</TabsTrigger>
                <TabsTrigger value="texte">
                  Herausforderungen & Vorgehen
                </TabsTrigger>
                <TabsTrigger value="angebote">
                  Aktivitäten & Angebote
                </TabsTrigger>
                <TabsTrigger value="interessenten">Interessenten</TabsTrigger>
              </TabsList>

              <TabsContent value="titel">
                <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Feld
                      label="Titel"
                      wert={w.titel}
                      vorschlag="Vermarktungsbericht"
                      gesperrt={gesperrt}
                      onChange={(x) => setzeWerte({ titel: x })}
                    />
                    <Feld
                      label="Berichtsdatum"
                      wert={w.berichtsdatum}
                      vorschlag={stand.berichtsdatum}
                      gesperrt={gesperrt}
                      onChange={(x) => setzeWerte({ berichtsdatum: x })}
                      hinweis="z. B. 2026-10-25 oder freier Text"
                    />
                    <div className="sm:col-span-2">
                      <Feld
                        label="Objektbezeichnung (Titelseite)"
                        wert={w.objektbezeichnung}
                        vorschlag={stand.objektbezeichnung}
                        gesperrt={gesperrt}
                        onChange={(x) => setzeWerte({ objektbezeichnung: x })}
                      />
                    </div>
                    <Feld
                      label="Objektanschrift"
                      wert={w.objektanschrift}
                      vorschlag={v?.objektanschrift ?? k.mandat.adresse ?? ""}
                      gesperrt={gesperrt}
                      onChange={(x) => setzeWerte({ objektanschrift: x })}
                    />
                    <Feld
                      label="Objekttyp"
                      wert={w.objekttyp}
                      vorschlag={v?.objekttyp ?? ""}
                      gesperrt={gesperrt}
                      onChange={(x) => setzeWerte({ objekttyp: x })}
                    />
                    <Feld
                      label="Auftraggeber"
                      wert={w.auftraggeber}
                      vorschlag={v?.auftraggeber ?? ""}
                      gesperrt={gesperrt}
                      onChange={(x) => setzeWerte({ auftraggeber: x })}
                    />
                    <Feld
                      label="Beginn der Vermarktung"
                      wert={w.vermarktungsbeginn}
                      vorschlag={stand.vermarktungsbeginn}
                      gesperrt={gesperrt}
                      onChange={(x) => setzeWerte({ vermarktungsbeginn: x })}
                      hinweis="Salesforce: erste Kampagne, sonst Beauftragung"
                    />
                  </div>
                  <div className="grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2">
                    <FotoFeld
                      titel="Foto Titelseite"
                      url={fotoUrls.titel}
                      gesperrt={gesperrt}
                      busy={busy === "foto-titel"}
                      onWahl={(d) => void foto("titel", d)}
                      onEntfernen={() => void foto("titel", null)}
                    />
                    <FotoFeld
                      titel="Foto Seite Zielgruppe"
                      url={fotoUrls.objekt}
                      gesperrt={gesperrt}
                      busy={busy === "foto-objekt"}
                      onWahl={(d) => void foto("objekt", d)}
                      onEntfernen={() => void foto("objekt", null)}
                    />
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="zielgruppe">
                <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                  <h2 className="text-sm font-semibold text-heading">
                    Zusammensetzung der Kundengruppen
                  </h2>
                  <p className="text-xs text-text-subtle">
                    Vorschlag aus Salesforce: Investor-Typ im Ankaufsprofil,
                    Account-Typ und „Privater Investor?“, sonst Einordnung über
                    den Firmennamen (Personen ohne Firma = Privatinvestoren).
                    Bitte prüfen und bei Bedarf anpassen.
                  </p>
                  <div>
                    {stand.kundengruppen.map((g) => (
                      <ZahlZeile
                        key={g.key}
                        label={g.label}
                        wert={g.wert}
                        ausSalesforce={g.ausSalesforce}
                        eigen={w.kundengruppen?.[g.key] != null}
                        gesperrt={gesperrt}
                        onChange={(x) =>
                          setzeWerte({
                            kundengruppen: {
                              ...w.kundengruppen,
                              [g.key as KundengruppeSchluessel]: x,
                            },
                          })
                        }
                      />
                    ))}
                  </div>
                  <p className="text-xs text-text-subtle">
                    Summe{" "}
                    {stand.kundengruppen
                      .reduce((s, g) => s + g.wert, 0)
                      .toLocaleString("de-DE")}{" "}
                    · angesprochene Investoren{" "}
                    {stand.angesprochen.toLocaleString("de-DE")}
                  </p>
                </section>
              </TabsContent>

              <TabsContent value="stand">
                <div className="flex flex-col gap-6">
                  <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                    <h2 className="text-sm font-semibold text-heading">
                      Status der angesprochenen Investoren
                    </h2>
                    <p className="text-xs text-text-subtle">
                      Jeder Investor zählt einmal mit seinem aktuellen Stand.
                      Grundlage sind die Interessenten-Deals (Phase,
                      Besichtigungsstatus, Betrag) und die Kampagnenmitglieder.
                      {v?.vorgemerkt
                        ? ` ${v.vorgemerkt} weitere sind vorgemerkt, aber noch nicht angeschrieben, und zählen nicht mit.`
                        : ""}
                    </p>
                    <div>
                      {stand.status.map((s) => (
                        <ZahlZeile
                          key={s.key}
                          label={s.label}
                          wert={s.wert}
                          ausSalesforce={s.ausSalesforce}
                          eigen={w.status?.[s.key] != null}
                          gesperrt={gesperrt}
                          onChange={(x) =>
                            setzeWerte({
                              status: {
                                ...w.status,
                                [s.key as StatusSchluessel]: x,
                              },
                            })
                          }
                        />
                      ))}
                      <div className="grid grid-cols-[1fr_96px_120px] gap-3 py-2 text-sm font-semibold">
                        <span>Gesamt (angesprochene Investoren)</span>
                        <span className="pr-3 text-right">
                          {stand.angesprochen.toLocaleString("de-DE")}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-heading">
                        Absagegründe
                      </h2>
                      {w.absagegruende && !gesperrt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setzeWerte({ absagegruende: undefined })
                          }
                        >
                          <RotateCcw className="h-4 w-4" /> Salesforce-Vorschlag
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-text-subtle">
                      Vorschlag aus dem Verlustgrund der Deals und den Texten
                      der Salesforce- Aktivitäten je Absage. Gründe und Anzahlen
                      sind frei änderbar.
                    </p>
                    {gruende.map((g, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_96px_40px] items-center gap-3"
                      >
                        <Input
                          list="absagegruende"
                          disabled={gesperrt}
                          value={g.grund}
                          onChange={(e) =>
                            setzeGruende(
                              gruende.map((x, j) =>
                                j === i ? { ...x, grund: e.target.value } : x,
                              ),
                            )
                          }
                          className={
                            w.absagegruende ? "h-8 border-[var(--gc-hellblau)]" : "h-8"
                          }
                        />
                        <Input
                          type="number"
                          min={0}
                          disabled={gesperrt}
                          value={g.anzahl}
                          onChange={(e) =>
                            setzeGruende(
                              gruende.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      anzahl: Math.max(
                                        0,
                                        Number(e.target.value) || 0,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                          className={`h-8 text-right ${w.absagegruende ? "border-[var(--gc-hellblau)]" : ""}`}
                        />
                        {!gesperrt ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Grund entfernen"
                            onClick={() =>
                              setzeGruende(gruende.filter((_, j) => j !== i))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                    <datalist id="absagegruende">
                      {[...ABSAGEGRUENDE, "Sonstiges"].map((g) => (
                        <option key={g} value={g} />
                      ))}
                    </datalist>
                    {!gesperrt ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="self-start"
                        onClick={() =>
                          setzeGruende([...gruende, { grund: "", anzahl: 0 }])
                        }
                      >
                        <Plus className="h-4 w-4" /> Grund hinzufügen
                      </Button>
                    ) : null}
                    <p
                      className={`text-xs ${stand.absagenGesamt !== absagenSoll ? "text-warn" : "text-text-subtle"}`}
                    >
                      Summe der Gründe{" "}
                      {stand.absagenGesamt.toLocaleString("de-DE")} · Absagen
                      laut Status {absagenSoll.toLocaleString("de-DE")}
                      {stand.absagenGesamt !== absagenSoll
                        ? " (weicht ab)"
                        : ""}
                    </p>
                  </section>
                </div>
              </TabsContent>

              <TabsContent value="texte">
                <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-heading">
                      Bisherige Herausforderungen bei der Vermarktung
                    </h2>
                    {!gesperrt ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void kiEntwurf()}
                        disabled={!!busy}
                      >
                        {busy === "ki" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        KI-Vorschlag aus Salesforce-Aktivitäten
                      </Button>
                    ) : null}
                  </div>
                  <Textarea
                    rows={6}
                    disabled={gesperrt}
                    value={herausforderungenAus(texte).join("\n")}
                    onChange={(e) =>
                      setze({ herausforderungen: e.target.value.split("\n") })
                    }
                    placeholder={
                      "Ein Punkt je Zeile, z. B.\nMikrolage wird trotz zentraler Lage als schwach wahrgenommen"
                    }
                  />
                  <h2 className="mt-2 text-sm font-semibold text-heading">
                    Weiteres Vorgehen
                  </h2>
                  <Textarea
                    rows={5}
                    disabled={gesperrt}
                    value={(texte.naechsteSchritte ?? []).join("\n")}
                    onChange={(e) =>
                      setze({ naechsteSchritte: e.target.value.split("\n") })
                    }
                    placeholder="Ein Punkt je Zeile"
                  />
                </section>
              </TabsContent>

              <TabsContent value="angebote">
                <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={gesperrt}
                      checked={!w.ohneAktivitaetsSeite}
                      onChange={(e) =>
                        setzeWerte({
                          ohneAktivitaetsSeite: e.target.checked
                            ? undefined
                            : true,
                        })
                      }
                    />
                    Seite „Aktivitäten & Angebote“ in den Bericht aufnehmen
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs font-medium text-text-muted">
                        Angebotspreis (€)
                      </span>
                      <Input
                        type="number"
                        min={0}
                        disabled={gesperrt}
                        value={w.angebotspreis ?? ""}
                        placeholder={
                          k.mandat.angebotspreis != null
                            ? `Salesforce: ${euroKurz(k.mandat.angebotspreis)}`
                            : "nicht gepflegt"
                        }
                        onChange={(e) =>
                          setzeWerte({
                            angebotspreis:
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                          })
                        }
                        className={
                          w.angebotspreis != null
                            ? "border-[var(--gc-hellblau)]"
                            : undefined
                        }
                      />
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={gesperrt}
                        checked={!!w.bieterNamenZeigen}
                        onChange={(e) =>
                          setzeWerte({
                            bieterNamenZeigen: e.target.checked
                              ? true
                              : undefined,
                          })
                        }
                      />
                      Bieternamen zeigen (sonst „Interessent A, B …“)
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4">
                    <h2 className="text-sm font-semibold text-heading">
                      Angebote
                    </h2>
                    {w.angebote && !gesperrt ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setzeWerte({ angebote: undefined })}
                      >
                        <RotateCcw className="h-4 w-4" /> Salesforce-Angebote
                      </Button>
                    ) : null}
                  </div>
                  {(w.angebote ?? angeboteAusKennzahlen(k)).map(
                    (a, i, liste) => {
                      const aendern = (teil: Partial<typeof a>) =>
                        setzeWerte({
                          angebote: liste.map((x, j) =>
                            j === i ? { ...x, ...teil } : x,
                          ),
                        });
                      const rand = w.angebote ? "h-8 border-[var(--gc-hellblau)]" : "h-8";
                      return (
                        <div
                          key={i}
                          className="grid grid-cols-[1fr_140px_150px_40px] items-center gap-2"
                        >
                          <Input
                            disabled={gesperrt}
                            value={a.bieter}
                            placeholder="Bieter"
                            onChange={(e) =>
                              aendern({ bieter: e.target.value })
                            }
                            className={rand}
                          />
                          <Input
                            type="number"
                            min={0}
                            disabled={gesperrt}
                            value={a.betrag ?? ""}
                            placeholder="Kaufpreis €"
                            onChange={(e) =>
                              aendern({
                                betrag:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            className={`${rand} text-right`}
                          />
                          <Input
                            disabled={gesperrt}
                            value={a.stand}
                            placeholder="Stand"
                            onChange={(e) => aendern({ stand: e.target.value })}
                            className={rand}
                          />
                          {!gesperrt ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Angebot entfernen"
                              onClick={() =>
                                setzeWerte({
                                  angebote: liste.filter((_, j) => j !== i),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      );
                    },
                  )}
                  {!gesperrt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start"
                      onClick={() =>
                        setzeWerte({
                          angebote: [
                            ...(w.angebote ?? angeboteAusKennzahlen(k)),
                            { bieter: "", betrag: null, stand: "Kaufangebot" },
                          ],
                        })
                      }
                    >
                      <Plus className="h-4 w-4" /> Angebot hinzufügen
                    </Button>
                  ) : null}
                  <p className="text-xs text-text-subtle">
                    Kennzahlen und Monatsverlauf kommen aus Salesforce und
                    folgen den Werten im Reiter „Vermarktungsstand“.
                  </p>
                </section>
              </TabsContent>

              <TabsContent value="interessenten">
                <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                  <h2 className="text-sm font-semibold text-heading">
                    Herleitung aus Salesforce
                  </h2>
                  <p className="text-xs text-text-subtle">
                    So wurde jeder Interessent eingeordnet (
                    {v?.interessenten.length ?? 0} insgesamt). Falsche
                    Einordnungen am besten in Salesforce korrigieren und oben
                    „Aus Salesforce aktualisieren“ wählen, oder die Summen
                    direkt anpassen.
                  </p>
                  <div className="max-h-[520px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-surface text-left text-text-muted">
                        <tr>
                          <th className="py-1 pr-2">Interessent</th>
                          <th className="py-1 pr-2">Status</th>
                          <th className="py-1 pr-2">Kundengruppe</th>
                          <th className="py-1">Absagegrund</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(v?.interessenten ?? []).map((x) => (
                          <tr key={x.id} className="border-t border-hairline">
                            <td className="py-1 pr-2">{x.name}</td>
                            <td className="py-1 pr-2">
                              {statusLabel(x.status)}
                            </td>
                            <td className="py-1 pr-2">
                              {
                                KUNDENGRUPPEN.find(
                                  (g) => g.key === x.kundengruppe,
                                )?.label
                              }
                            </td>
                            <td className="py-1">{x.absagegrund ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </TabsContent>
            </Tabs>

            <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
              <h2 className="text-sm font-semibold text-heading">
                Freigabe und Versand
              </h2>
              {report.status === "entwurf" ? (
                <>
                  <p className="text-xs text-text-subtle">
                    Der Bericht ist ein Entwurf (Vermerk ENTWURF in PDF und
                    PowerPoint).
                  </p>
                  <Button
                    className="self-start"
                    onClick={() => void freigeben()}
                    disabled={!!busy}
                  >
                    {busy === "freigeben" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Bericht freigeben
                  </Button>
                </>
              ) : null}
              {report.status === "freigegeben" ? (
                <>
                  <p className="text-xs text-text-subtle">
                    Freigegeben am {formatDate(report.freigegebenAm)}. PDF
                    herunterladen, an den Eigentümer senden und hier den Versand
                    protokollieren. Dabei wird in Salesforce eine erledigte
                    Aufgabe am Mandat angelegt.
                  </p>
                  <Input
                    placeholder="Empfänger (E-Mail)"
                    value={empfaenger}
                    onChange={(e) => setEmpfaenger(e.target.value)}
                  />
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={bestaetigt}
                      onChange={(e) => setBestaetigt(e.target.checked)}
                    />
                    Ja, Aufgabe „Vermarktungsbericht versendet“ in Salesforce
                    anlegen.
                  </label>
                  <Button
                    className="self-start"
                    onClick={() => void versandProtokollieren()}
                    disabled={!!busy || !bestaetigt || !empfaenger.trim()}
                  >
                    {busy === "versand" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Versand protokollieren
                  </Button>
                </>
              ) : null}
              {report.status === "versendet" ? (
                <p className="text-xs text-text-subtle">
                  Versendet am {formatDate(report.versendetAm)} an{" "}
                  {report.versendetAn}. In Salesforce protokolliert
                  {report.sfTaskId ? ` (Aufgabe ${report.sfTaskId})` : ""}.
                </p>
              ) : null}
            </section>
          </div>

          <aside className="min-w-0">
            <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-2 overflow-y-auto pr-1">
              <h2 className="text-sm font-semibold text-heading">
                Vorschau{" "}
                {geaendert ? (
                  <span className="font-normal text-warn">
                    (ungespeichert)
                  </span>
                ) : null}
              </h2>
              <BerichtVorschau b={stand} fotos={fotoUrls} />
            </div>
          </aside>
        </div>
      </PageWrapper>
    </>
  );
}
