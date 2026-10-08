import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { Knopf } from "@/components/board/Knopf";
import { KpiKarte } from "@/components/board/KpiKarte";
import {
  Abschnitt,
  Kennzahlen,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt, StatusBadge } from "@/components/board/Status";
import type { BoardDaten } from "@/lib/db/typen";
import {
  datum,
  dezimal,
  euro,
  euroKompakt,
  flaeche,
  prozent,
} from "@/lib/format/de";
import { boardRepository } from "@/lib/db/config";
import {
  PHASE_LABEL,
  RESERVIERUNG_LABEL,
  type AnkaufPhase,
  type CrmDaten,
  type Expose,
} from "@/lib/db/transaktionen";
import { salesforceLink } from "@/lib/integrations/salesforce";
import { cn } from "@/lib/utils";
import { useDarlehenAuswertung } from "@/modules/darlehen/useDarlehen";
import { useImmobilienAuswertung } from "@/modules/immobilien/useImmobilien";
import {
  kreisReihe,
  tragbaresEk,
  type LiquiditaetsAuswertung,
} from "@/modules/liquiditaet/logik/liquiditaet";
import { useLiquiditaetAuswertung } from "@/modules/liquiditaet/useLiquiditaet";
import {
  BOARD_DATEN_KEY,
  useBoardDaten,
  useGesellschaftsFilter,
} from "@/modules/shell/daten";
import {
  AKTIVE_PHASEN,
  ankaufKennzahlen,
  ekBedarfAbAngebot,
  einheitenVertrieb,
  naechstePhase,
  pipelineSummen,
  WAHRSCHEINLICHKEIT,
  type AnkaufKennzahlen,
  type EinheitVertrieb,
} from "./logik/transaktionen";
import { useCrmDaten } from "./useCrm";

type Reiter = "ankauf" | "eingang" | "abverkauf";

