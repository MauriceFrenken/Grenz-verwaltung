import { useMemo, useState } from "react";
import { Edit3, Link2, Tags } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useApi } from "@/hooks/useApi";
import { dokumenteApi } from "@/api/dokumente";
import { einstellungenApi } from "@/api/einstellungen";
import { verwaltungApi } from "@/api/verwaltung";
import { useFilters } from "@/hooks/useFilters";
import { useMandant } from "@/hooks/useMandant";
import { formatDate } from "@/lib/format";
import type { Dokument } from "@/types";

import {
  DokumentMetadatenDialog,
  modusFuerDokument,
  type DokumentMetadatenModus,
} from "./components/DokumentMetadatenDialog";
import { KategorienDialog } from "./components/KategorienDialog";
import { OutlookPosteingang } from "./components/OutlookPosteingang";
import { OutlookVerbindungDialog } from "./components/OutlookVerbindungDialog";

export function AblagePage() {
  const { aktiveMandantId } = useMandant();
  const { filter, update } = useFilters();
  const [outlookOpen, setOutlookOpen] = useState(false);
  const [kategorienOpen, setKategorienOpen] = useState(false);
  const [bearbeitenDokument, setBearbeitenDokument] = useState<Dokument | null>(null);
  const [bearbeitenModus, setBearbeitenModus] = useState<DokumentMetadatenModus>("bearbeiten");
  const [dokumentLaden, setDokumentLaden] = useState(false);

  const { data, isLoading, isEmpty, reload } = useApi(
    () => dokumenteApi.listDokumente({ ...filter, mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId, filter.suche, filter.status],
  );

  const { data: mandantenData } = useApi(() => einstellungenApi.listMandanten(), []);
  const { data: objekteData } = useApi(() => verwaltungApi.listObjekte(), []);

  const mandantNamen = useMemo(
    () => new Map((mandantenData?.items ?? []).map((m) => [m.id, m.name])),
    [mandantenData],
  );
  const objektNamen = useMemo(
    () => new Map((objekteData?.items ?? []).map((o) => [o.id, o.bezeichnung])),
    [objekteData],
  );

  const oeffneDokument = async (opts: { id?: string; nachrichtId?: string }) => {
    setDokumentLaden(true);
    try {
      const vollstaendig = opts.id
        ? await dokumenteApi.getDokument(opts.id)
        : opts.nachrichtId
          ? await dokumenteApi.getDokumentByNachrichtId(opts.nachrichtId)
          : null;

      if (!vollstaendig) {
        toast.error(
          opts.nachrichtId
            ? "E-Mail noch nicht analysiert — bitte zuerst KI-Analyse starten."
            : "Dokument konnte nicht geladen werden",
        );
        return;
      }

      setBearbeitenModus(modusFuerDokument(vollstaendig));
      setBearbeitenDokument(vollstaendig);
    } catch {
      toast.error("Dokument konnte nicht geladen werden");
    } finally {
      setDokumentLaden(false);
    }
  };

  const spalten: Column<Dokument>[] = useMemo(
    () => [
      {
        key: "datei",
        header: "Datei",
        render: (d) => <span className="font-medium text-heading">{d.dateiname}</span>,
      },
      {
        key: "kategorie",
        header: "Kategorie",
        render: (d) => d.kategorieName ?? "–",
      },
      {
        key: "mandant",
        header: "Mandant",
        render: (d) => (d.mandantId ? (mandantNamen.get(d.mandantId) ?? d.mandantId) : "–"),
      },
      {
        key: "objekt",
        header: "Objekt",
        render: (d) => (d.objektId ? (objektNamen.get(d.objektId) ?? d.objektId) : "–"),
      },
      {
        key: "datum",
        header: "Datum",
        render: (d) => formatDate(d.datum),
      },
      {
        key: "ablage",
        header: "Ablageort (OneDrive)",
        render: (d) => <span className="text-text-muted">{d.ablageort}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (d) => <StatusBadge status={d.status} />,
      },
      {
        key: "aktion",
        header: "",
        align: "right",
        render: (d) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="E-Mail und Metadaten bearbeiten"
            onClick={(e) => {
              e.stopPropagation();
              void oeffneDokument({ id: d.id });
            }}
          >
            <Edit3 className="h-4 w-4" strokeWidth={1.5} />
            <span className="sr-only">Bearbeiten</span>
          </Button>
        ),
      },
    ],
    [mandantNamen, objektNamen],
  );

  return (
    <>
      <PageHeader
        titel="Dokumentenablage"
        aktionen={
          <div className="flex flex-wrap gap-2">
            <PermissionGate berechtigung="aktion.dokumente.outlook.verbinden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-foreground text-foreground"
                onClick={() => setOutlookOpen(true)}
                title="Outlook-Konten verbinden"
              >
                <Link2 className="h-4 w-4" strokeWidth={1.5} />
                <span className="sr-only">Outlook verbinden</span>
              </Button>
            </PermissionGate>
            <PermissionGate berechtigung="aktion.dokumente.kategorien.verwalten">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-foreground text-foreground"
                onClick={() => setKategorienOpen(true)}
                title="Kategorien verwalten"
              >
                <Tags className="h-4 w-4" strokeWidth={1.5} />
                <span className="sr-only">Kategorien</span>
              </Button>
            </PermissionGate>
          </div>
        }
      />
      <PageWrapper>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-heading">Posteingang (mit Anhang)</h2>
          <OutlookPosteingang
            onAnalyseComplete={reload}
            onNachrichtOeffnen={(nachrichtId) => void oeffneDokument({ nachrichtId })}
          />
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-heading">Abgelegte Dokumente</h2>
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Dateiname suchen"
              className="w-72"
              value={filter.suche ?? ""}
              onChange={(e) => update("suche", e.target.value)}
            />
          </div>
          <DataTable
            spalten={spalten}
            zeilen={data?.items ?? []}
            isLoading={isLoading || dokumentLaden}
            isEmpty={isEmpty}
            rowKey={(d) => d.id}
            onRowClick={(d) => void oeffneDokument({ id: d.id })}
          />
        </section>
      </PageWrapper>

      <OutlookVerbindungDialog open={outlookOpen} onOpenChange={setOutlookOpen} />
      <KategorienDialog open={kategorienOpen} onOpenChange={setKategorienOpen} />
      <DokumentMetadatenDialog
        dokument={bearbeitenDokument}
        modus={bearbeitenModus}
        open={bearbeitenDokument !== null}
        onOpenChange={(open) => {
          if (!open) setBearbeitenDokument(null);
        }}
        onSaved={reload}
      />
    </>
  );
}
