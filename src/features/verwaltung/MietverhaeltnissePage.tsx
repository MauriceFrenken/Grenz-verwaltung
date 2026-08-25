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
import type { Mietverhaeltnis } from "@/types";
import { MietverhaeltnisForm } from "./MietverhaeltnisForm";
import { StammdatenFilter } from "./StammdatenFilter";
import { VerwaltungTabellenLeiste } from "./TabellenSuche";
import { useTabellenSuche } from "./useTabellenSuche";
import { datum, euro, flaeche, NUTZUNGSART_LABEL, text } from "./format";

const spalten: Column<Mietverhaeltnis>[] = [
  {
    key: "mieter",
    header: "Mieter",
    render: (m) => (
      <span className="font-medium text-heading">{m.mieterName}</span>
    ),
  },
  {
    key: "objekt",
    header: "Objekt",
    render: (m) => (
      <Link
        to="/verwaltung/objekte/$id"
        params={{ id: m.objektId }}
        onClick={(ev) => ev.stopPropagation()}
        className="text-heading underline underline-offset-2"
      >
        {m.objektBezeichnung}
      </Link>
    ),
  },
  {
    key: "hausteil",
    header: "Hausteil / Aufgang",
    render: (m) => text(m.hausteil),
  },
  { key: "einheit", header: "Lage / Einheit", render: (m) => m.einheitLage },
  {
    key: "nutzungsart",
    header: "Nutzungsart",
    render: (m) => NUTZUNGSART_LABEL[m.nutzungsart] ?? m.nutzungsart,
  },
  {
    key: "flaeche",
    header: "Fläche",
    align: "right",
    render: (m) => flaeche(m.flaecheM2),
  },
  { key: "beginn", header: "Beginn", render: (m) => datum(m.beginn) },
  { key: "ende", header: "Ende", render: (m) => datum(m.ende) },
  {
    key: "letzteMieterhoehung",
    header: "Letzte Mieterhöhung",
    render: (m) => datum(m.letzteMieterhoehung),
  },
  {
    key: "iban",
    header: "IBAN",
    render: (m) => text(m.iban),
  },
  {
    key: "kaltmiete",
    header: "Kaltmiete",
    align: "right",
    render: (m) => euro(m.kaltmiete),
  },
  {
    key: "nk",
    header: "NK-Vorauszahlung",
    align: "right",
    render: (m) => euro(m.nkVorauszahlung),
  },
  {
    key: "mieteProM2",
    header: "Miete/m²",
    align: "right",
    render: (m) => euro(m.mieteProM2),
  },
  {
    key: "kaltmieteJahr",
    header: "Kaltmiete p. a.",
    align: "right",
    render: (m) => euro(m.kaltmieteJahr),
  },
  {
    key: "gesellschaft",
    header: "Gesellschaft",
    render: (m) => text(m.gesellschaftName),
  },
  {
    key: "status",
    header: "Status",
    render: (m) => <StatusBadge status={m.status} />,
  },
];

const suchfelder = [
  (m: Mietverhaeltnis) => m.mieterName,
  (m: Mietverhaeltnis) => m.iban,
  (m: Mietverhaeltnis) => m.objektBezeichnung,
  (m: Mietverhaeltnis) => m.hausteil,
  (m: Mietverhaeltnis) => m.einheitLage,
  (m: Mietverhaeltnis) => m.gesellschaftName,
  (m: Mietverhaeltnis) => NUTZUNGSART_LABEL[m.nutzungsart] ?? m.nutzungsart,
  (m: Mietverhaeltnis) => m.status,
];

export function MietverhaeltnissePage() {
  const { gesellschaft, objekt } = useSearch({
    from: "/verwaltung/mietverhaeltnisse",
  });
  const navigate = useNavigate({ from: "/verwaltung/mietverhaeltnisse" });
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Mietverhaeltnis | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const [suche, setSuche] = useState("");

  const gesellschaften = useApi(() => verwaltungApi.listGesellschaften(), []);
  const objekte = useApi(() => verwaltungApi.listObjekte(), []);
  const einheiten = useApi(() => verwaltungApi.listEinheiten(), []);
  const { data, isLoading, isEmpty, reload } = useApi(
    () =>
      verwaltungApi.listMietverhaeltnisse({
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
    if (!erlaubtOderHinweis("aktion.verwaltung.mietverhaeltnisse.loeschen"))
      return;
    setLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteMietverhaeltnis(bearbeiten.id);
      toast.success("Mietverhältnis gelöscht");
      schliessen();
      reload();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLoeschenLaeuft(false);
    }
  };

  const einheitenListe = (einheiten.data?.items ?? []).filter(
    (e) =>
      (!gesellschaft || e.gesellschaftId === gesellschaft) &&
      (!objekt || e.objektId === objekt),
  );

  return (
    <>
      <PageHeader
        titel="Mietverhältnisse"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.mietverhaeltnisse.anlegen">
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-heading"
              onClick={() => {
                schliessen();
                setAnlegenOffen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neues Mietverhältnis
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
            objekte={objekte.data?.items ?? []}
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
          rowKey={(m) => m.id}
          emptyTitel={suche.trim() ? "Keine Treffer" : "Keine Mietverhältnisse"}
          onRowClick={
            darfAktion("aktion.verwaltung.mietverhaeltnisse.bearbeiten")
              ? (m) => {
                  setAnlegenOffen(false);
                  setBearbeiten(m);
                }
              : undefined
          }
        />
      </PageWrapper>

      <Dialog open={anlegenOffen} onOpenChange={setAnlegenOffen}>
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Neues Mietverhältnis</DialogTitle>
          </DialogHeader>
          {anlegenOffen ? (
            <MietverhaeltnisForm
              key="anlegen"
              formId="mietverhaeltnis-anlegen"
              einheiten={einheitenListe}
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
            <DialogTitle>Mietverhältnis bearbeiten</DialogTitle>
          </DialogHeader>
          {bearbeiten ? (
            <MietverhaeltnisForm
              key={bearbeiten.id}
              formId={`mietverhaeltnis-bearbeiten-${bearbeiten.id}`}
              mietverhaeltnis={bearbeiten}
              einheiten={einheiten.data?.items ?? []}
              onDone={() => {
                schliessen();
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
        titel="Mietverhältnis löschen"
        beschreibung={
          bearbeiten
            ? `Das Mietverhältnis von ${bearbeiten.mieterName} (${bearbeiten.objektBezeichnung}, ${bearbeiten.einheitLage}) wird gelöscht.`
            : ""
        }
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />
    </>
  );
}
