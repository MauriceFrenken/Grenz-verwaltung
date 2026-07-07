import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { BookOpen, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { ContentSection } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  EXPOSE_FELD_DEFINITIONEN,
  EXPOSE_FELD_GRUPPEN,
  EXPOSE_FELD_IDS,
  EXPOSE_SYSTEM_FELDER,
  type ExposeFeldId,
  type ExposeFeldQuelle,
} from "@/lib/expose-ai";

import { PdfSourceViewer } from "./expose-import/PdfSourceViewer";
import { extractPdfForChat, type ExtractedPdfForChat } from "./expose-import/extractPdfText";
import { findQuoteInPages } from "./expose-import/quoteLocation";
import { analysiereExpose } from "./expose-import/analysieren";

type FeldState = {
  value: string;
  quelle: ExposeFeldQuelle | null;
};

type FelderState = Record<ExposeFeldId, FeldState>;

function leereFelder(): FelderState {
  return Object.fromEntries(
    EXPOSE_FELD_IDS.map((id) => [id, { value: "", quelle: null }]),
  ) as FelderState;
}

type HighlightState = { page: number; quote: string; hint?: string } | null;

function formatHeuteDe(): string {
  return new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ExposeSystemFeldZeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="flex flex-col gap-2 border border-hairline bg-surface-muted/40 p-4">
      <span className="label-caps text-text-muted">{label}</span>
      <Input value={wert} readOnly disabled className="bg-surface-muted text-text-muted" />
      <span className="text-xs text-text-subtle">Wird beim Anlegen automatisch gesetzt</span>
    </div>
  );
}

