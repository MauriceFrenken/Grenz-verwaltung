import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApi } from "@/hooks/useApi";
import { verwaltungApi } from "@/api/verwaltung";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { Mieter } from "@/types";
import { MieterForm } from "./MieterForm";
import { VerwaltungTabellenLeiste } from "./TabellenSuche";
import { useTabellenSuche } from "./useTabellenSuche";
import { text } from "./format";

const spalten: Column<Mieter>[] = [
  {
    key: "name",
    header: "Name",
    render: (m) => (
      <span className="font-medium text-heading">{m.anzeigename}</span>
    ),
  },
  {
    key: "iban",
    header: "IBAN",
    render: (m) => text(m.iban),
  },
  {
    key: "mv",
    header: "Mietverhältnisse",
    align: "right",
    render: (m) => m.anzahlMietverhaeltnisse,
  },
];

const suchfelder = [
  (m: Mieter) => m.anzeigename,
  (m: Mieter) => m.iban,
  (m: Mieter) => m.bemerkung,
];

export function MieterPage() {
  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Mieter | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const [suche, setSuche] = useState("");
  const { data, isLoading, isEmpty, reload } = useApi(
    () => verwaltungApi.listMieter(),
    [],
  );
  const zeilen = useTabellenSuche(data?.items ?? [], suche, suchfelder);

  const schliessen = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten) return;
    setLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteMieter(bearbeiten.id);
      toast.success("Mieter gelöscht");
      schliessen();
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
        titel="Mieter"
        aktionen={
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-heading"
            onClick={() => {
              schliessen();
              setAnlegenOffen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Neuer Mieter
          </Button>
        }
      />
      <PageWrapper>
        <VerwaltungTabellenLeiste
          suchbegriff={suche}
          onSuchbegriffChange={setSuche}
        />
        <DataTable
          spalten={spalten}
          zeilen={zeilen}
          isLoading={isLoading}
          isEmpty={isEmpty && !suche.trim()}
          rowKey={(m) => m.id}
          emptyTitel={suche.trim() ? "Keine Treffer" : "Noch keine Mieter"}
          onRowClick={(m) => {
            setAnlegenOffen(false);
            setBearbeiten(m);
          }}
        />
      </PageWrapper>

      <Dialog open={anlegenOffen} onOpenChange={setAnlegenOffen}>
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Neuer Mieter</DialogTitle>
          </DialogHeader>
          {anlegenOffen ? (
            <MieterForm
              formId="mieter-anlegen"
              onDone={() => {
                setAnlegenOffen(false);
                reload();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={bearbeiten !== null}
        onOpenChange={(offen) => !offen && schliessen()}
      >
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Mieter bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <MieterForm
              key={bearbeiten.id}
              formId={`mieter-bearbeiten-${bearbeiten.id}`}
              mieter={bearbeiten}
              onDone={() => {
                schliessen();
                reload();
              }}
              onLoeschenAnfragen={() => setLoeschenOffen(true)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <LoeschenDialog
        offen={loeschenOffen}
        onOpenChange={setLoeschenOffen}
        titel="Mieter löschen"
        beschreibung={
          bearbeiten ? `Der Mieter ${bearbeiten.anzeigename} wird gelöscht.` : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
