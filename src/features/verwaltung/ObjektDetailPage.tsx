import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { KpiCard } from "@/components/shared/KpiCard";
import { LoadingState } from "@/components/shared/LoadingState";
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
import { ObjektForm } from "./ObjektForm";
import { VerwaltungTabellenLeiste } from "./TabellenSuche";
import { useTabellenSuche } from "./useTabellenSuche";
import { datum, euro, flaeche, NUTZUNGSART_LABEL, text } from "./format";

const einheitenSpalten: Column<Einheit>[] = [
  {
    key: "id",
    header: "ID",
    render: (e) => <span className="label-caps text-text-muted">{e.id}</span>,
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
    key: "flaeche",
    header: "Fläche",
    align: "right",
    render: (e) => flaeche(e.flaecheM2),
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
];

const einheitenSuchfelder = [
  (e: Einheit) => e.id,
  (e: Einheit) => e.hausteil,
  (e: Einheit) => e.lage,
  (e: Einheit) => e.mieterName,
  (e: Einheit) => NUTZUNGSART_LABEL[e.nutzungsart] ?? e.nutzungsart,
  (e: Einheit) => e.status,
];

function Stammdaten({ eintraege }: { eintraege: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border border-hairline bg-surface p-5 md:grid-cols-4">
      {eintraege.map(([label, wert]) => (
        <div key={label} className="grid gap-1">
          <dt className="label-caps text-text-muted">{label}</dt>
          <dd className="text-sm text-foreground">{wert}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ObjektDetailPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const { darfAktion } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const [objektBearbeiten, setObjektBearbeiten] = useState(false);
  const [objektLoeschen, setObjektLoeschen] = useState(false);
  const [objektLoeschenLaeuft, setObjektLoeschenLaeuft] = useState(false);
  const [einheitAnlegen, setEinheitAnlegen] = useState(false);
  const [einheitBearbeiten, setEinheitBearbeiten] = useState<Einheit | null>(
    null,
  );
  const [einheitLoeschen, setEinheitLoeschen] = useState(false);
  const [einheitLoeschenLaeuft, setEinheitLoeschenLaeuft] = useState(false);
  const [suche, setSuche] = useState("");

  const objekt = useApi(() => verwaltungApi.getObjekt(id), [id]);
  const einheiten = useApi(
    () => verwaltungApi.listEinheiten({ objektId: id }),
    [id],
  );
  const objekte = useApi(() => verwaltungApi.listObjekte(), []);
  const gesellschaften = useApi(() => verwaltungApi.listGesellschaften(), []);
  const einheitenZeilen = useTabellenSuche(
    einheiten.data?.items ?? [],
    suche,
    einheitenSuchfelder,
  );

  const o = objekt.data;

  const objektEntfernen = async () => {
    if (!o) return;
    if (!erlaubtOderHinweis("aktion.verwaltung.objekte.loeschen")) return;
    setObjektLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteObjekt(o.id);
      toast.success("Objekt gelöscht");
      navigate({ to: "/verwaltung/objekte" });
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setObjektLoeschenLaeuft(false);
    }
  };

  const einheitEntfernen = async () => {
    if (!einheitBearbeiten) return;
    if (!erlaubtOderHinweis("aktion.verwaltung.einheiten.loeschen")) return;
    setEinheitLoeschenLaeuft(true);
    try {
      await verwaltungApi.deleteEinheit(einheitBearbeiten.id);
      toast.success("Einheit gelöscht");
      setEinheitBearbeiten(null);
      setEinheitLoeschen(false);
      einheiten.reload();
      objekt.reload();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setEinheitLoeschenLaeuft(false);
    }
  };

  if (objekt.isLoading) {
    return (
      <>
        <PageHeader titel="Objekt" />
        <PageWrapper>
          <LoadingState />
        </PageWrapper>
      </>
    );
  }

  if (!o) {
    return (
      <>
        <PageHeader titel="Objekt" />
        <PageWrapper>
          <EmptyState
            titel="Objekt nicht gefunden"
            beschreibung={`Zur ID „${id}" existiert kein Objekt.`}
            aktion={
              <Button asChild variant="outline" size="sm">
                <Link to="/verwaltung/objekte">Zur Objektliste</Link>
              </Button>
            }
          />
        </PageWrapper>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titel={o.bezeichnung}
        beschreibung={`${o.adresse.strasse}, ${o.adresse.plz} ${o.adresse.ort}`}
        nebenTitel={<StatusBadge status={o.status} />}
        meta={
          <Link
            to="/verwaltung/objekte"
            search={{ gesellschaft: o.gesellschaftId }}
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
            {o.gesellschaftName}
          </Link>
        }
        aktionen={
          <>
            <PermissionGate berechtigung="aktion.verwaltung.einheiten.anlegen">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEinheitAnlegen(true)}
              >
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Neue Einheit
              </Button>
            </PermissionGate>
            <PermissionGate berechtigung="aktion.verwaltung.objekte.bearbeiten">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-heading"
                onClick={() => setObjektBearbeiten(true)}
              >
                <Pencil className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Bearbeiten
              </Button>
            </PermissionGate>
          </>
        }
      />
      <PageWrapper>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Einheiten"
            wert={o.einheitenGesamt}
            hilfetext={`${o.einheitenVermietet} vermietet · ${o.einheitenLeer} leer`}
          />
          <KpiCard
            label="Wohnfläche"
            wert={flaeche(o.wohnflaecheM2)}
            hilfetext={`${o.einheitenWohnen} Wohneinheiten · ${o.einheitenStellplatz} Garage/Stellplatz`}
          />
          <KpiCard
            label="Kaltmiete mtl."
            wert={euro(o.kaltmiete)}
            hilfetext={`${euro(o.kaltmieteJahr)} p. a.`}
          />
          <KpiCard
            label="Ø Miete/m² Wohnen"
            wert={euro(o.mieteProM2Wohnen)}
            hilfetext="Bezogen auf vermietete Wohnflächen"
          />
        </div>

        <Stammdaten
          eintraege={[
            ["Objekt-ID", o.id],
            ["Gesellschaft", o.gesellschaftName],
            ["Straße", text(o.adresse.strasse)],
            ["PLZ / Ort", `${text(o.adresse.plz)} ${o.adresse.ort}`.trim()],
            ["Quelldatei", text(o.quelldatei)],
            ["Bemerkung", text(o.bemerkung)],
          ]}
        />

        <VerwaltungTabellenLeiste suchbegriff={suche} onSuchbegriffChange={setSuche} />
        <DataTable
          spalten={einheitenSpalten}
          zeilen={einheitenZeilen}
          isLoading={einheiten.isLoading}
          isEmpty={einheiten.isEmpty && !suche.trim()}
          rowKey={(e) => e.id}
          emptyTitel={suche.trim() ? "Keine Treffer" : "Keine Einheiten"}
          onRowClick={
            darfAktion("aktion.verwaltung.einheiten.bearbeiten")
              ? (e) => setEinheitBearbeiten(e)
              : undefined
          }
        />
      </PageWrapper>

      <Dialog open={objektBearbeiten} onOpenChange={setObjektBearbeiten}>
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Objekt bearbeiten</DialogTitle>
          </DialogHeader>
          {objektBearbeiten ? (
            <ObjektForm
              objekt={o}
              gesellschaften={gesellschaften.data?.items ?? []}
              onDone={() => {
                setObjektBearbeiten(false);
                objekt.reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.objekte.loeschen")
                  ? () => setObjektLoeschen(true)
                  : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={einheitAnlegen} onOpenChange={setEinheitAnlegen}>
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Neue Einheit</DialogTitle>
          </DialogHeader>
          {einheitAnlegen ? (
            <EinheitForm
              objekte={objekte.data?.items ?? []}
              vorauswahlObjektId={o.id}
              onDone={() => {
                setEinheitAnlegen(false);
                einheiten.reload();
                objekt.reload();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={einheitBearbeiten !== null}
        onOpenChange={(offen) => !offen && setEinheitBearbeiten(null)}
      >
        <DialogContent className="max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Einheit bearbeiten</DialogTitle>
          </DialogHeader>
          {einheitBearbeiten ? (
            <EinheitForm
              key={einheitBearbeiten.id}
              einheit={einheitBearbeiten}
              objekte={objekte.data?.items ?? []}
              onDone={() => {
                setEinheitBearbeiten(null);
                einheiten.reload();
                objekt.reload();
              }}
              onLoeschenAnfragen={
                darfAktion("aktion.verwaltung.einheiten.loeschen")
                  ? () => setEinheitLoeschen(true)
                  : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <LoeschenDialog
        offen={objektLoeschen}
        onOpenChange={setObjektLoeschen}
        titel="Objekt löschen"
        beschreibung={`„${o.bezeichnung}" wird mit ${o.einheitenGesamt} Einheiten und allen zugehörigen Mietverhältnissen gelöscht.`}
        onLoeschen={objektEntfernen}
        isLoading={objektLoeschenLaeuft}
      />

      <LoeschenDialog
        offen={einheitLoeschen}
        onOpenChange={setEinheitLoeschen}
        titel="Einheit löschen"
        beschreibung={
          einheitBearbeiten
            ? `„${einheitBearbeiten.lage}" wird mit allen Mietverhältnissen gelöscht.`
            : ""
        }
        onLoeschen={einheitEntfernen}
        isLoading={einheitLoeschenLaeuft}
      />
    </>
  );
}