export function TransaktionenSeite() {
  const { data, isLoading, error } = useBoardDaten();
  const crm = useCrmDaten(data);
  const darlehen = useDarlehenAuswertung(data);
  const immobilien = useImmobilienAuswertung(data, darlehen);
  const { basis: liquiditaet } = useLiquiditaetAuswertung(
    data,
    darlehen,
    immobilien,
  );
  const filter = useGesellschaftsFilter();
  const search = useSearch({ from: "/board/transaktionen" });
  const navigate = useNavigate({ from: "/board/transaktionen" });
  const [reiter, setReiter] = useState<Reiter>("ankauf");

  if (error)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Transaktionen nicht verfügbar"
        text={(error as Error).message}
      />
    );
  if (isLoading || !data || !crm.data || !liquiditaet) return <SeitenSkelett />;

  const stichtag = data.stichtag;
  const kennzahlen = crm.data.ankaeufe
    .filter((a) => filter.passt(a.zielGesellschaftId))
    .map((a) => ankaufKennzahlen(a, stichtag));
  const aktiv = kennzahlen.filter((k) =>
    AKTIVE_PHASEN.includes(k.ankauf.phase),
  );
  const summen = pipelineSummen(kennzahlen);
  const ekBedarf = ekBedarfAbAngebot(kennzahlen);
  const faktoren = aktiv
    .map((k) => k.faktor)
    .filter((f): f is number => f !== null);
  const stockend = aktiv.filter((k) => k.ampel !== "gruen");
  const tragbarHeute = tragbaresEk(
    kreisReihe(liquiditaet.verlauf, liquiditaet.freieIds),
    stichtag,
    liquiditaet.mindestFrei,
  );
  const offen = search.ankauf
    ? kennzahlen.find((k) => k.ankauf.id === search.ankauf)
    : undefined;
  const oeffne = (id: string | undefined) =>
    navigate({ search: { ankauf: id }, replace: true, resetScroll: false });

  return (
    <>
      <SeitenKopf
        titel="Transaktionen"
        unterzeile={`Immobilien: Ankauf vom Exposé bis zum Notar, Verkauf von Objekten und Einheiten${data.quelle === "mock" ? " · Musterdaten" : ""}`}
      />

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiKarte
          label="Pipeline-Volumen"
          wert={euroKompakt(
            aktiv.reduce((s, k) => s + k.ankauf.angebotspreis, 0),
          )}
          hinweis={`${aktiv.length} aktive Deals`}
        />
        <KpiKarte
          label="Gewichtet"
          wert={euroKompakt(aktiv.reduce((s, k) => s + k.gewichtet, 0))}
          hinweis="nach Phasen-Wahrscheinlichkeit"
        />
        <KpiKarte
          label="EK-Bedarf ab Angebot"
          wert={euroKompakt(ekBedarf)}
          hinweis={`tragbar heute ${euroKompakt(tragbarHeute)}`}
          ampel={
            ekBedarf > tragbarHeute
              ? "rot"
              : ekBedarf > 0.7 * tragbarHeute
                ? "gelb"
                : "gruen"
          }
        />
        <KpiKarte
          label="Ø Kaufpreisfaktor"
          wert={
            faktoren.length
              ? `${dezimal(faktoren.reduce((s, f) => s + f, 0) / faktoren.length, 1)}-fach`
              : "–"
          }
          hinweis="aktive Deals, Preis / Jahresnettokaltmiete"
        />
        <KpiKarte
          label="Stockende Deals"
          wert={String(stockend.length)}
          hinweis={`länger als 30 Tage in einer Phase`}
          ampel={
            stockend.some((k) => k.ampel === "rot")
              ? "rot"
              : stockend.length
                ? "gelb"
                : "gruen"
          }
        />
      </div>

      <div className="mb-4">
        <Segmente
          label="Ansicht"
          wert={reiter}
          onChange={setReiter}
          optionen={[
            { wert: "ankauf", label: "Ankauf" },
            {
              wert: "eingang",
              label: `Exposé-Eingang (${crm.data.exposes.filter((e) => !e.ankaufId).length})`,
            },
            { wert: "abverkauf", label: "Verkauf" },
          ]}
        />
      </div>

      {reiter === "ankauf" ? (
        <>
          <div className="-mx-1 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3 px-1">
              {AKTIVE_PHASEN.map((phase) => {
                const s = summen.find((x) => x.phase === phase)!;
                const karten = kennzahlen.filter(
                  (k) => k.ankauf.phase === phase,
                );
                return (
                  <section
                    key={phase}
                    aria-label={PHASE_LABEL[phase]}
                    className="w-[248px] shrink-0"
                  >
                    <header className="mb-2 flex items-baseline justify-between px-1">
                      <h2 className="text-[13px] font-semibold text-heading">
                        {PHASE_LABEL[phase]}{" "}
                        <span className="font-normal text-text-muted">
                          {s.anzahl}
                        </span>
                      </h2>
                      <span className="text-xs tabular-nums text-text-muted">
                        {s.volumen ? euroKompakt(s.volumen) : ""}
                      </span>
                    </header>
                    <div className="min-h-[120px] space-y-2 rounded-[10px] bg-surface-muted/60 p-2">
                      {karten.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-text-subtle">
                          keine Deals
                        </p>
                      ) : null}
                      {karten.map((k) => (
                        <DealKarte
                          key={k.ankauf.id}
                          k={k}
                          aktiv={search.ankauf === k.ankauf.id}
                          onClick={() => oeffne(k.ankauf.id)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Abgeschlossen: {summen.find((s) => s.phase === "gekauft")!.anzahl}{" "}
            gekauft (
            {euroKompakt(summen.find((s) => s.phase === "gekauft")!.volumen)}),{" "}
            {summen.find((s) => s.phase === "abgesagt")!.anzahl} abgesagt.
            Wahrscheinlichkeiten je Phase:{" "}
            {AKTIVE_PHASEN.map(
              (p) => `${PHASE_LABEL[p]} ${prozent(WAHRSCHEINLICHKEIT[p], 0)}`,
            ).join(", ")}
            .
          </p>
        </>
      ) : reiter === "eingang" ? (
        <ExposeEingang
          exposes={crm.data.exposes}
          onUebernommen={(id) => {
            setReiter("ankauf");
            oeffne(id);
          }}
        />
      ) : (
        <Abverkauf daten={data} crm={crm.data} filter={filter.passt} />
      )}

      <AnkaufDetail
        k={offen}
        daten={data}
        crm={crm.data}
        liquiditaet={liquiditaet}
        onSchliessen={() => oeffne(undefined)}
      />
    </>
  );
}

function DealKarte({
  k,
  aktiv,
  onClick,
}: {
  k: AnkaufKennzahlen;
  aktiv: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full cursor-pointer rounded-[8px] border border-hairline bg-surface p-3 text-left shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150 hover:border-input hover:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08)]",
        aktiv && "border-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-heading">
            {k.ankauf.name}
          </div>
          <div className="truncate text-xs text-text-muted">
            {[
              k.ankauf.ort,
              k.ankauf.einheiten != null ? `${k.ankauf.einheiten} WE` : null,
              k.ankauf.flaeche ? flaeche(k.ankauf.flaeche) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <AmpelPunkt ampel={k.ampel} label={`${k.tageInPhase} Tage in Phase`} />
      </div>
      <div className="mt-2 flex items-baseline justify-between text-sm tabular-nums">
        <span className="font-medium">
          {k.ankauf.angebotspreis
            ? euroKompakt(k.ankauf.angebotspreis)
            : "Preis offen"}
        </span>
        <span className="text-xs text-text-muted">
          {k.faktor ? `${dezimal(k.faktor, 1)}-fach` : "–"}
        </span>
      </div>
      <div className="mt-1.5 line-clamp-2 text-xs text-text-muted">
        {k.ankauf.naechsterSchritt || "Nächster Schritt fehlt"}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-text-subtle">
        <span>
          {k.ankauf.strategie === "aufteiler"
            ? "Aufteiler"
            : k.ankauf.strategie === "gewerbe"
              ? "Gewerbe"
              : "Bestand"}
        </span>
        <span
          className={cn(
            k.ampel === "rot" && "text-bad",
            k.ampel === "gelb" && "text-warn",
          )}
        >
          {k.tageInPhase} Tage
        </span>
      </div>
    </button>
  );
}

function AnkaufDetail({
  k,
  daten,
  crm,
  liquiditaet,
  onSchliessen,
}: {
  k: AnkaufKennzahlen | undefined;
  daten: BoardDaten;
  crm: CrmDaten;
  liquiditaet: LiquiditaetsAuswertung;
  onSchliessen: () => void;
}) {
  const qc = useQueryClient();
  const a = k?.ankauf;
  const ziel = daten.companies.find((c) => c.id === a?.zielGesellschaftId);
  const ekTag = a?.notartermin ?? daten.stichtag;
  const tragbar = a
    ? tragbaresEk(
        kreisReihe(liquiditaet.verlauf, liquiditaet.freieIds),
        ekTag > daten.stichtag ? ekTag : daten.stichtag,
        liquiditaet.mindestFrei,
      )
    : 0;
  const weiter = a ? naechstePhase(a.phase) : null;

  const phaseSetzen = async (phase: AnkaufPhase) => {
    if (!a) return;
    try {
      await boardRepository().ankaufStufeSetzen(a.id, phase);
      await qc.invalidateQueries({ queryKey: BOARD_DATEN_KEY });
      toast.success(`${a.name}: ${PHASE_LABEL[phase]}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <DetailPanel
      offen={Boolean(k)}
      onSchliessen={onSchliessen}
      breite="lg"
      titel={a ? a.name : ""}
      unterzeile={
        a
          ? [
              a.strasse,
              a.ort,
              a.verantwortlich ? `verantwortlich ${a.verantwortlich}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      kopfzeile={
        k && a ? (
          <StatusBadge ampel={k.ampel === "grau" ? "akzent" : k.ampel}>
            {PHASE_LABEL[a.phase]} · {k.tageInPhase} Tage
          </StatusBadge>
        ) : null
      }
    >
      {k && a ? (
        <>
          <PanelAbschnitt titel="Kennzahlen">
            <Kennzahlen
              spalten={3}
              eintraege={[
                {
                  label: "Angebotspreis",
                  wert: a.angebotspreis ? euro(a.angebotspreis) : "offen",
                  hervorheben: true,
                },
                {
                  label: "Preis je m²",
                  wert: k.preisJeQm ? euro(Math.round(k.preisJeQm)) : "–",
                },
                {
                  label: "Jahresnettokaltmiete",
                  wert:
                    a.jahresnettokaltmiete != null
                      ? euro(a.jahresnettokaltmiete)
                      : "–",
                },
                {
                  label: "Kaufpreisfaktor",
                  wert: k.faktor ? `${dezimal(k.faktor, 1)}-fach` : "–",
                },
                {
                  label: "Bruttorendite",
                  wert: k.bruttoRendite ? prozent(k.bruttoRendite, 2) : "–",
                },
                {
                  label: "Gesamtinvest inkl. NK",
                  wert: euro(Math.round(k.gesamtInvest)),
                },
                {
                  label: "EK-Bedarf",
                  wert: `${euro(Math.round(k.ekBedarf))} (${prozent(a.ekQuote, 0)}${a.ekQuoteGesetzt ? "" : ", angenommen"})`,
                },
                { label: "Zielgesellschaft", wert: ziel?.name ?? "–" },
                { label: "Makler", wert: a.makler ?? "ohne Makler" },
              ]}
            />
          </PanelAbschnitt>

          <PanelAbschnitt titel="Passt das Eigenkapital?">
            <div
              className={cn(
                "rounded-[8px] border p-3 text-sm",
                k.ekBedarf <= tragbar
                  ? "border-ok/40 bg-ok-soft"
                  : "border-bad/40 bg-bad-soft",
              )}
            >
              <div className="font-medium text-heading">
                {k.ekBedarf <= tragbar ? "Tragbar" : "Nicht tragbar"}:{" "}
                {euro(Math.round(k.ekBedarf))} EK am {datum(ekTag)}
              </div>
              <p className="mt-1 text-text-muted">
                Freie Gruppenliquidität erlaubt an diesem Tag höchstens{" "}
                {euro(tragbar)}, ohne bis zum Planende unter die
                Mindestliquidität von {euro(liquiditaet.mindestFrei)} zu fallen.
                Andere Deals der Pipeline sind darin noch nicht enthalten.
              </p>
            </div>
          </PanelAbschnitt>

          <PanelAbschnitt titel="Nächster Schritt">
            <p className="text-sm">
              {a.naechsterSchritt || "Kein nächster Schritt erfasst."}
              {a.naechsterSchrittAm
                ? ` · bis ${datum(a.naechsterSchrittAm)}`
                : ""}
            </p>
            {a.notartermin ? (
              <p className="mt-1 text-xs text-text-muted">
                Notartermin {datum(a.notartermin)}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {weiter ? (
                <Knopf variante="primaer" onClick={() => phaseSetzen(weiter)}>
                  <ArrowRight className="size-4" aria-hidden /> Weiter zu{" "}
                  {PHASE_LABEL[weiter]}
                </Knopf>
              ) : null}
              {AKTIVE_PHASEN.includes(a.phase) ? (
                <Knopf variante="geist" onClick={() => phaseSetzen("abgesagt")}>
                  <XCircle className="size-4" aria-hidden /> Absagen
                </Knopf>
              ) : null}
              {salesforceLink(crm.instanzUrl, a.sfId) ? (
                <Knopf variante="geist" asChild>
                  <a
                    href={salesforceLink(crm.instanzUrl, a.sfId)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-4" aria-hidden /> In
                    Salesforce öffnen
                  </a>
                </Knopf>
              ) : a.sfId ? (
                <span className="self-center text-xs text-text-muted">
                  Salesforce-Transaktion {a.sfId}
                </span>
              ) : null}
            </div>
          </PanelAbschnitt>
        </>
      ) : null}
    </DetailPanel>
  );
}

const FINANZIERUNG_LABEL = {
  bestaetigt: "bestätigt",
  offen: "offen",
  bar: "Barkauf",
  unbekannt: "unbekannt",
} as const;

function ExposeEingang({
  exposes,
  onUebernommen,
}: {
  exposes: Expose[];
  onUebernommen: (ankaufId: string) => void;
}) {
  const qc = useQueryClient();
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const offen = exposes.filter((e) => !e.ankaufId);
  const uebernehmen = async (e: Expose) => {
    setLaeuft(e.id);
    try {
      const id = await boardRepository().ankaufAusExpose({
        exposeId: e.id,
        name: e.adresse || e.betreff || "Exposé",
        strasse: e.adresse,
        ort: e.ort,
        angebotspreis: e.angebotspreis,
        jahresnettokaltmiete: e.jahresnettokaltmiete,
        flaeche: e.flaeche,
        einheiten: e.einheiten,
        makler: e.makler,
        sfId: e.sfTransaktionId,
      });
      await qc.invalidateQueries({ queryKey: BOARD_DATEN_KEY });
      toast.success("In die Pipeline übernommen", {
        description: e.adresse || e.betreff,
      });
      onUebernommen(id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLaeuft(null);
    }
  };
  const spalten: Spalte<Expose>[] = [
    {
      id: "objekt",
      kopf: "Objekt",
      zelle: (e) => (
        <div>
          <div className="font-medium">
            {e.adresse || e.betreff || "ohne Adresse"}
          </div>
          <div className="text-xs text-text-muted">
            {[e.ort, e.makler ?? e.absender].filter(Boolean).join(" · ")}
          </div>
        </div>
      ),
      sortierWert: (e) => e.adresse,
    },
    {
      id: "eingang",
      kopf: "Eingang",
      zelle: (e) => (e.eingegangenAm ? datum(e.eingegangenAm) : "–"),
      sortierWert: (e) => e.eingegangenAm ?? "",
    },
    {
      id: "preis",
      kopf: "Angebotspreis",
      ausrichtung: "rechts",
      zelle: (e) => (e.angebotspreis ? euroKompakt(e.angebotspreis) : "–"),
      sortierWert: (e) => e.angebotspreis ?? 0,
    },
    {
      id: "faktor",
      kopf: "Faktor",
      ausrichtung: "rechts",
      zelle: (e) =>
        e.angebotspreis && e.jahresnettokaltmiete
          ? `${dezimal(e.angebotspreis / e.jahresnettokaltmiete, 1)}-fach`
          : "–",
      sortierWert: (e) =>
        e.angebotspreis && e.jahresnettokaltmiete
          ? e.angebotspreis / e.jahresnettokaltmiete
          : 999,
      optional: true,
    },
    {
      id: "flaeche",
      kopf: "Fläche",
      ausrichtung: "rechts",
      zelle: (e) => (e.flaeche ? flaeche(e.flaeche) : "–"),
      sortierWert: (e) => e.flaeche ?? 0,
      optional: true,
    },
    {
      id: "aktion",
      kopf: "",
      ausrichtung: "rechts",
      zelle: (e) => (
        <Knopf
          variante="geist"
          disabled={laeuft === e.id}
          onClick={(ev) => {
            ev.stopPropagation();
            void uebernehmen(e);
          }}
        >
          <Download className="size-4" aria-hidden /> In Pipeline
        </Knopf>
      ),
    },
  ];
  return (
    <Abschnitt
      titel="Eingegangene Exposés"
      beschreibung={`${offen.length} Exposés aus dem Postfach noch nicht in der Pipeline · Analyse und Salesforce-Export laufen weiter über Bens Exposé-Import`}
    >
      {offen.length === 0 ? (
        <Leerzustand
          icon={Download}
          titel="Alles übernommen"
          text="Neue Exposés erscheinen hier, sobald das Postfach sie analysiert hat."
        />
      ) : (
        <DatenTabelle
          label="Exposé-Eingang"
          zeilen={offen}
          spalten={spalten}
          schluessel={(e) => e.id}
          startSortierung={{ id: "eingang", richtung: "ab" }}
          suchText={(e) =>
            `${e.adresse} ${e.ort} ${e.betreff} ${e.makler ?? ""}`
          }
        />
      )}
    </Abschnitt>
  );
}

const STATUS_LABEL: Record<string, string> = {
  vermietet: "vermietet",
  leer: "leer",
  sanierung: "Sanierung",
  im_vertrieb: "im Vertrieb",
  reserviert: "reserviert",
  verkauft: "verkauft",
};

function Abverkauf({
  daten,
  crm,
  filter,
}: {
  daten: BoardDaten;
  crm: CrmDaten;
  filter: (id: string) => boolean;
}) {
  const zeilen = einheitenVertrieb(daten, crm).filter((v) => {
    const p = daten.properties.find((x) => x.id === v.unit.propertyId);
    return p ? filter(p.companyId) : false;
  });
  const objektName = (id: string) =>
    daten.properties.find((p) => p.id === id)?.name ?? id;
  const spalten: Spalte<EinheitVertrieb>[] = [
    {
      id: "einheit",
      kopf: "Einheit",
      zelle: (v) => (
        <div>
          <div className="font-medium">{v.unit.label}</div>
          <div className="text-xs text-text-muted">
            {objektName(v.unit.propertyId)}
          </div>
        </div>
      ),
      sortierWert: (v) => v.unit.id,
    },
    {
      id: "flaeche",
      kopf: "Fläche",
      ausrichtung: "rechts",
      zelle: (v) => flaeche(v.unit.area),
      sortierWert: (v) => v.unit.area,
      optional: true,
    },
    {
      id: "preis",
      kopf: "Preis",
      ausrichtung: "rechts",
      zelle: (v) =>
        euro(v.fuehrend?.preis ?? v.unit.salePrice ?? v.unit.listPrice ?? 0),
      sortierWert: (v) => v.fuehrend?.preis ?? v.unit.listPrice ?? 0,
    },
    {
      id: "board",
      kopf: "Status Einheit",
      zelle: (v) => STATUS_LABEL[v.unit.status],
      sortierWert: (v) => v.unit.status,
    },
    {
      id: "kaeufer",
      kopf: "Käufer / Interessenten",
      zelle: (v) =>
        v.kaeufer ? (
          <div>
            <div>{v.kaeufer.name}</div>
            <div className="text-xs text-text-muted">
              {v.fuehrend ? RESERVIERUNG_LABEL[v.fuehrend.status] : ""}
              {v.fuehrend?.notartermin
                ? ` · Notar ${datum(v.fuehrend.notartermin)}`
                : ""}{" "}
              · Finanzierung {FINANZIERUNG_LABEL[v.kaeufer.finanzierung]}
            </div>
          </div>
        ) : v.interessenten ? (
          <span className="text-text-muted">
            {v.interessenten}{" "}
            {v.interessenten === 1 ? "Interessent" : "Interessenten"}
          </span>
        ) : (
          <span className="text-text-subtle">–</span>
        ),
      sortierWert: (v) => v.kaeufer?.name ?? "",
    },
    {
      id: "abgleich",
      kopf: "Abgleich",
      zelle: (v) =>
        v.abweichung ? (
          <StatusBadge ampel="gelb">{v.abweichung}</StatusBadge>
        ) : (
          <StatusBadge ampel="gruen">stimmt</StatusBadge>
        ),
      sortierWert: (v) => (v.abweichung ? 0 : 1),
    },
  ];
  const verkauft = zeilen.filter((v) => v.unit.status === "verkauft");
  return (
    <Abschnitt
      titel="Käufer und Reservierungen je Einheit"
      beschreibung={`${verkauft.length} von ${zeilen.length} Einheiten beurkundet · Einheitenstatus gegen Verkaufsstand abgeglichen`}
    >
      <DatenTabelle
        label="Abverkauf"
        zeilen={zeilen}
        spalten={spalten}
        schluessel={(v) => v.unit.id}
        startSortierung={{ id: "abgleich", richtung: "auf" }}
        suchText={(v) =>
          `${v.unit.label} ${objektName(v.unit.propertyId)} ${v.kaeufer?.name ?? ""}`
        }
      />
    </Abschnitt>
  );
}
