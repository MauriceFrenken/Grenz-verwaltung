import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { ContentSection, PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  attachExposePdfClient,
  filterObjekteLocal,
  formatDetailAdresseFromTeile,
  formatObjektNameFromTeile,
  istSalesforceVerbunden,
  leseExposeSalesforceDraftPdf,
  loescheExposeSalesforceDraftPdf,
  leseExposeSalesforceDraft,
  MAX_EXPOSE_PDF_BYTES,
  normalizeAddressText,
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

function cityKey(value: string | null | undefined): string {
  return normalizeAddressText(value ?? "").replace(/\s+/g, "");
}

function citiesMatchUi(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function ObjektZeile({
  o,
  selected,
  onSelect,
  exposeStadt,
}: {
  o: SalesforceObjekt | SalesforceObjektMatch;
  selected: boolean;
  onSelect: () => void;
  /** Stadt aus dem Exposé — für Hinweis, ob die Stadt passt */
  exposeStadt?: string | null;
}) {
  const stadt = o.city?.trim() || null;
  const plz = o.zip?.trim() || null;
  const ort = [plz, stadt].filter(Boolean).join(" ") || null;
  const strasse = [o.streetName, o.streetNumber].filter(Boolean).join(" ").trim();
  const detail =
    o.adresse && o.adresse !== o.name && o.adresse !== ort ? o.adresse : null;

  const exposeCityKey = cityKey(exposeStadt);
  const objektCityKey = cityKey(stadt);
  const stadtPasst =
    exposeCityKey && objektCityKey
      ? citiesMatchUi(exposeCityKey, objektCityKey)
      : null;

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
      {strasse && strasse !== o.name ? (
        <p className="text-sm text-text-muted">{strasse}</p>
      ) : detail ? (
        <p className="text-sm text-text-muted">{detail}</p>
      ) : null}
      {ort ? (
        <p
          className={cn(
            "text-sm",
            stadtPasst === true
              ? "text-heading"
              : stadtPasst === false
                ? "text-destructive"
                : "text-text-muted",
          )}
        >
          {ort}
          {stadtPasst === true ? " · Stadt stimmt" : null}
          {stadtPasst === false ? " · andere Stadt" : null}
        </p>
      ) : (
        <p className="text-sm text-text-subtle">Keine Stadt hinterlegt</p>
      )}
    </button>
  );
}

export function SalesforceMatchPage() {
  const { draft: draftId } = salesforceExportRoute.useSearch();
  const navigate = useNavigate();
  const { session } = useAuth();
  const supabaseToken = session?.access_token ?? "";

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
      const ort = {
        city: adressTeile.city || undefined,
        zip: adressTeile.zip || undefined,
      };
      const result = await fetchSalesforceObjekteFn({
        data: {
          ...(await salesforceSessionHintFrisch()),
          adresse: adresse || undefined,
          city: ort.city,
          zip: ort.zip,
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
            ? rankObjekteByAdresse(result.results, adresse, ort)
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
  }, [adresse, adressTeile.city, adressTeile.zip]);

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

  /** Exposé kam aus dem Ankauf-Postfach: Mail nach dem Export ablegen. */
  const mailAblegen = async (
    eintragId: string | null | undefined,
    result: { realEstateId: string; transactionId: string },
  ) => {
    if (!eintragId) return;
    if (!supabaseToken) {
      toast.warning("Mail konnte nicht abgelegt werden: Sitzung abgelaufen.");
      return;
    }

    try {
      const { postfachExportFn } = await import("@/lib/postfach/server-fn");
      const ablage = await postfachExportFn({
        data: {
          supabaseAccessToken: supabaseToken,
          eintragId,
          realEstateId: result.realEstateId,
          transaktionId: result.transactionId,
        },
      });
      if (!ablage.abgelegt) {
        toast.warning(
          `Mail konnte nicht in „${ablage.ordner}“ verschoben werden: ${
            ablage.fehler ?? "unbekannter Fehler"
          }`,
        );
      }
    } catch (err) {
      toast.warning(
        `Mail konnte nicht abgelegt werden: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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
      const pdfZuGross = Boolean(
        pdf && pdf.bytes.byteLength > MAX_EXPOSE_PDF_BYTES,
      );

      // Kein PDF im Server-Fn-Body (Vercel-Limit). Postfach → Graph serverseitig;
      // manuelles PDF → danach direkt Browser → Salesforce.
      const result = await exportExposeToSalesforceFn({
        data: {
          ...(await salesforceSessionHintFrisch()),
          realEstateId,
          felder: draft.felder,
          postfachEintragId: draft.postfachEintragId ?? null,
        },
      });
      salesforceSessionUebernehmen(result.erneuerteSession);

      toast.success(
        result.mode === "update"
          ? "Objekt aktualisiert und Transaktion angelegt."
          : "Neues Objekt und Transaktion in Salesforce angelegt.",
      );

      let pdfAngehaengt = result.pdfAngehaengt;
      let pdfFehler = result.pdfFehler;

      if (!pdfAngehaengt && pdf && !pdfZuGross) {
        try {
          await attachExposePdfClient({
            realEstateId: result.realEstateId,
            fileName: pdf.dateiname,
            bytes: pdf.bytes,
          });
          pdfAngehaengt = true;
          pdfFehler = undefined;
        } catch (err) {
          pdfFehler = salesforceFehlerText(
            err,
            pdfFehler ?? "PDF-Upload fehlgeschlagen",
          );
        }
      }

      if (pdfAngehaengt) {
        loescheExposeSalesforceDraftPdf(draft.id);
      } else if (pdfZuGross) {
        toast.warning(
          "Das Exposé-PDF ist größer als 40 MB und wurde nicht angehängt. Bitte manuell in Salesforce hochladen.",
        );
      } else if (pdfFehler) {
        toast.warning(
          `Exposé-PDF konnte nicht angehängt werden: ${pdfFehler}`,
        );
      } else if (!pdf && !draft.postfachEintragId) {
        toast.info(
          "Das PDF war in dieser Sitzung nicht mehr verfügbar und wurde nicht angehängt.",
        );
      }

      await mailAblegen(draft.postfachEintragId, result);

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
              <div className="border border-hairline bg-surface-muted/40 px-4 py-3">
                <p className="font-medium text-heading">
                  {objektName || "— nicht gesetzt —"}
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
                      exposeStadt={adressTeile.city}
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
                        exposeStadt={adressTeile.city}
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
