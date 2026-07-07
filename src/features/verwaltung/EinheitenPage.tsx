import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/useApi";
import { usePermissions } from "@/hooks/useAuth";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { verwaltungApi } from "@/api/verwaltung";
import { useMandant } from "@/hooks/useMandant";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatFlaeche } from "@/lib/format";
import type { Einheit } from "@/types";
import { EinheitForm } from "./EinheitForm";

const spalten: Column<Einheit>[] = [
  { key: "id", header: "Einheit-ID", render: (e) => <span className="label-caps text-text-muted">{e.id}</span> },
  { key: "objekt", header: "Objekt", render: (e) => e.objektId },
  { key: "lage", header: "Lage / Nr.", render: (e) => e.lage },
  { key: "flaeche", header: "Fläche", align: "right", render: (e) => formatFlaeche(e.flaecheM2) },
  {
    key: "mv",
    header: "Mieter",
    render: (e) =>
      e.aktuellesMietverhaeltnisMieterName ? (
        <span className="font-medium text-heading">{e.aktuellesMietverhaeltnisMieterName}</span>
      ) : (
        "–"
      ),
  },
  { key: "status", header: "Status", render: (e) => <StatusBadge status={e.status} /> },
];

export function EinheitenPage() {
  const { aktiveMandantId } = useMandant();
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Einheit | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const { data, isLoading, isEmpty, reload } = useApi(
    () => verwaltungApi.listEinheiten({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );

  const schliesseBearbeitung = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten || !erlaubtOderHinweis("aktion.verwaltung.einheiten.loeschen")) return;
    setLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteEinheit(bearbeiten.id);
      toast.success("Einheit gelöscht");
      schliesseBearbeitung();
      reload();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLoeschenLaeuft(false);
    }
  };

  return (
    <>
      <PageHeader
        titel="Einheiten"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.einheiten.anlegen">
            <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-heading">
                  <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  Neue Einheit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Neue Einheit anlegen</DialogTitle>
                </DialogHeader>
                <EinheitForm
                  onDone={() => {
                    setDialogOffen(false);
                    reload();
                  }}
                />
              </DialogContent>
            </Dialog>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <DataTable
          spalten={spalten}
          zeilen={data?.items ?? []}
          isLoading={isLoading}
          isEmpty={isEmpty}
          rowKey={(e) => e.id}
          onRowClick={
            darfAktion("aktion.verwaltung.einheiten.bearbeiten") ? (e) => setBearbeiten(e) : undefined
          }
        />
      </PageWrapper>

      <Dialog open={bearbeiten !== null} onOpenChange={(open) => !open && schliesseBearbeitung()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Einheit bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <EinheitForm
              key={bearbeiten.id}
              einheit={bearbeiten}
              onDone={() => {
                schliesseBearbeitung();
                reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.einheiten.loeschen") ? () => setLoeschenOffen(true) : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <LoeschenDialog
        offen={loeschenOffen}
        onOpenChange={setLoeschenOffen}
        beschreibung={
          bearbeiten
            ? `Möchten Sie die Einheit „${bearbeiten.lage}" (${bearbeiten.id}) wirklich löschen?`
            : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
