import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { ContentSection, PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  filterObjekteLocal,
  leseExposeSalesforceDraftPdf,
  loescheExposeSalesforceDraftPdf,
  leseExposeSalesforceDraft,
  rankObjekteByAdresse,
  salesforceSessionHint,
  type ExposeSalesforceExportDraft,
  type SalesforceObjekt,
  type SalesforceObjektMatch,
} from "@/lib/salesforce";
import { exportExposeToSalesforceFn } from "@/lib/salesforce/export-fn";
import { fetchSalesforceObjekteFn } from "@/lib/salesforce/objects-fn";

const salesforceExportRoute = getRouteApi(
  "/transaktionen/expose-import/salesforce",
);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function ObjektZeile({
  o,
  selected,
  onSelect,
}: {
  o: SalesforceObjekt | SalesforceObjektMatch;
  selected: boolean;
  onSelect: () => void;
}) {
  const reason = "reason" in o ? o.reason : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 border px-4 py-3 text-left transition-colors",
        selected
          ? "border-foreground bg-surface-muted"
          : "border-hairline bg-surface hover:border-foreground/40",
      )}
    >
      <p className="font-medium text-heading">{o.adresse || "Ohne Adresse"}</p>
      <p className="text-sm text-text-muted">
        {o.name}
        {o.city ? ` · ${o.city}` : ""}
        {o.zip ? ` · ${o.zip}` : ""}
      </p>
      {reason ? <p className="text-xs text-text-subtle">{reason}</p> : null}
    </button>
  );
}

