import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
import type { Objekt } from "@/types";
import { ObjektForm } from "./ObjektForm";
import { StammdatenFilter } from "./StammdatenFilter";
import { VerwaltungTabellenLeiste } from "./TabellenSuche";
import { useTabellenSuche } from "./useTabellenSuche";
import { euro, flaeche, text } from "./format";

const spalten: Column<Objekt>[] = [
  {
    key: "id",
    header: "ID",
    render: (o) => <span className="label-caps text-text-muted">{o.id}</span>,
  },
  {
    key: "bezeichnung",
    header: "Objekt",
    render: (o) => (
      <Link
        to="/verwaltung/objekte/$id"
        params={{ id: o.id }}
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-heading underline underline-offset-2"
      >
        {o.bezeichnung}
      </Link>
    ),
  },
  {
    key: "gesellschaft",
    header: "Gesellschaft",
    render: (o) => (
      <span className="text-text-muted">{o.gesellschaftName}</span>
    ),
  },
  { key: "strasse", header: "Straße", render: (o) => text(o.adresse.strasse) },
  { key: "plz", header: "PLZ", render: (o) => text(o.adresse.plz) },
  { key: "ort", header: "Ort", render: (o) => text(o.adresse.ort) },
  {
    key: "einheitenGesamt",
    header: "Einheiten",
    align: "right",
    render: (o) => o.einheitenGesamt,
  },
  {
    key: "einheitenWohnen",
    header: "Wohnen",
    align: "right",
    render: (o) => o.einheitenWohnen,
  },
  {
    key: "einheitenStellplatz",
    header: "Garage/Stellpl.",
    align: "right",
    render: (o) => o.einheitenStellplatz,
  },
  {
    key: "vermietet",
    header: "Vermietet",
    align: "right",
    render: (o) => o.einheitenVermietet,
  },
  {
    key: "leer",
    header: "Leer",
    align: "right",
    render: (o) => o.einheitenLeer,
  },
  {
    key: "flaeche",
    header: "Wohnfläche",
    align: "right",
    render: (o) => flaeche(o.wohnflaecheM2),
  },
  {
    key: "kaltmiete",
    header: "Kaltmiete mtl.",
    align: "right",
    render: (o) => euro(o.kaltmiete),
  },
  {
    key: "kaltmieteJahr",
    header: "Kaltmiete p. a.",
    align: "right",
    render: (o) => euro(o.kaltmieteJahr),
  },
  {
    key: "mieteProM2",
    header: "Ø Miete/m² Wohnen",
    align: "right",
    render: (o) => euro(o.mieteProM2Wohnen),
  },
  {
    key: "status",
    header: "Status",
    render: (o) => <StatusBadge status={o.status} />,
  },
];

const suchfelder = [
  (o: Objekt) => o.id,
  (o: Objekt) => o.bezeichnung,
  (o: Objekt) => o.gesellschaftName,
  (o: Objekt) => o.adresse.strasse,
  (o: Objekt) => o.adresse.plz,
  (o: Objekt) => o.adresse.ort,
  (o: Objekt) => o.status,
];

export function ObjektePage() {
  const { gesellschaft } = useSearch({ from: "/verwaltung/objekte" });
  const navigate = useNavigate();
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Objekt | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const [suche, setSuche] = useState("");

  const gesellschaften = useApi(() => verwaltungApi.listGesellschaften(), []);
  const { data, isLoading, isEmpty, reload } = useApi(
    () => verwaltungApi.listObjekte(gesellschaft),
    [gesellschaft],
  );
  const zeilen = useTabellenSuche(data?.items ?? [], suche, suchfelder);

  const schliessen = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten) return;
    if (!erlaubtOderHinweis("aktion.verwaltung.objekte.loeschen")) return;
    setLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteObjekt(bearbeiten.id);
      toast.success("Objekt gelöscht");
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
        titel="Objekte"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.objekte.anlegen">
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-heading"
              onClick={() => setAnlegenOffen(true)}
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neues Objekt
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <VerwaltungTabellenLeiste suchbegriff={suche} onSuchbegriffChange={setSuche}>
          <StammdatenFilter
            gesellschaften={gesellschaften.data?.items ?? []}
            gesellschaftId={gesellschaft ?? null}
            onGesellschaftChange={(id) =>
              navigate({
                to: "/verwaltung/objekte",
                search: { gesellschaft: id ?? undefined },
                replace: true,
              })
            }
          />
        </VerwaltungTabellenLeiste>
        <DataTable
          spalten={spalten}
          zeilen={zeilen}
          isLoading={isLoading}
          isEmpty={isEmpty && !suche.trim()}
          rowKey={(o) => o.id}
          emptyTitel={suche.trim() ? "Keine Treffer" : "Keine Objekte"}
          onRowClick={
            darfAktion("aktion.verwaltung.objekte.bearbeiten")
              ? (o) => setBearbeiten(o)
              : undefined
          }
        />
      </PageWrapper>

      <Dialog open={anlegenOffen} onOpenChange={setAnlegenOffen}>
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Neues Objekt</DialogTitle>
          </DialogHeader>
          {anlegenOffen ? (
            <ObjektForm
              gesellschaften={gesellschaften.data?.items ?? []}
              vorauswahlGesellschaftId={gesellschaft ?? null}
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
            <DialogTitle>Objekt bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <ObjektForm
              key={bearbeiten.id}
              objekt={bearbeiten}
              gesellschaften={gesellschaften.data?.items ?? []}
              onDone={() => {
                schliessen();
                reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.objekte.loeschen")
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
        titel="Objekt löschen"
        beschreibung={
          bearbeiten
            ? `„${bearbeiten.bezeichnung}" wird mit ${bearbeiten.einheitenGesamt} Einheiten und allen zugehörigen Mietverhältnissen gelöscht.`
            : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
