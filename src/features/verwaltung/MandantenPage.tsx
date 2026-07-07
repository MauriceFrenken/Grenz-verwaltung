import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/useApi";
import { usePermissions } from "@/hooks/useAuth";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { einstellungenApi } from "@/api/einstellungen";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatInt } from "@/lib/format";
import { useMandantStore } from "@/store/mandant";
import type { Mandant } from "@/types";
import { MandantForm } from "./MandantForm";

const spalten: Column<Mandant>[] = [
  { key: "name", header: "Name", render: (g) => <span className="font-medium text-heading">{g.name}</span> },
  { key: "id", header: "Mandanten-ID", render: (g) => <span className="label-caps text-text-muted">{g.id}</span> },
  { key: "kuerzel", header: "Kürzel", render: (g) => g.kuerzel },
  { key: "objekte", header: "Objekte", align: "right", render: (g) => formatInt(g.anzahlObjekte) },
];

export function MandantenPage() {
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const setMandanten = useMandantStore((s) => s.setMandanten);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Mandant | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const { data, isLoading, isEmpty, reload } = useApi(() => einstellungenApi.listMandanten(), []);

  const schliesseBearbeitung = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten || !erlaubtOderHinweis("aktion.verwaltung.mandanten.loeschen")) return;
    setLoeschenLaeuft(true);
    try {
      await einstellungenApi.deleteMandant(bearbeiten.id);
      const { items } = await einstellungenApi.listMandanten();
      setMandanten(items);
      toast.success("Mandant gelöscht");
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
        titel="Mandanten"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.mandanten.anlegen">
            <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-heading">
                  <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  Neuer Mandant
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neuen Mandanten anlegen</DialogTitle>
                </DialogHeader>
                <MandantForm
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
          rowKey={(g) => g.id}
          onRowClick={
            darfAktion("aktion.verwaltung.mandanten.bearbeiten") ? (g) => setBearbeiten(g) : undefined
          }
        />
      </PageWrapper>

      <Dialog open={bearbeiten !== null} onOpenChange={(open) => !open && schliesseBearbeitung()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mandant bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <MandantForm
              key={bearbeiten.id}
              mandant={bearbeiten}
              onDone={() => {
                schliesseBearbeitung();
                reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.mandanten.loeschen") ? () => setLoeschenOffen(true) : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <LoeschenDialog
        offen={loeschenOffen}
        onOpenChange={setLoeschenOffen}
        beschreibung={bearbeiten ? `Möchten Sie „${bearbeiten.name}" wirklich löschen?` : ""}
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
