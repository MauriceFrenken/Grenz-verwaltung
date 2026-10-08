import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper, ContentSection } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingState } from "@/components/shared/LoadingState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi } from "@/hooks/useApi";
import { darlehenApi } from "@/api/darlehen";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { cn } from "@/lib/utils";
import type {
  Darlehen,
  DarlehenBuchung,
  DarlehenBuchungTyp,
  DarlehenHinweis,
} from "@/types";
import { VerwaltungTabellenLeiste } from "@/features/verwaltung/TabellenSuche";
import { useTabellenSuche } from "@/features/verwaltung/useTabellenSuche";
import { datum, euro, PLATZHALTER, text } from "@/features/verwaltung/format";

const ALLE = "__alle__";

const ART_LABEL: Record<Darlehen["art"], string> = {
  bank: "Bank",
  intercompany: "Intercompany",
  gesellschafter: "Gesellschafter",
  sonstige: "Sonstige",
};

const STATUS_LABEL: Record<Darlehen["status"], string> = {
  entwurf: "Entwurf",
  aktiv: "Aktiv",
  beendet: "Beendet",
  ersetzt: "Ersetzt",
};

/** Reihenfolge = Dringlichkeit in der Hinweis-Liste. */
const HINWEIS_RANG: Record<DarlehenHinweis, number> = {
  überfällig: 0,
  "bald fällig": 1,
  "Zinsbindung endet": 2,
  "vermutlich zurückgezahlt": 3,
  "Buchung prüfen": 4,
};

const BUCHUNG_TYPEN: DarlehenBuchungTyp[] = [
  "Auszahlung",
  "Rückzahlung",
  "Zinsen",
  "Tilgung",
  "unklar",
];

const PROZENT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 });

function zins(d: Darlehen): string {
  if (d.zinsPa === null) return PLATZHALTER;
  const art = d.zinsArt ? ` ${d.zinsArt}` : "";
  return `${PROZENT.format(d.zinsPa)} %${art}`;
}

function HinweisBadge({ hinweis }: { hinweis: DarlehenHinweis | null }) {
  if (!hinweis) return null;
  const dringend = hinweis === "überfällig";
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center border px-2 py-0.5 text-[10px]",
        dringend
          ? "border-danger text-danger"
          : "border-foreground bg-surface-muted",
      )}
    >
      {hinweis}
    </span>
  );
}

const spalten: Column<Darlehen>[] = [
  {
    key: "id",
    header: "ID",
    render: (d) => <span className="label-caps text-text-muted">{d.id}</span>,
  },
  {
    key: "parteien",
    header: "Geber → Nehmer",
    render: (d) => (
      <span data-op-zensur-daten="" className="font-medium text-heading">
        {d.geberName} → {d.nehmerName}
      </span>
    ),
  },
  { key: "art", header: "Art", render: (d) => ART_LABEL[d.art] },
  {
    key: "betrag",
    header: "Betrag",
    align: "right",
    render: (d) => euro(d.betrag),
  },
  {
    key: "saldo",
    header: "Saldo",
    align: "right",
    render: (d) => <span className="font-medium">{euro(d.saldoAktuell)}</span>,
  },
  { key: "zins", header: "Zins", align: "right", render: zins },
  { key: "vertrag", header: "Vertrag", render: (d) => datum(d.vertragsdatum) },
  { key: "ende", header: "Ende", render: (d) => datum(d.ende) },
  {
    key: "status",
    header: "Status",
    render: (d) => (
      <StatusBadge status={d.status} label={STATUS_LABEL[d.status]} />
    ),
  },
  {
    key: "hinweis",
    header: "Hinweis",
    render: (d) => <HinweisBadge hinweis={d.hinweis} />,
  },
];

const suchfelder = [
  (d: Darlehen) => d.id,
  (d: Darlehen) => d.geberName,
  (d: Darlehen) => d.nehmerName,
  (d: Darlehen) => d.objektBezeichnung,
];

