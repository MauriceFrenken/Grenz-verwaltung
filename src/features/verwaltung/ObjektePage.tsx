import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/useApi";
import { useFilters } from "@/hooks/useFilters";
import { usePermissions } from "@/hooks/useAuth";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { verwaltungApi } from "@/api/verwaltung";
import { useMandant } from "@/hooks/useMandant";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatInt } from "@/lib/format";
import type { Objekt } from "@/types";
import { ObjektForm } from "./ObjektForm";

const spalten: Column<Objekt>[] = [
  { key: "id", header: "Objekt-ID", render: (o) => <span className="label-caps text-text-muted">{o.id}</span> },
  { key: "bezeichnung", header: "Bezeichnung", render: (o) => <span className="font-medium text-heading">{o.bezeichnung}</span> },
  {
    key: "adresse",
    header: "Adresse",
    render: (o) => `${o.adresse.strasse}, ${o.adresse.plz} ${o.adresse.ort}`,
  },
  { key: "mandant", header: "Mandant", render: (o) => o.mandantId },
  { key: "einheiten", header: "Einheiten", align: "right", render: (o) => formatInt(o.anzahlEinheiten) },
];

export function ObjektePage() {
  const { aktiveMandantId } = useMandant();
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const { filter, update } = useFilters({ mandantId: aktiveMandantId ?? undefined });
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Objekt | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const { data, isLoading, isEmpty, reload } = useApi(
    () => verwaltungApi.listObjekte({ ...filter, mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId, filter.suche],
  );

  const schliesseBearbeitung = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten || !erlaubtOderHinweis("aktion.verwaltung.objekte.loeschen")) return;
    setLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteObjekt(bearbeiten.id);
      toast.success("Objekt gelöscht");
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
        titel="Objekte"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.objekte.anlegen">
            <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-heading">
                  <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  Neues Objekt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Neues Objekt anlegen</DialogTitle>
                </DialogHeader>
                <ObjektForm
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" strokeWidth={1.5} />
            <Input
              placeholder="Objekt oder Adresse suchen"
              className="w-72 pl-9"
              value={filter.suche ?? ""}
              onChange={(e) => update("suche", e.target.value)}
            />
          </div>
        </div>
        <DataTable
          spalten={spalten}
          zeilen={data?.items ?? []}
          isLoading={isLoading}
          isEmpty={isEmpty}
          rowKey={(o) => o.id}
          onRowClick={
            darfAktion("aktion.verwaltung.objekte.bearbeiten") ? (o) => setBearbeiten(o) : undefined
          }
        />
      </PageWrapper>

      <Dialog open={bearbeiten !== null} onOpenChange={(open) => !open && schliesseBearbeitung()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Objekt bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <ObjektForm
              key={bearbeiten.id}
              objekt={bearbeiten}
              onDone={() => {
                schliesseBearbeitung();
                reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.objekte.loeschen") ? () => setLoeschenOffen(true) : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <LoeschenDialog
        offen={loeschenOffen}
        onOpenChange={setLoeschenOffen}
        beschreibung={
          bearbeiten ? `Möchten Sie „${bearbeiten.bezeichnung}" wirklich löschen?` : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