export function SalesforceMatchPage() {
  const { draft: draftId } = salesforceExportRoute.useSearch();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ExposeSalesforceExportDraft | null>(null);

  const [laedt, setLaedt] = useState(false);
  const [exportModus, setExportModus] = useState<"bestehend" | "neu" | null>(
    null,
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const [katalog, setKatalog] = useState<SalesforceObjekt[]>([]);
  const [recommendations, setRecommendations] = useState<
    SalesforceObjektMatch[]
  >([]);
  const [suche, setSuche] = useState("");
  const [sucheAktiv, setSucheAktiv] = useState(false);
  const [remoteSuche, setRemoteSuche] = useState<SalesforceObjekt[] | null>(
    null,
  );
  const [ausgewaehltId, setAusgewaehltId] = useState<string | null>(null);

  const adresse = draft?.felder.objektadresse?.trim() ?? "";

  useEffect(() => {
    if (!draftId) {
      setDraft(null);
      return;
    }
    const gelesen = leseExposeSalesforceDraft(draftId);
    setDraft(gelesen);
    if (!gelesen) {
      toast.error(
        "Export-Daten nicht gefunden. Bitte erneut vom Exposé-Import starten.",
      );
      return;
    }
    if (gelesen.dateiname && !leseExposeSalesforceDraftPdf(gelesen.id)) {
      toast.info(
        "PDF nicht mehr im Speicher. Der Export funktioniert, aber ohne Exposé-Anhang.",
      );
    }
  }, [draftId]);

  const ladenKatalog = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const result = await fetchSalesforceObjekteFn({
        data: {
          ...salesforceSessionHint(),
          adresse: adresse || undefined,
        },
      });
      setKatalog(result.results);
      const empfehlungen =
        result.recommendations.length > 0
          ? result.recommendations
          : adresse
            ? rankObjekteByAdresse(result.results, adresse)
            : [];
      setRecommendations(empfehlungen);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Salesforce-Abfrage fehlgeschlagen";
      setFehler(msg);
      toast.error(msg);
    } finally {
      setLaedt(false);
    }
  }, [adresse]);

  useEffect(() => {
    if (!draft) return;
    void ladenKatalog();
  }, [draft, ladenKatalog]);

  const suchErgebnisse = useMemo(() => {
    if (!sucheAktiv || !suche.trim()) return [];
    if (remoteSuche) return remoteSuche;
    return filterObjekteLocal(katalog, suche).slice(0, 40);
  }, [katalog, remoteSuche, suche, sucheAktiv]);

  const onSuche = async () => {
    setAusgewaehltId(null);
    const q = suche.trim();

    if (!q) {
      setSucheAktiv(false);
      setRemoteSuche(null);
      return;
    }

    if (q.length < 2) {
      setSucheAktiv(false);
      setRemoteSuche(null);
      toast.info("Bitte mindestens 2 Zeichen eingeben.");
      return;
    }

    setSucheAktiv(true);
    setLaedt(true);
    try {
      const result = await fetchSalesforceObjekteFn({
        data: { ...salesforceSessionHint(), search: q },
      });
      const lokal = filterObjekteLocal(katalog, q);
      const byId = new Map<string, SalesforceObjekt>();
      for (const o of [...result.results, ...lokal]) byId.set(o.id, o);
      setRemoteSuche([...byId.values()].slice(0, 40));
    } catch {
      setRemoteSuche(filterObjekteLocal(katalog, q).slice(0, 40));
    } finally {
      setLaedt(false);
    }
  };

  const exportieren = async (realEstateId: string | null) => {
    if (!draft || exportModus) return;
    setExportModus(realEstateId ? "bestehend" : "neu");
    try {
      const pdf = leseExposeSalesforceDraftPdf(draft.id);
      const result = await exportExposeToSalesforceFn({
        data: {
          ...salesforceSessionHint(),
          realEstateId,
          felder: draft.felder,
          pdf: pdf
            ? {
                fileName: pdf.dateiname,
                mimeType: pdf.mimeType,
                base64: bytesToBase64(pdf.bytes),
              }
            : null,
        },
      });
      if (!pdf) {
        toast.info(
          "Objekt wurde exportiert. Das PDF war in dieser Sitzung nicht mehr verfügbar.",
        );
      } else {
        loescheExposeSalesforceDraftPdf(draft.id);
      }
      toast.success(
        result.mode === "update"
          ? "Objekt aktualisiert, Transaktion angelegt und Exposé hinterlegt."
          : "Neues Objekt, Transaktion und Exposé in Salesforce angelegt.",
      );
      void navigate({ to: "/transaktionen/expose-import" });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Export nach Salesforce fehlgeschlagen";
      toast.error(msg);
      setExportModus(null);
    }
  };

  return (
    <>
      <PageHeader
        titel="Salesforce-Export"
        aktionen={
          <>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-heading"
              disabled={!ausgewaehltId || !draft || exportModus !== null}
              onClick={() => void exportieren(ausgewaehltId)}
            >
              {exportModus === "bestehend" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Ausgewähltes Objekt
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-foreground text-foreground"
              disabled={!draft || exportModus !== null}
              onClick={() => void exportieren(null)}
            >
              {exportModus === "neu" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              )}
              Neues Objekt
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-foreground text-foreground"
              asChild
            >
              <Link to="/transaktionen/expose-import">Zurück zum Exposé</Link>
            </Button>
          </>
        }
      />

      <PageWrapper>
        {!draftId || !draft ? (
          <p className="text-sm text-text-muted">
            Kein Exposé-Export geladen. Bitte starten Sie den Export erneut über
            „Export to Salesforce“ im Exposé-Import.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            <ContentSection titel="Objektadresse">
              <div className="border border-hairline bg-surface-muted/40 px-4 py-3">
                <p className="font-medium text-heading">
                  {adresse || "— nicht gesetzt —"}
                </p>
              </div>
            </ContentSection>

            <ContentSection
              titel="Empfohlene Objekte"
              aktion={
                laedt && !sucheAktiv ? (
                  <span className="inline-flex items-center gap-2 text-xs text-text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Suche…
                  </span>
                ) : null
              }
            >
              {fehler ? (
                <p className="text-sm text-destructive">{fehler}</p>
              ) : null}
              {!laedt && !fehler && recommendations.length === 0 ? (
                <p className="text-sm text-text-muted">
                  Kein passendes Objekt gefunden.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {recommendations.slice(0, 8).map((o) => (
                    <ObjektZeile
                      key={o.id}
                      o={o}
                      selected={ausgewaehltId === o.id}
                      onSelect={() => setAusgewaehltId(o.id)}
                    />
                  ))}
                </div>
              )}
            </ContentSection>

            <ContentSection titel="Anderes Objekt suchen">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-subtle"
                    strokeWidth={1.5}
                  />
                  <Input
                    value={suche}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSuche(value);
                      if (!value.trim()) {
                        setSucheAktiv(false);
                        setRemoteSuche(null);
                      } else {
                        setRemoteSuche(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onSuche();
                    }}
                    placeholder="Adresse, Name, Stadt oder PLZ…"
                    className="pl-9"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-foreground text-foreground"
                  disabled={laedt || exportModus !== null}
                  onClick={() => void onSuche()}
                >
                  Suchen
                </Button>
              </div>
              {sucheAktiv && suche.trim() ? (
                <div className="mt-3 flex flex-col gap-2">
                  {laedt ? (
                    <p className="inline-flex items-center gap-2 text-sm text-text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Suche…
                    </p>
                  ) : suchErgebnisse.length === 0 ? (
                    <p className="text-sm text-text-muted">Keine Treffer.</p>
                  ) : (
                    suchErgebnisse.map((o) => (
                      <ObjektZeile
                        key={o.id}
                        o={o}
                        selected={ausgewaehltId === o.id}
                        onSelect={() => setAusgewaehltId(o.id)}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </ContentSection>
          </div>
        )}
      </PageWrapper>
    </>
  );
}
