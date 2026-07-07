import { useRef, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntwicklungOverlay } from "@/components/shared/EntwicklungOverlay";
import { PageWrapper, ContentSection } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { verwaltungApi } from "@/api/verwaltung";
import { useMandant } from "@/hooks/useMandant";
import { formatDate, formatEuro } from "@/lib/format";
import { toast } from "sonner";
import { NotImplementedError } from "@/lib/errors";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { Rueckstand, Zahlung } from "@/types";

const zahlungSpalten: Column<Zahlung>[] = [
  { key: "datum", header: "Datum", render: (z) => formatDate(z.datum) },
  { key: "betrag", header: "Betrag", align: "right", render: (z) => formatEuro(z.betrag) },
  { key: "zuordnung", header: "Zuordnung", render: (z) => z.mietverhaeltnisId ?? "unzugeordnet" },
  { key: "quelle", header: "Quelle", render: (z) => <StatusBadge status={z.quelle === "bankimport" ? "verbunden" : "in_pruefung"} label={z.quelle} /> },
  { key: "vwz", header: "Verwendungszweck", render: (z) => <span className="text-text-muted">{z.verwendungszweck}</span> },
];

const rueckstandSpalten: Column<Rueckstand>[] = [
  { key: "mieter", header: "Mieter", render: (r) => <span className="font-medium text-heading">{r.mieterName}</span> },
  { key: "objekt", header: "Objekt", render: (r) => r.objektId },
  { key: "offen", header: "Offener Betrag", align: "right", render: (r) => formatEuro(r.offenerBetrag) },
  { key: "seit", header: "Älteste offene Position", render: (r) => formatDate(r.aeltesteOffenePosition) },
  { key: "mahn", header: "Mahnstufe", render: (r) => <StatusBadge status={r.mahnstufe === 0 ? "offen" : "fehler"} label={`Mahnstufe ${r.mahnstufe}`} /> },
];

export function ZahlungenPage() {
  const { aktiveMandantId } = useMandant();
  const { erlaubtOderHinweis } = useAktionGuard();
  const zahlungen = useApi(
    () => verwaltungApi.listZahlungen({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );
  const rueckstaende = useApi(
    () => verwaltungApi.listRueckstaende({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );
  const [uploadOffen, setUploadOffen] = useState(false);
  const [importiert, setImportiert] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const bankimport = async () => {
    if (!erlaubtOderHinweis("aktion.buchhaltung.zahlungen.bankimport")) return;

    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Bitte eine CAMT.053-Datei auswählen.");
      return;
    }

    setImportiert(true);
    try {
      const result = await verwaltungApi.importBankauszugCamt(file);
      toast.success(`Import abgeschlossen (${result.importiert} Zahlungen)`);
      setUploadOffen(false);
      zahlungen.reload();
      rueckstaende.reload();
    } catch (err) {
      if (err instanceof NotImplementedError) {
        toast.info("Bankimport-Parser ist noch nicht angebunden.");
      } else {
        toast.error(apiFehlermeldung(err));
      }
    } finally {
      setImportiert(false);
    }
  };

  return (
    <EntwicklungOverlay>
    <>
      <PageHeader
        titel="Zahlungen & Rückstände"
        aktionen={
          <PermissionGate berechtigung="aktion.buchhaltung.zahlungen.bankimport">
            <Dialog open={uploadOffen} onOpenChange={setUploadOffen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-foreground text-foreground">
                  <Upload className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  Bankimport (CAMT.053)
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>CAMT.053 hochladen</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  <input ref={fileRef} type="file" accept=".xml" className="text-sm" />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setUploadOffen(false)} disabled={importiert}>
                      Abbrechen
                    </Button>
                    <Button
                      className="bg-primary text-primary-foreground hover:bg-heading"
                      onClick={bankimport}
                      disabled={importiert}
                    >
                      {importiert ? "Importiert…" : "Importieren"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <Tabs defaultValue="eingaenge">
          <TabsList className="border border-hairline bg-surface p-0">
            <TabsTrigger value="eingaenge">Zahlungseingänge</TabsTrigger>
            <TabsTrigger value="rueckstaende">Rückstände</TabsTrigger>
          </TabsList>
          <TabsContent value="eingaenge" className="mt-4">
            <ContentSection>
              <DataTable
                spalten={zahlungSpalten}
                zeilen={zahlungen.data?.items ?? []}
                isLoading={zahlungen.isLoading}
                isEmpty={zahlungen.isEmpty}
                rowKey={(z) => z.id}
              />
            </ContentSection>
          </TabsContent>
          <TabsContent value="rueckstaende" className="mt-4">
            <DataTable
              spalten={rueckstandSpalten}
              zeilen={rueckstaende.data?.items ?? []}
              isLoading={rueckstaende.isLoading}
              isEmpty={rueckstaende.isEmpty}
              rowKey={(r) => r.mietverhaeltnisId}
            />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
    </EntwicklungOverlay>
  );
}
