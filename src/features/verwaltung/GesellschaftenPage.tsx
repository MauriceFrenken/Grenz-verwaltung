import { useState } from "react";

import { VerwaltungTabellenLeiste } from "./TabellenSuche";
import { useTabellenSuche } from "./useTabellenSuche";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApi } from "@/hooks/useApi";
import { usePermissions } from "@/hooks/useAuth";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { verwaltungApi } from "@/api/verwaltung";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { Gesellschaft } from "@/types";
import { GesellschaftForm } from "./GesellschaftForm";
import { euro, text } from "./format";

const spalten: Column<Gesellschaft>[] = [
  {
    key: "id",
    header: "ID",
    render: (g) => <span className="label-caps text-text-muted">{g.id}</span>,
  },
  {
    key: "name",
    header: "Gesellschaft",
    render: (g) => <span className="font-medium text-heading">{g.name}</span>,
  },
  { key: "kuerzel", header: "Kürzel", render: (g) => g.kuerzel },
  {
    key: "objekte",
    header: "Objekte",
    render: (g) =>
      g.anzahlObjekte === 0 ? (
        <span className="text-text-subtle">{text(g.bemerkung)}</span>
      ) : (
        <Link
          to="/verwaltung/objekte"
          search={{ gesellschaft: g.id }}
          onClick={(e) => e.stopPropagation()}
          className="underline underline-offset-2 hover:text-heading"
        >
          {g.objekteListe}
        </Link>
      ),
  },
  {
    key: "anzahlObjekte",
    header: "Anzahl Objekte",
    align: "right",
    render: (g) => g.anzahlObjekte,
  },
  {
    key: "anzahlEinheiten",
    header: "Anzahl Einheiten",
    align: "right",
    render: (g) => g.anzahlEinheiten,
  },
  {
    key: "kaltmiete",
    header: "Kaltmiete mtl.",
    align: "right",
    render: (g) => euro(g.kaltmiete),
  },
  {
    key: "kaltmieteJahr",
    header: "Kaltmiete p. a.",
    align: "right",
    render: (g) => euro(g.kaltmieteJahr),
  },
  {
    key: "datev",
    header: "DATEV-Postfach",
    render: (g) => (
      <span className="text-text-muted">{text(g.datevPostfach)}</span>
    ),
  },
];

const suchfelder = [
  (g: Gesellschaft) => g.id,
  (g: Gesellschaft) => g.name,
  (g: Gesellschaft) => g.kuerzel,
  (g: Gesellschaft) => g.datevPostfach,
  (g: Gesellschaft) => g.objekteListe,
  (g: Gesellschaft) => g.bemerkung,
];

export function GesellschaftenPage() {
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Gesellschaft | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const [suche, setSuche] = useState("");
  const { data, isLoading, isEmpty, reload } = useApi(
    () => verwaltungApi.listGesellschaften(),
    [],
  );
  const zeilen = useTabellenSuche(data?.items ?? [], suche, suchfelder);

  const schliessen = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten) return;
    if (!erlaubtOderHinweis("aktion.verwaltung.gesellschaften.loeschen"))
      return;
    setLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteGesellschaft(bearbeiten.id);
      toast.success("Gesellschaft gelöscht");
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
        titel="Gesellschaften"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.gesellschaften.anlegen">
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-heading"
              onClick={() => setAnlegenOffen(true)}
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neue Gesellschaft
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <VerwaltungTabellenLeiste suchbegriff={suche} onSuchbegriffChange={setSuche} />
        <DataTable
          spalten={spalten}
          zeilen={zeilen}
          isLoading={isLoading}
          isEmpty={isEmpty && !suche.trim()}
          rowKey={(g) => g.id}
          emptyTitel={suche.trim() ? "Keine Treffer" : "Noch keine Gesellschaften"}
          onRowClick={
            darfAktion("aktion.verwaltung.gesellschaften.bearbeiten")
              ? (g) => setBearbeiten(g)
              : undefined
          }
        />
      </PageWrapper>

      <Dialog open={anlegenOffen} onOpenChange={setAnlegenOffen}>
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Neue Gesellschaft</DialogTitle>
          </DialogHeader>
          {anlegenOffen ? (
            <GesellschaftForm
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
            <DialogTitle>Gesellschaft bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <GesellschaftForm
              key={bearbeiten.id}
              gesellschaft={bearbeiten}
              onDone={() => {
                schliessen();
                reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.gesellschaften.loeschen")
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
        titel="Gesellschaft löschen"
        beschreibung={
          bearbeiten
            ? bearbeiten.anzahlObjekte > 0
              ? `„${bearbeiten.name}" hat ${bearbeiten.anzahlObjekte} zugeordnete Objekte. Diese müssen zuerst umgehängt oder gelöscht werden.`
              : `Möchten Sie „${bearbeiten.name}" (${bearbeiten.id}) wirklich löschen?`
            : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