function BankdarlehenKarte({
  d,
  onClick,
}: {
  d: Darlehen;
  onClick: () => void;
}) {
  const getilgt =
    d.betrag > 0 ? Math.min(1, Math.max(0, 1 - d.saldoAktuell / d.betrag)) : 0;
  const zeilen: [string, string][] = [
    ["Zins", zins(d)],
    ["Zinsbindung bis", datum(d.zinsbindungBis)],
    [
      d.rateMonatlich !== null ? "Rate mtl." : "Tilgung mtl.",
      euro(d.rateMonatlich ?? d.tilgungMonatlich),
    ],
    ["Zinsen lfd. Jahr", euro(d.zinsenLfdJahr)],
    ["Letzte Zinszahlung", datum(d.letzteZinszahlung)],
    ["Nicht abgerufen", euro(d.nichtAbgerufen)],
  ];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-4 border border-hairline bg-surface p-5 text-left hover:border-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="label-caps text-text-muted">{d.id}</span>
          <span data-op-zensur-daten="" className="font-semibold text-heading">
            {d.objektBezeichnung ?? d.nehmerName}
          </span>
          <span data-op-zensur-daten="" className="text-xs text-text-muted">
            {d.nehmerName} · {d.geberName}
          </span>
        </div>
        <HinweisBadge hinweis={d.hinweis} />
      </div>
      <div data-op-zensur-daten="" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tracking-tight text-heading">
            {euro(d.saldoAktuell)}
          </span>
          <span className="text-xs text-text-subtle">von {euro(d.betrag)}</span>
        </div>
        <div className="h-1.5 w-full bg-surface-muted">
          <div
            className="h-full bg-foreground"
            style={{ width: `${getilgt * 100}%` }}
          />
        </div>
        <span className="text-xs text-text-subtle">
          {Math.round(getilgt * 100)} % getilgt
          {d.saldoAm ? ` · Banksaldo vom ${datum(d.saldoAm)}` : ""}
        </span>
      </div>
      <dl data-op-zensur-daten="" className="grid grid-cols-2 gap-x-6 gap-y-2">
        {zeilen.map(([label, wert]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="label-caps text-text-muted">{label}</dt>
            <dd className="text-sm text-foreground">{wert}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}

function DarlehenDetail({ d }: { d: Darlehen }) {
  const { data, isLoading, reload } = useApi(
    () => darlehenApi.listBuchungen(d.id),
    [d.id],
  );
  const [speichert, setSpeichert] = useState<string | null>(null);

  const typAendern = async (b: DarlehenBuchung, typ: DarlehenBuchungTyp) => {
    setSpeichert(b.id);
    try {
      await darlehenApi.setBuchungTyp(b, typ);
      toast.success("Buchung aktualisiert");
      reload();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setSpeichert(null);
    }
  };

  const stamm: [string, string][] = [
    ["Geber", d.geberName],
    ["Nehmer", d.nehmerName],
    ["Objekt", text(d.objektBezeichnung)],
    ["Art", ART_LABEL[d.art]],
    ["Betrag", euro(d.betrag)],
    ["Aktueller Saldo", euro(d.saldoAktuell)],
    ["Zins", zins(d)],
    ["Zinsen p. a. (rechnerisch)", euro(d.zinsenPaRechnerisch)],
    ["Vertragsdatum", datum(d.vertragsdatum)],
    ["Ende", datum(d.ende)],
    ["Zurückgezahlt", euro(d.rueckzahlungen)],
    ["Status", STATUS_LABEL[d.status]],
  ];

  return (
    <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
      <dl
        data-op-zensur-daten=""
        className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-3"
      >
        {stamm.map(([label, wert]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="label-caps text-text-muted">{label}</dt>
            <dd className="text-sm text-foreground">{wert}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="label-caps text-text-muted">Kontobewegungen</h3>
        {isLoading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-text-subtle">
            Noch keine Bankbuchung diesem Darlehen zugeordnet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline border border-hairline">
            {data.map((b) => (
              <li
                key={b.id}
                className={cn(
                  "flex flex-col gap-1 p-3",
                  b.typ === "unklar" && "bg-surface-muted",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">{datum(b.buchungsdatum)}</span>
                  <span data-op-zensur-daten="" className="text-sm font-medium">
                    {euro(b.betrag)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    data-op-zensur-daten=""
                    className="text-xs text-text-muted"
                  >
                    {[b.auftraggeberName, b.verwendungszweck]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {b.typ === "Rate" ? (
                    <span className="text-xs">
                      Rate: Zins {euro(b.zinsAnteil)} · Tilgung{" "}
                      {euro(b.tilgungAnteil)}
                    </span>
                  ) : (
                    <Select
                      value={b.typ}
                      disabled={speichert === b.id}
                      onValueChange={(v) =>
                        typAendern(b, v as DarlehenBuchungTyp)
                      }
                    >
                      <SelectTrigger className="h-8 w-40 rounded-none text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BUCHUNG_TYPEN.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {b.zuordnung === "manuell" ? (
                  <span className="text-[10px] text-text-subtle">
                    manuell zugeordnet
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function DarlehenPage() {
  const { data, isLoading, isEmpty } = useApi(
    () => darlehenApi.listDarlehen(),
    [],
  );
  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState<string>("aktiv");
  const [gesellschaft, setGesellschaft] = useState<string>(ALLE);
  const [auswahl, setAuswahl] = useState<Darlehen | null>(null);

  const alle = useMemo(() => data?.items ?? [], [data]);
  const aktiv = alle.filter((d) => d.status === "aktiv");
  const bank = aktiv.filter((d) => d.art === "bank");
  const intern = alle.filter((d) => d.art !== "bank");

  const gesellschaften = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of intern) {
      if (d.geberId?.startsWith("G-")) m.set(d.geberId, d.geberName);
      if (d.nehmerId?.startsWith("G-")) m.set(d.nehmerId, d.nehmerName);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [intern]);

  const gefiltert = intern.filter(
    (d) =>
      (status === ALLE || d.status === status) &&
      (gesellschaft === ALLE ||
        d.geberId === gesellschaft ||
        d.nehmerId === gesellschaft),
  );
  const zeilen = useTabellenSuche(gefiltert, suche, suchfelder);

  const hinweise = alle
    .filter((d) => d.hinweis)
    .sort((a, b) => HINWEIS_RANG[a.hinweis!] - HINWEIS_RANG[b.hinweis!]);

  const summe = (liste: Darlehen[]) =>
    liste.reduce((s, d) => s + d.saldoAktuell, 0);

  return (
    <>
      <PageHeader
        titel="Darlehen"
        beschreibung="Bank- und Gruppendarlehen, automatisch abgeglichen mit den EBICS-Kontoauszügen."
      />
      <PageWrapper>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Bankdarlehen"
            wert={isLoading ? "–" : euro(summe(bank))}
            hilfetext={`${bank.length} aktive Darlehen`}
          />
          <KpiCard
            label="Interne Darlehen"
            wert={
              isLoading
                ? "–"
                : euro(summe(aktiv.filter((d) => d.art !== "bank")))
            }
            hilfetext={`${aktiv.length - bank.length} aktive Darlehen`}
          />
          <KpiCard
            label="Zinsen lfd. Jahr"
            wert={
              isLoading
                ? "–"
                : euro(alle.reduce((s, d) => s + d.zinsenLfdJahr, 0))
            }
            hilfetext="aus zugeordneten Buchungen"
          />
          <KpiCard
            label="Hinweise"
            wert={isLoading ? "–" : String(hinweise.length)}
            hilfetext="fällig, Zinsbindung, Buchungen"
          />
        </div>

        {hinweise.length > 0 ? (
          <ContentSection titel="Hinweise">
            <ul className="flex flex-col divide-y divide-hairline border border-hairline bg-surface">
              {hinweise.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setAuswahl(d)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-muted"
                  >
                    <span className="flex items-center gap-3">
                      <span className="label-caps text-text-muted">{d.id}</span>
                      <span data-op-zensur-daten="" className="text-sm">
                        {d.geberName} → {d.nehmerName}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        data-op-zensur-daten=""
                        className="text-sm text-text-muted"
                      >
                        {euro(d.saldoAktuell)}
                      </span>
                      <HinweisBadge hinweis={d.hinweis} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ContentSection>
        ) : null}

        <ContentSection titel="Bankdarlehen">
          {isLoading ? (
            <LoadingState />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {bank.map((d) => (
                <BankdarlehenKarte
                  key={d.id}
                  d={d}
                  onClick={() => setAuswahl(d)}
                />
              ))}
            </div>
          )}
        </ContentSection>

        <ContentSection titel="Interne Darlehen">
          <VerwaltungTabellenLeiste
            suchbegriff={suche}
            onSuchbegriffChange={setSuche}
          >
            <div className="grid gap-2">
              <Label
                htmlFor="filter-status"
                className="label-caps text-text-subtle"
              >
                Status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="filter-status" className="w-44 rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLE}>Alle</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([wert, label]) => (
                    <SelectItem key={wert} value={wert}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label
                htmlFor="filter-gesellschaft"
                className="label-caps text-text-subtle"
              >
                Gesellschaft
              </Label>
              <Select value={gesellschaft} onValueChange={setGesellschaft}>
                <SelectTrigger
                  id="filter-gesellschaft"
                  data-op-zensur-daten=""
                  className="w-72 rounded-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLE}>Alle Gesellschaften</SelectItem>
                  {gesellschaften.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </VerwaltungTabellenLeiste>
          <DataTable
            spalten={spalten}
            zeilen={zeilen}
            isLoading={isLoading}
            isEmpty={isEmpty || zeilen.length === 0}
            rowKey={(d) => d.id}
            emptyTitel="Keine Darlehen gefunden"
            onRowClick={setAuswahl}
            scrollX
          />
        </ContentSection>
      </PageWrapper>

      <Dialog
        open={auswahl !== null}
        onOpenChange={(offen) => !offen && setAuswahl(null)}
      >
        <DialogContent className="max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{auswahl?.id}</DialogTitle>
          </DialogHeader>
          {auswahl ? <DarlehenDetail key={auswahl.id} d={auswahl} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
