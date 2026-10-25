import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { einstellungenApi } from "@/api/einstellungen";
import { gesellschaftenApi } from "@/api/gesellschaften";
import { gesellschaftIdsAusBenutzer } from "@/lib/auth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { ROLLEN } from "@/lib/constants";
import type { Benutzer, Gesellschaft } from "@/types";
import { BenutzerForm } from "./BenutzerForm";

function gesellschaftSpalte(b: Benutzer, gesellschaften: Gesellschaft[]) {
  const zugriff = gesellschaftIdsAusBenutzer(b);
  if (zugriff === "*") {
    return <span className="text-text-muted">Alle</span>;
  }
  const namen = zugriff
    .map((id) => gesellschaften.find((m) => m.id === id)?.kuerzel ?? id)
    .join(", ");
  return <span className="text-text-muted">{namen || "–"}</span>;
}

function spaltenFuerGesellschaften(gesellschaften: Gesellschaft[]): Column<Benutzer>[] {
  return [
    {
      key: "name",
      header: "Name",
      render: (b) => <span className="font-medium text-heading">{b.name}</span>,
    },
    { key: "email", header: "E-Mail", render: (b) => b.email },
    {
      key: "stellenbezeichnung",
      header: "Stelle",
      render: (b) =>
        b.stellenbezeichnung ? (
          b.stellenbezeichnung
        ) : (
          <span className="text-text-subtle">–</span>
        ),
    },
    {
      key: "initialen",
      header: "Initialen",
      render: (b) => <span className="label-caps text-text-muted">{b.initialen}</span>,
    },
    {
      key: "rolle",
      header: "Rolle",
      render: (b) => {
        const rolle = b.rollen[0]?.rolle;
        if (!rolle) return <span className="text-text-subtle">–</span>;
        return (
          <span className="text-text-muted">{ROLLEN[rolle]?.bezeichnung ?? rolle}</span>
        );
      },
    },
    {
      key: "gesellschaften",
      header: "Gesellschaften",
      render: (b) => gesellschaftSpalte(b, gesellschaften),
    },
  ];
}

export function BenutzerPage() {
  const { benutzer: angemeldeterBenutzer } = useAuth();
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Benutzer | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const { data, isLoading, isEmpty, reload } = useApi(() => einstellungenApi.listBenutzer(), []);
  const gesellschaften = useApi(() => gesellschaftenApi.list(), []);
  const spalten = spaltenFuerGesellschaften(gesellschaften.data ?? []);

  const schliesseBearbeitung = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten) return;
    if (bearbeiten.id === angemeldeterBenutzer?.id) {
      toast.error("Sie können Ihr eigenes Konto nicht löschen");
      return;
    }
    setLoeschenLaeuft(true);
    try {
      await einstellungenApi.deleteBenutzer(bearbeiten.id);
      toast.success("Benutzer gelöscht");
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
        titel="Benutzer"
        aktionen={
          <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-heading">
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Neuer Benutzer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl overflow-hidden">
              <DialogHeader>
                <DialogTitle>Benutzer einladen</DialogTitle>
              </DialogHeader>
              {dialogOffen ? (
                <BenutzerForm
                  onDone={() => {
                    setDialogOffen(false);
                    reload();
                  }}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        }
      />
      <PageWrapper>
        <DataTable
          spalten={spalten}
          zeilen={data?.items ?? []}
          isLoading={isLoading}
          isEmpty={isEmpty}
          rowKey={(b) => b.id}
          onRowClick={(b) => setBearbeiten(b)}
        />
      </PageWrapper>

      <Dialog open={bearbeiten !== null} onOpenChange={(open) => !open && schliesseBearbeitung()}>
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Benutzer bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <BenutzerForm
              key={bearbeiten.id}
              benutzer={bearbeiten}
              onDone={() => {
                schliesseBearbeitung();
                reload();
              }}
              onLoeschenAnfragen={
                bearbeiten.id !== angemeldeterBenutzer?.id
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
        titel="Benutzer löschen"
        beschreibung={
          bearbeiten
            ? `Möchten Sie „${bearbeiten.name}" (${bearbeiten.email}) wirklich löschen?`
            : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