function ExposeFeldZeile({
  label,
  feld,
  onChange,
  onQuelleOeffnen,
  hatQuelle,
}: {
  label: string;
  feld: FeldState;
  onChange: (value: string) => void;
  onQuelleOeffnen: () => void;
  hatQuelle: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border border-hairline bg-surface p-4">
      <button
        type="button"
        className={cn(
          "group flex min-w-0 flex-col gap-0.5 text-left",
          hatQuelle && "cursor-pointer",
          !hatQuelle && "cursor-default",
        )}
        disabled={!hatQuelle}
        onClick={() => hatQuelle && onQuelleOeffnen()}
        title={
          hatQuelle
            ? "Quelle im PDF anzeigen"
            : feld.quelle?.verbatimQuote
              ? "Quelle konnte im PDF nicht lokalisiert werden"
              : undefined
        }
      >
        <span
          className={cn("label-caps text-text-muted", hatQuelle && "group-hover:text-heading")}
        >
          {label}
        </span>
        {hatQuelle && feld.quelle?.page ? (
          <span className="inline-flex items-center gap-1 text-xs text-heading">
            <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            Quelle · Seite {feld.quelle.page}
          </span>
        ) : feld.quelle?.verbatimQuote ? (
          <span className="text-xs text-text-subtle">Quelle nicht im PDF auffindbar</span>
        ) : null}
      </button>
      <Input
        value={feld.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Noch nicht ausgefüllt"
        className="bg-surface"
      />
    </div>
  );
}

function loeseSeite(
  quelle: ExposeFeldQuelle | null,
  pages: ExtractedPdfForChat["pages"] | null,
): number | null {
  if (!quelle?.verbatimQuote || !pages?.length) return quelle?.page ?? null;
  const match = findQuoteInPages(pages, quelle.verbatimQuote);
  return match?.pageNumber ?? quelle.page ?? null;
}

export function ExposeImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [dateiname, setDateiname] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [pdfMeta, setPdfMeta] = useState<ExtractedPdfForChat | null>(null);
  const [pdfSeite, setPdfSeite] = useState(1);
  const [highlight, setHighlight] = useState<HighlightState>(null);

  const [felder, setFelder] = useState<FelderState>(leereFelder);
  const [laedtPdf, setLaedtPdf] = useState(false);
  const [analysiert, setAnalysiert] = useState(false);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const quelleOeffnen = useCallback(
    (quelle: ExposeFeldQuelle | null, feldWert: string) => {
      if (!quelle?.verbatimQuote || !pdfMeta?.pages.length) return;
      const seite = loeseSeite(quelle, pdfMeta.pages);
      if (!seite) {
        toast.info("Quelle konnte im PDF nicht gefunden werden.");
        return;
      }
      setPdfSeite(seite);
      setHighlight({
        page: seite,
        quote: quelle.verbatimQuote,
        hint: feldWert.trim() || undefined,
      });
    },
    [pdfMeta],
  );

  const feldHatQuelle = useCallback(
    (id: ExposeFeldId) => {
      const quelle = felder[id].quelle;
      return Boolean(
        quelle?.verbatimQuote && pdfMeta?.pages.length && loeseSeite(quelle, pdfMeta.pages),
      );
    },
    [felder, pdfMeta],
  );

  const pdfHochladen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Bitte eine PDF-Datei wählen.");
      return;
    }

    setLaedtPdf(true);
    setAnalysiert(false);
    setFelder(leereFelder());
    setHighlight(null);
    setPdfSeite(1);

    try {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setObjectUrl(url);
      setDateiname(file.name);

      const extracted = await extractPdfForChat(file);
      setPdfMeta(extracted);
      toast.success("PDF geladen");
    } catch {
      toast.error("PDF konnte nicht gelesen werden.");
      setObjectUrl(null);
      setDateiname(null);
      setPdfMeta(null);
    } finally {
      setLaedtPdf(false);
    }
  };

  const kiAnalysieren = async () => {
    if (!pdfMeta?.modelContext) {
      toast.error("Bitte zuerst ein PDF hochladen.");
      return;
    }

    setAnalysiert(true);
    try {
      const ergebnis = await analysiereExpose({
        documentTitle: dateiname ?? "Exposé",
        modelContext: pdfMeta.modelContext,
      });

      const neu = leereFelder();
      let erkannt = 0;
      let erstesMitQuelle: { id: ExposeFeldId; quelle: ExposeFeldQuelle } | null = null;

      for (const { id, label } of EXPOSE_FELD_DEFINITIONEN) {
        const quelle = ergebnis.fields[id];
        neu[id] = { value: quelle.value ?? "", quelle };
        if (quelle.value) {
          erkannt++;
          if (!erstesMitQuelle && quelle.verbatimQuote) {
            erstesMitQuelle = { id, quelle };
          }
        }
      }

      setFelder(neu);

      if (erkannt > 0) {
        toast.success(`${erkannt} Feld${erkannt === 1 ? "" : "er"} extrahiert`);
        if (erstesMitQuelle) {
          const seite = loeseSeite(erstesMitQuelle.quelle, pdfMeta.pages);
          if (seite && erstesMitQuelle.quelle.verbatimQuote) {
            setPdfSeite(seite);
            setHighlight({
              page: seite,
              quote: erstesMitQuelle.quelle.verbatimQuote,
              hint: neu[erstesMitQuelle.id].value.trim() || undefined,
            });
          }
        }
      } else {
        toast.info("Keine Felder konnten eindeutig erkannt werden.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "KI-Analyse fehlgeschlagen");
    } finally {
      setAnalysiert(false);
    }
  };

  const exportSalesforce = () => {
    toast.info("Export nach Salesforce wird in Kürze verfügbar sein.");
  };

  const hatExtrahierteWerte = EXPOSE_FELD_IDS.some((id) => felder[id].value.trim());

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          titel="Exposé-Import"
          aktionen={
            <div className="flex flex-wrap items-center gap-2">
              <PermissionGate
                berechtigung="aktion.transaktionen.expose_import.hochladen"
                skeletonClassName="w-44"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={pdfHochladen}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="border-foreground text-foreground"
                  disabled={laedtPdf}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {laedtPdf ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  )}
                  Exposé-PDF hochladen
                </Button>
              </PermissionGate>
              {objectUrl && (
                <PermissionGate
                  berechtigung="aktion.transaktionen.expose_import.hochladen"
                  skeletonClassName="w-40"
                >
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-heading"
                    disabled={analysiert || laedtPdf}
                    onClick={kiAnalysieren}
                  >
                    {analysiert ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    )}
                    Mit KI analysieren
                  </Button>
                </PermissionGate>
              )}
              <PermissionGate
                berechtigung="aktion.transaktionen.expose_import.uebernehmen"
                skeletonClassName="w-44"
              >
                <Button
                  size="sm"
                  variant="outline"
                  className="border-foreground text-foreground"
                  disabled={!hatExtrahierteWerte}
                  onClick={exportSalesforce}
                >
                  Export to Salesforce
                </Button>
              </PermissionGate>
            </div>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-8 pt-6 pb-6 lg:flex-row lg:gap-6">
        <div className="flex h-[42vh] min-h-0 min-w-0 shrink-0 flex-col overflow-hidden lg:h-auto lg:flex-1 lg:shrink">
          <PdfSourceViewer
            objectUrl={objectUrl}
            page={pdfSeite}
            onPageChange={(p) => {
              setPdfSeite(p);
              setHighlight(null);
            }}
            pages={pdfMeta?.pages ?? null}
            pageLabels={pdfMeta?.pageLabels ?? null}
            highlight={highlight}
            title={dateiname ?? undefined}
            className="h-full min-h-0"
          />
        </div>

        <aside className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:w-[340px] lg:flex-none xl:w-[380px]">
          <div className="flex flex-col gap-4 pr-1">
            {EXPOSE_FELD_GRUPPEN.map(({ id: gruppe, label: gruppenLabel }) => {
              const kiFelder = EXPOSE_FELD_DEFINITIONEN.filter((d) => d.gruppe === gruppe);
              const systemFelder = EXPOSE_SYSTEM_FELDER.filter((d) => d.gruppe === gruppe);

              return (
                <ContentSection key={gruppe} titel={gruppenLabel}>
                  <div className="flex flex-col gap-3">
                    {kiFelder.map(({ id, label }) => (
                      <ExposeFeldZeile
                        key={id}
                        label={label}
                        feld={felder[id]}
                        onChange={(value) =>
                          setFelder((prev) => ({ ...prev, [id]: { ...prev[id], value } }))
                        }
                        onQuelleOeffnen={() => quelleOeffnen(felder[id].quelle, felder[id].value)}
                        hatQuelle={feldHatQuelle(id)}
                      />
                    ))}
                    {systemFelder.map((feld) => (
                      <ExposeSystemFeldZeile
                        key={feld.id}
                        label={feld.label}
                        wert={
                          "wert" in feld
                            ? feld.wert
                            : "autoDatum" in feld
                              ? formatHeuteDe()
                              : ""
                        }
                      />
                    ))}
                  </div>
                </ContentSection>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
