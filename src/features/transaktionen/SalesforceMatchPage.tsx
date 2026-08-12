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
  formatDetailAdresseFromTeile,
  formatObjektNameFromTeile,
  istSalesforceVerbunden,
  leseExposeSalesforceDraftPdf,
  loescheExposeSalesforceDraftPdf,
  leseExposeSalesforceDraft,
  rankObjekteByAdresse,
  resolveAdressTeile,
  salesforceFehlerText,
  salesforceSessionHintFrisch,
  salesforceSessionUebernehmen,
  type ExposeSalesforceExportDraft,
  type SalesforceObjekt,
  type SalesforceObjektMatch,
} from "@/lib/salesforce";
import type { SalesforceObjektRechte } from "@/lib/salesforce/describe";
import { exportExposeToSalesforceFn } from "@/lib/salesforce/export-fn";
import { fetchSalesforceObjekteFn } from "@/lib/salesforce/objects-fn";

const salesforceExportRoute = getRouteApi(
  "/transaktionen/expose-import/salesforce",
);

/**
 * Serverless-Requests sind auf 4,5 MB begrenzt. Größere Exposés werden ohne
 * Anhang exportiert, damit Objekt und Transaktion trotzdem entstehen.
 */
const MAX_PDF_BASE64_BYTES = 3_500_000;

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
  const detail = o.adresse && o.adresse !== o.name ? o.adresse : null;
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
      <p className="font-medium text-heading">{o.name || "Ohne Namen"}</p>
      {detail ? (
        <p className="text-sm text-text-muted">{detail}</p>
      ) : null}
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
  const [rechte, setRechte] = useState<SalesforceObjektRechte | null>(null);

  const adressTeile = resolveAdressTeile({
    objektadresse: draft?.felder.objektadresse,
    stadt: draft?.felder.stadt,
    plz: draft?.felder.plz,
  });
  const objektName = formatObjektNameFromTeile(adressTeile);
  const detailAdresse = formatDetailAdresseFromTeile(adressTeile);
  const adresse = objektName || detailAdresse;

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
          ...(await salesforceSessionHintFrisch()),
          adresse: adresse || undefined,
          mitRechten: true,
        },
      });
      salesforceSessionUebernehmen(result.erneuerteSession);
      setRechte(result.rechte ?? null);
      setKatalog(result.results);
      const empfehlungen =
        result.recommendations.length > 0
          ? result.recommendations
          : adresse
            ? rankObjekteByAdresse(result.results, adresse)
            : [];
      setRecommendations(empfehlungen);
    } catch (err) {
      const msg = salesforceFehlerText(
        err,
        "Salesforce-Abfrage fehlgeschlagen",
      );
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
        data: { ...(await salesforceSessionHintFrisch()), search: q },
      });
      salesforceSessionUebernehmen(result.erneuerteSession);
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

    if (!istSalesforceVerbunden()) {
      toast.error(
        "Nicht mit Salesforce verbunden. Bitte im Exposé-Import auf „Mit Salesforce verbinden“ klicken.",
      );
      return;
    }

    setExportModus(realEstateId ? "bestehend" : "neu");
    try {
      const pdf = leseExposeSalesforceDraftPdf(draft.id);
      const pdfBase64 = pdf ? bytesToBase64(pdf.bytes) : null;
      const pdfZuGross = Boolean(
        pdfBase64 && pdfBase64.length > MAX_PDF_BASE64_BYTES,
      );

      const result = await exportExposeToSalesforceFn({
        data: {
          ...(await salesforceSessionHintFrisch()),
          realEstateId,
          felder: draft.felder,
          pdf:
            pdf && pdfBase64 && !pdfZuGross
              ? {
                  fileName: pdf.dateiname,
                  mimeType: pdf.mimeType,
                  base64: pdfBase64,
                }
              : null,
        },
      });
      salesforceSessionUebernehmen(result.erneuerteSession);

      toast.success(
        result.mode === "update"
          ? "Objekt aktualisiert und Transaktion angelegt."
          : "Neues Objekt und Transaktion in Salesforce angelegt.",
      );

      if (result.pdfAngehaengt) {
        loescheExposeSalesforceDraftPdf(draft.id);
      } else if (pdfZuGross) {
        toast.warning(
          "Das Exposé-PDF ist zu groß für den automatischen Upload und wurde nicht angehängt. Bitte manuell in Salesforce hochladen.",
        );
      } else if (result.pdfFehler) {
        toast.warning(
          `Exposé-PDF konnte nicht angehängt werden: ${result.pdfFehler}`,
        );
      } else if (!pdf) {
        toast.info(
          "Das PDF war in dieser Sitzung nicht mehr verfügbar und wurde nicht angehängt.",
        );
      }

      void navigate({ to: "/transaktionen/expose-import" });
    } catch (err) {
      toast.error(
        salesforceFehlerText(err, "Export nach Salesforce fehlgeschlagen"),
      );
      setExportModus(null);
    }
  };

  // undefined = noch nicht geprüft, false = Salesforce verweigert das Recht
  const darfAnlegen = rechte ? rechte.createable : undefined;
  const darfAktualisieren = rechte ? rechte.updateable : undefined;

  return (
    <>
      <PageHeader
        titel="Salesforce-Export"
        aktionen={
          <>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-heading"
              disabled={
                !ausgewaehltId ||
                !draft ||
                exportModus !== null ||
                darfAktualisieren === false
              }
              title={
                darfAktualisieren === false
                  ? "Ihrem Salesforce-Benutzer fehlt das Recht „Bearbeiten“ für Objekte."
                  : undefined
              }
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
              disabled={!draft || exportModus !== null || darfAnlegen === false}
              title={
                darfAnlegen === false
                  ? "Ihrem Salesforce-Benutzer fehlt das Recht „Erstellen“ für Objekte."
                  : undefined
              }
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
            {rechte && !rechte.createable ? (
              <div className="border border-destructive/40 bg-destructive/5 px-4 py-3">
                <p className="text-sm font-medium text-heading">
                  Keine Berechtigung zum Anlegen von Objekten
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Ihr Salesforce-Benutzer darf keine Datensätze vom Typ „
                  {rechte.label}“ ({rechte.name}) anlegen. Der Salesforce-Admin
                  muss das Recht „Erstellen“ im Profil oder in einem Permission
                  Set freischalten.
                  {rechte.updateable
                    ? " Bestehende Objekte können Sie weiterhin aktualisieren."
                    : null}
                </p>
              </div>
            ) : null}

            <ContentSection titel="Objektadresse">
              <div className="flex flex-col gap-3 border border-hairline bg-surface-muted/40 px-4 py-3">
                <div>
                  <p className="label-caps text-text-muted">Salesforce-Name</p>
                  <p className="font-medium text-heading">
                    {objektName || "— nicht gesetzt —"}
                  </p>
                </div>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="label-caps text-text-muted">Straße</dt>
                    <dd className="text-sm text-heading">
                      {adressTeile.street || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="label-caps text-text-muted">Hausnummer</dt>
                    <dd className="text-sm text-heading">
                      {adressTeile.number || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="label-caps text-text-muted">PLZ</dt>
                    <dd className="text-sm text-heading">
                      {adressTeile.zip || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="label-caps text-text-muted">Stadt</dt>
                    <dd className="text-sm text-heading">
                      {adressTeile.city || "—"}
                    </dd>
                  </div>
                </dl>
                {detailAdresse ? (
                  <p className="text-xs text-text-subtle">
                    Detailadresse: {detailAdresse}
                  </p>
                ) : null}
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
