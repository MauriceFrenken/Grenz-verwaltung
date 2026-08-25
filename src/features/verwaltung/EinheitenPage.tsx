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
import type { Einheit } from "@/types";
import { EinheitForm } from "./EinheitForm";
import { StammdatenFilter } from "./StammdatenFilter";
import { VerwaltungTabellenLeiste } from "./TabellenSuche";
import { useTabellenSuche } from "./useTabellenSuche";
import { datum, euro, flaeche, NUTZUNGSART_LABEL, text } from "./format";

const spalten: Column<Einheit>[] = [
  {
    key: "id",
    header: "ID",
    render: (e) => <span className="label-caps text-text-muted">{e.id}</span>,
  },
  {
    key: "objekt",
    header: "Objekt",
    render: (e) => (
      <Link
        to="/verwaltung/objekte/$id"
        params={{ id: e.objektId }}
        onClick={(ev) => ev.stopPropagation()}
        className="text-heading underline underline-offset-2"
      >
        {e.objektBezeichnung}
      </Link>
    ),
  },
  {
    key: "hausteil",
    header: "Hausteil / Aufgang",
    render: (e) => text(e.hausteil),
  },
  {
    key: "lage",
    header: "Lage / Einheit",
    render: (e) => <span className="font-medium text-heading">{e.lage}</span>,
  },
  {
    key: "nutzungsart",
    header: "Nutzungsart",
    render: (e) => NUTZUNGSART_LABEL[e.nutzungsart] ?? e.nutzungsart,
  },
  {
    key: "status",
    header: "Status",
    render: (e) => <StatusBadge status={e.status} />,
  },
  { key: "mieter", header: "Mieter", render: (e) => text(e.mieterName) },
  {
    key: "vertragsbeginn",
    header: "Vertragsbeginn",
    render: (e) => datum(e.vertragsbeginn),
  },
  {
    key: "letzteMieterhoehung",
    header: "Letzte Mieterhöhung",
    render: (e) => datum(e.letzteMieterhoehung),
  },
  {
    key: "flaeche",
    header: "Fläche",
    align: "right",
    render: (e) => flaeche(e.flaecheM2),
  },
  {
    key: "flaecheAufmass",
    header: "Fläche Aufmaß",
    align: "right",
    render: (e) => flaeche(e.flaecheAufmassM2),
  },
  {
    key: "kaltmiete",
    header: "Kaltmiete",
    align: "right",
    render: (e) => euro(e.kaltmiete),
  },
  {
    key: "nk",
    header: "NK-Vorauszahlung",
    align: "right",
    render: (e) => euro(e.nkVorauszahlung),
  },
  {
    key: "mieteProM2",
    header: "Miete/m²",
    align: "right",
    render: (e) => euro(e.mieteProM2),
  },
  {
    key: "kaltmieteJahr",
    header: "Kaltmiete p. a.",
    align: "right",
    render: (e) => euro(e.kaltmieteJahr),
  },
  {
    key: "gesellschaft",
    header: "Gesellschaft",
    render: (e) => text(e.gesellschaftName),
  },
];

const suchfelder = [
  (e: Einheit) => e.id,
  (e: Einheit) => e.objektBezeichnung,
  (e: Einheit) => e.hausteil,
  (e: Einheit) => e.lage,
  (e: Einheit) => e.mieterName,
  (e: Einheit) => e.gesellschaftName,
  (e: Einheit) => NUTZUNGSART_LABEL[e.nutzungsart] ?? e.nutzungsart,
  (e: Einheit) => e.status,
];

export function EinheitenPage() {
  const { gesellschaft, objekt } = useSearch({ from: "/verwaltung/einheiten" });
  const navigate = useNavigate({ from: "/verwaltung/einheiten" });
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Einheit | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const [suche, setSuche] = useState("");

  const gesellschaften = useApi(() => verwaltungApi.listGesellschaften(), []);
  const objekte = useApi(() => verwaltungApi.listObjekte(), []);
  const { data, isLoading, isEmpty, reload } = useApi(
    () =>
      verwaltungApi.listEinheiten({
        gesellschaftId: gesellschaft,
        objektId: objekt,
      }),
    [gesellschaft, objekt],
  );
  const zeilen = useTabellenSuche(data?.items ?? [], suche, suchfelder);

  const schliessen = () => {
    setBearbeiten(null);
    setLoeschenOffen(false);
  };

  const loeschen = async () => {
    if (!bearbeiten) return;
    if (!erlaubtOderHinweis("aktion.verwaltung.einheiten.loeschen")) return;
    setLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteEinheit(bearbeiten.id);
      toast.success("Einheit gelöscht");
      schliessen();
      reload();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLoeschenLaeuft(false);
    }
  };

  const objektListe = objekte.data?.items ?? [];

  return (
    <>
      <PageHeader
        titel="Einheiten"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.einheiten.anlegen">
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-heading"
              onClick={() => setAnlegenOffen(true)}
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neue Einheit
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
                search: { gesellschaft: id ?? undefined, objekt: undefined },
                replace: true,
              })
            }
            objekte={objektListe}
            objektId={objekt ?? null}
            onObjektChange={(id) =>
              navigate({
                search: (alt) => ({ ...alt, objekt: id ?? undefined }),
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
          rowKey={(e) => e.id}
          emptyTitel={suche.trim() ? "Keine Treffer" : "Keine Einheiten"}
          onRowClick={
            darfAktion("aktion.verwaltung.einheiten.bearbeiten")
              ? (e) => setBearbeiten(e)
              : undefined
          }
        />
      </PageWrapper>

      <Dialog open={anlegenOffen} onOpenChange={setAnlegenOffen}>
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Neue Einheit</DialogTitle>
          </DialogHeader>
          {anlegenOffen ? (
            <EinheitForm
              objekte={objektListe}
              vorauswahlObjektId={objekt ?? null}
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
            <DialogTitle>Einheit bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <EinheitForm
              key={bearbeiten.id}
              einheit={bearbeiten}
              objekte={objektListe}
              onDone={() => {
                schliessen();
                reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.einheiten.loeschen")
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
        titel="Einheit löschen"
        beschreibung={
          bearbeiten
            ? `„${bearbeiten.lage}" in ${bearbeiten.objektBezeichnung} wird mit allen Mietverhältnissen gelöscht.`
            : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
