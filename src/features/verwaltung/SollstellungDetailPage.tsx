import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { KpiCard } from "@/components/shared/KpiCard";
import { LoadingState } from "@/components/shared/LoadingState";
import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApi } from "@/hooks/useApi";
import { buchhaltungApi } from "@/api/buchhaltung";
import { verwaltungApi } from "@/api/verwaltung";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { STATUS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  SollstellungPosition,
  SollstellungPositionStatus,
} from "@/types";
import { BankauszugImportDialog } from "./BankauszugImportDialog";
import { StammdatenFilter } from "./StammdatenFilter";
import { VerwaltungTabellenLeiste } from "./TabellenSuche";
import { useTabellenSuche } from "./useTabellenSuche";
import { datum, euro, monatLabel, text } from "./format";

const STATUS_FILTER: Array<{
  id: SollstellungPositionStatus | "alle";
  label: string;
}> = [
  { id: "alle", label: "Alle" },
  { id: "fehlt", label: "Fehlt" },
  { id: "teilweise", label: "Teilweise" },
  { id: "ausgeglichen", label: "OK" },
  { id: "ueberzahlung", label: "Überzahlung" },
  { id: "ohne_iban", label: "Ohne IBAN" },
];

const spalten: Column<SollstellungPosition>[] = [
  {
    key: "mieter",
    header: "Mieter",
    render: (p) => (
      <span className="font-medium text-heading">{p.mieterName}</span>
    ),
  },
  {
    key: "objekt",
    header: "Objekt",
    render: (p) => p.objektBezeichnung,
  },
  {
    key: "einheit",
    header: "Einheit",
    render: (p) => p.einheitLage,
  },
  {
    key: "gesellschaft",
    header: "Gesellschaft",
    render: (p) => text(p.gesellschaftName),
  },
  {
    key: "iban",
    header: "IBAN",
    render: (p) => text(p.iban),
  },
  {
    key: "soll",
    header: "Soll",
    align: "right",
    render: (p) => euro(p.sollBetrag),
  },
  {
    key: "ist",
    header: "Ist",
    align: "right",
    render: (p) => euro(p.istBetrag),
  },
  {
    key: "diff",
    header: "Differenz",
    align: "right",
    render: (p) => (
      <span
        className={cn(
          p.differenz > 0.009 && "text-danger",
          p.differenz < -0.009 && "text-heading",
        )}
      >
        {euro(p.differenz)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (p) => <StatusBadge status={p.status} />,
  },
];

const suchfelder = [
  (p: SollstellungPosition) => p.mieterName,
  (p: SollstellungPosition) => p.iban,
  (p: SollstellungPosition) => p.objektBezeichnung,
  (p: SollstellungPosition) => p.einheitLage,
  (p: SollstellungPosition) => p.gesellschaftName,
  (p: SollstellungPosition) => STATUS_LABEL[p.status] ?? p.status,
];

export function SollstellungDetailPage({ id }: { id: string }) {
  const navigate = useNavigate();

  const [suche, setSuche] = useState("");
  const [gesellschaftId, setGesellschaftId] = useState<string | null>(null);
  const [objektId, setObjektId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    SollstellungPositionStatus | "alle"
  >("fehlt");
  const [importOffen, setImportOffen] = useState(false);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  const [abgleichLaeuft, setAbgleichLaeuft] = useState(false);
  const [detail, setDetail] = useState<SollstellungPosition | null>(null);
  const [auszugLoeschenId, setAuszugLoeschenId] = useState<string | null>(null);

  const gesellschaften = useApi(() => verwaltungApi.listGesellschaften(), []);
  const objekte = useApi(() => verwaltungApi.listObjekte(), []);
  const lauf = useApi(() => buchhaltungApi.getSollstellungLauf(id), [id]);
  const positionen = useApi(
    () =>
      buchhaltungApi.listPositionen(id, {
        gesellschaftId,
        objektId,
        status: statusFilter === "alle" ? null : statusFilter,
      }),
    [id, gesellschaftId, objektId, statusFilter],
  );
  const bankauszuege = useApi(
    () => buchhaltungApi.listBankauszuege(id),
    [id],
  );
  const zuordnungen = useApi(
    () =>
      detail
        ? buchhaltungApi.listZuordnungen(detail.id)
        : Promise.resolve({ items: [] as never[], gesamt: 0 }),
    [detail?.id],
  );

  const zeilen = useTabellenSuche(
    positionen.data?.items ?? [],
    suche,
    suchfelder,
  );

  const reloadAlles = () => {
    lauf.reload();
    positionen.reload();
    bankauszuege.reload();
  };

  const abgleich = async () => {
    setAbgleichLaeuft(true);
    try {
      await buchhaltungApi.gleicheAb(id);
      toast.success("Abgleich aktualisiert");
      reloadAlles();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setAbgleichLaeuft(false);
    }
  };

  const loeschen = async () => {
    setLoeschenLaeuft(true);
    try {
      await buchhaltungApi.deleteSollstellungLauf(id);
      toast.success("Sollstellung gelöscht");
      void navigate({ to: "/verwaltung/sollstellung" });
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLoeschenLaeuft(false);
    }
  };

  const auszugLoeschen = async () => {
    if (!auszugLoeschenId) return;
    try {
      await buchhaltungApi.deleteBankauszug(auszugLoeschenId, id);
      toast.success("Bankauszug entfernt");
      setAuszugLoeschenId(null);
      reloadAlles();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    }
  };

  if (lauf.isLoading && !lauf.data) {
    return (
      <PageWrapper>
        <LoadingState />
      </PageWrapper>
    );
  }

  if (!lauf.data) {
    return (
      <PageWrapper>
        <EmptyState titel="Sollstellung nicht gefunden" />
      </PageWrapper>
    );
  }

  const l = lauf.data;
  const scopeLabel = l.gesellschaftName
    ? `${l.gesellschaftName}${l.gesellschaftKuerzel ? ` (${l.gesellschaftKuerzel})` : ""}`
    : "Alle Gesellschaften";

  const gesellschaftenFuerImport = l.gesellschaftId
    ? (gesellschaften.data?.items ?? []).filter((g) => g.id === l.gesellschaftId)
    : (gesellschaften.data?.items ?? []);

  return (
    <>
      <PageHeader
        titel={monatLabel(l.zeitraum)}
        beschreibung={scopeLabel}
        zensurTitel
        aktionen={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-none"
              asChild
            >
              <Link to="/verwaltung/sollstellung">
                <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Übersicht
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none border-foreground"
              onClick={() => setImportOffen(true)}
            >
              <Upload className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Bankauszug
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={() => void abgleich()}
              disabled={abgleichLaeuft}
            >
              <RefreshCw
                className={cn(
                  "mr-2 h-4 w-4",
                  abgleichLaeuft && "animate-spin",
                )}
                strokeWidth={1.5}
              />
              Abgleich
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none border-danger text-danger"
              onClick={() => setLoeschenOffen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Löschen
            </Button>
          </div>
        }
      />
      <PageWrapper>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Soll" wert={euro(l.sollSumme)} />
          <KpiCard label="Ist" wert={euro(l.istSumme)} />
          <KpiCard
            label="Differenz"
            wert={
              <span
                className={l.differenzSumme > 0.009 ? "text-danger" : undefined}
              >
                {euro(l.differenzSumme)}
              </span>
            }
          />
          <KpiCard
            label="Offen"
            wert={
              <span
                className={
                  l.anzahlFehlt + l.anzahlTeilweise > 0
                    ? "text-danger"
                    : undefined
                }
              >
                {l.anzahlFehlt + l.anzahlTeilweise}
              </span>
            }
            hilfetext={`${l.anzahlFehlt} fehlt · ${l.anzahlTeilweise} teilweise`}
          />
        </div>

        {(bankauszuege.data?.items.length ?? 0) > 0 ? (
          <div className="mb-6 border border-hairline bg-surface">
            <div className="hairline-b px-4 py-2">
              <span className="label-caps text-text-muted">Bankauszüge</span>
            </div>
            <ul>
              {(bankauszuege.data?.items ?? []).map((ba) => (
                <li
                  key={ba.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3 text-sm last:border-b-0"
                >
                  <div>
                    <span className="font-medium text-heading">
                      {ba.dateiname}
                    </span>
                    <span className="ml-2 text-text-muted">
                      {ba.gesellschaftKuerzel} · {ba.anzahlBuchungen} Buchungen
                      {ba.zeitraumVon && ba.zeitraumBis
                        ? ` · ${datum(ba.zeitraumVon)}–${datum(ba.zeitraumBis)}`
                        : ""}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none text-danger"
                    onClick={() => setAuszugLoeschenId(ba.id)}
                  >
                    Entfernen
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-1">
          {STATUS_FILTER.map((s) => {
            const count =
              s.id === "alle"
                ? l.anzahlPositionen
                : s.id === "fehlt"
                  ? l.anzahlFehlt
                  : s.id === "teilweise"
                    ? l.anzahlTeilweise
                    : s.id === "ausgeglichen"
                      ? l.anzahlAusgeglichen
                      : s.id === "ueberzahlung"
                        ? l.anzahlUeberzahlung
                        : l.anzahlOhneIban;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id)}
                className={cn(
                  "label-caps border px-3 py-1.5 text-[10px] transition-colors",
                  statusFilter === s.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-hairline bg-surface text-text-muted hover:border-foreground hover:text-foreground",
                )}
              >
                {s.label}
                <span className="ml-1.5 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <VerwaltungTabellenLeiste
          suchbegriff={suche}
          onSuchbegriffChange={setSuche}
          placeholder="Mieter, IBAN, Objekt…"
        >
          <StammdatenFilter
            gesellschaften={gesellschaften.data?.items ?? []}
            gesellschaftId={
              l.gesellschaftId ? l.gesellschaftId : gesellschaftId
            }
            onGesellschaftChange={(gid) => {
              setGesellschaftId(gid);
              setObjektId(null);
            }}
            gesellschaftFixiert={Boolean(l.gesellschaftId)}
            objekte={(objekte.data?.items ?? []).filter(
              (o) =>
                (!l.gesellschaftId || o.gesellschaftId === l.gesellschaftId) &&
                (!(l.gesellschaftId ? l.gesellschaftId : gesellschaftId) ||
                  o.gesellschaftId ===
                    (l.gesellschaftId ? l.gesellschaftId : gesellschaftId)),
            )}
            objektId={objektId}
            onObjektChange={setObjektId}
          />
        </VerwaltungTabellenLeiste>

        <DataTable
          spalten={spalten}
          zeilen={zeilen}
          isLoading={positionen.isLoading}
          isEmpty={!positionen.isLoading && zeilen.length === 0}
          rowKey={(p) => p.id}
          emptyTitel={suche.trim() ? "Keine Treffer" : "Keine Positionen"}
          onRowClick={setDetail}
        />
      </PageWrapper>

      <BankauszugImportDialog
        offen={importOffen}
        onOpenChange={setImportOffen}
        laufId={id}
        gesellschaften={gesellschaftenFuerImport}
        vorgabeGesellschaftId={l.gesellschaftId}
        onDone={reloadAlles}
      />

      <Dialog
        open={detail !== null}
        onOpenChange={(o) => !o && setDetail(null)}
      >
        <DialogContent className="max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle>{detail?.mieterName}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="grid gap-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-text-muted">Objekt</dt>
                <dd className="text-right text-heading">
                  {detail.objektBezeichnung}
                </dd>
                <dt className="text-text-muted">Einheit</dt>
                <dd className="text-right">{detail.einheitLage}</dd>
                <dt className="text-text-muted">IBAN</dt>
                <dd className="text-right font-mono text-xs">
                  {text(detail.iban)}
                </dd>
                <dt className="text-text-muted">Kaltmiete</dt>
                <dd className="text-right">{euro(detail.kaltmiete)}</dd>
                <dt className="text-text-muted">NK-Vorauszahlung</dt>
                <dd className="text-right">{euro(detail.nkVorauszahlung)}</dd>
                <dt className="text-text-muted">Soll</dt>
                <dd className="text-right font-medium text-heading">
                  {euro(detail.sollBetrag)}
                </dd>
                <dt className="text-text-muted">Ist</dt>
                <dd className="text-right">{euro(detail.istBetrag)}</dd>
                <dt className="text-text-muted">Differenz</dt>
                <dd
                  className={cn(
                    "text-right font-medium",
                    detail.differenz > 0.009 && "text-danger",
                  )}
                >
                  {euro(detail.differenz)}
                </dd>
                <dt className="text-text-muted">Status</dt>
                <dd className="text-right">
                  <StatusBadge status={detail.status} />
                </dd>
              </dl>

              <div>
                <span className="label-caps text-text-muted">
                  Zugeordnete Buchungen
                </span>
                {zuordnungen.isLoading ? (
                  <LoadingState />
                ) : (zuordnungen.data?.items.length ?? 0) === 0 ? (
                  <p className="mt-2 text-sm text-text-muted">
                    Keine Buchungen zugeordnet
                  </p>
                ) : (
                  <ul className="mt-2 divide-y border border-hairline">
                    {(zuordnungen.data?.items ?? []).map((z) => (
                      <li key={z.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <span>{datum(z.buchung.buchungsdatum)}</span>
                          <span className="font-medium text-heading">
                            {euro(z.betrag)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {z.buchung.auftraggeberName ?? "–"}
                          {z.buchung.verwendungszweck
                            ? ` · ${z.buchung.verwendungszweck}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <LoeschenDialog
        offen={loeschenOffen}
        onOpenChange={setLoeschenOffen}
        titel="Sollstellung löschen"
        beschreibung={`Die Sollstellung für ${monatLabel(l.zeitraum)} und alle zugehörigen Bankauszüge werden gelöscht.`}
        onLoeschen={loeschen}
        isLoading={loeschenLaeuft}
      />

      <LoeschenDialog
        offen={auszugLoeschenId !== null}
        onOpenChange={(o) => !o && setAuszugLoeschenId(null)}
        titel="Bankauszug entfernen"
        beschreibung="Der Bankauszug wird entfernt und der Abgleich neu berechnet."
        onLoeschen={auszugLoeschen}
      />
    </>
  );
}
