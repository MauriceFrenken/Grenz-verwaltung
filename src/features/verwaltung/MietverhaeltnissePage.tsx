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
import { formatDate, formatEuro } from "@/lib/format";
import type { Mietverhaeltnis } from "@/types";
import { MietverhaeltnisForm } from "./MietverhaeltnisForm";

const spalten: Column<Mietverhaeltnis>[] = [
  { key: "mieter", header: "Mieter", render: (m) => <span className="font-medium text-heading">{m.mieterName}</span> },
  { key: "einheit", header: "Objekt / Einheit", render: (m) => `${m.objektId} · ${m.einheitId}` },
  { key: "kalt", header: "Kaltmiete", align: "right", render: (m) => formatEuro(m.kaltmiete) },
  { key: "nk", header: "NK-Vorauszahlung", align: "right", render: (m) => formatEuro(m.nkVorauszahlung) },
  { key: "beginn", header: "Beginn", render: (m) => formatDate(m.beginn) },
  { key: "ende", header: "Ende", render: (m) => formatDate(m.ende) },
  { key: "status", header: "Status", render: (m) => <StatusBadge status={m.status} /> },
];

export function MietverhaeltnissePage() {
  const { aktiveMandantId } = useMandant();
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Mietverhaeltnis | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const { data, isLoading, isEmpty, reload } = useApi(
    () => verwaltungApi.listMietverhaeltnisse({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );

  const schliesseBearbeitung = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten || !erlaubtOderHinweis("aktion.verwaltung.mietverhaeltnisse.loeschen")) return;
    setLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteMietverhaeltnis(bearbeiten.id);
      toast.success("Mietverhältnis gelöscht");
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
        titel="Mietverhältnisse"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.mietverhaeltnisse.anlegen">
            <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-heading">
                  <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  Neues Mietverhältnis
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Neues Mietverhältnis anlegen</DialogTitle>
                </DialogHeader>
                <MietverhaeltnisForm
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
          rowKey={(m) => m.id}
          onRowClick={
            darfAktion("aktion.verwaltung.mietverhaeltnisse.bearbeiten")
              ? (m) => setBearbeiten(m)
              : undefined
          }
        />
      </PageWrapper>

      <Dialog open={bearbeiten !== null} onOpenChange={(open) => !open && schliesseBearbeitung()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mietverhältnis bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <MietverhaeltnisForm
              key={bearbeiten.id}
              mietverhaeltnis={bearbeiten}
              onDone={() => {
                schliesseBearbeitung();
                reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.mietverhaeltnisse.loeschen")
                  ? () => setLoeschenOffen(true)
                  : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <LoeschenDialog
        offen={loeschenOffen}
        onOpenChange={setLoeschenOffen}
        beschreibung={
          bearbeiten ? `Möchten Sie das Mietverhältnis mit „${bearbeiten.mieterName}" wirklich löschen?` : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
