import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  AlertTriangle,
  ExternalLink,
  FileSpreadsheet,
  Truck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { Knopf } from "@/components/board/Knopf";
import { KpiKarte } from "@/components/board/KpiKarte";
import {
  Abschnitt,
  Karte,
  Kennzahlen,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt, StatusBadge } from "@/components/board/Status";
import { MASCHINEN_STATUS, MASCHINEN_STATUS_LABEL } from "@/lib/db/typen";
import {
  datum,
  dezimal,
  euro,
  euroKompakt,
  ganzzahl,
  prozent,
} from "@/lib/format/de";
import {
  useBoardDaten,
  useGesellschaftsFilter,
  useNachschlagen,
} from "@/modules/shell/daten";
import {
  handelAuswerten,
  IC_ZINS,
  LAGER_GELB,
  LAGER_ROT,
  plattformAuswerten,
  type MaschinenKennzahlen,
} from "./logik/baumaschinen";
import { MaschinenImportDialog } from "./MaschinenImportDialog";

type Reiter = "handel" | "plattform";

export function BaumaschinenSeite() {
  const { data, isLoading, error } = useBoardDaten();
  const filter = useGesellschaftsFilter();
  const n = useNachschlagen(data);
  const { maschine: offenId } = useSearch({ from: "/board/baumaschinen" });
  const navigate = useNavigate({ from: "/board/baumaschinen" });
  const [reiter, setReiter] = useState<Reiter>("handel");
  const [importOffen, setImportOffen] = useState(false);

  const handel = useMemo(
    () => (data ? handelAuswerten(data, filter.passt) : null),
    [data, filter],
  );
  const plattform = useMemo(
    () => (data ? plattformAuswerten(data, filter.passt) : []),
    [data, filter],
  );

  if (error)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Daten konnten nicht geladen werden"
        text={(error as Error).message}
      />
    );
  if (isLoading || !data || !handel) return <SeitenSkelett />;

  const offen = offenId
    ? handel.maschinen.find((k) => k.machine.id === offenId)
    : undefined;
  const setOffen = (id: string | undefined) =>
    navigate({
      search: (s) => ({ ...s, maschine: id }),
      replace: true,
      resetScroll: false,
    });
  const handelsGesellschaften = data.companies.filter(
    (c) => c.segment === "baumaschinen_handel",
  );
  const keinBestand = data.machines.length === 0;

  const spalten: Spalte<MaschinenKennzahlen>[] = [
    {
      id: "ampel",
      kopf: "",
      breite: "w-6",
      zelle: (k) => <AmpelPunkt ampel={k.ampel} />,
    },
    {
      id: "maschine",
      kopf: "Maschine",
      sortierWert: (k) => `${k.machine.hersteller} ${k.machine.modell}`,
      zelle: (k) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-heading">
            {k.machine.hersteller} {k.machine.modell}
          </div>
          <div className="truncate text-xs text-text-muted">
            {[
              k.machine.id,
              k.machine.kategorie,
              k.machine.baujahr ? `Bj. ${k.machine.baujahr}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      kopf: "Status",
      sortierWert: (k) => MASCHINEN_STATUS.indexOf(k.machine.status),
      zelle: (k) => MASCHINEN_STATUS_LABEL[k.machine.status],
    },
    {
      id: "einstand",
      kopf: "Einstand",
      ausrichtung: "rechts",
      sortierWert: (k) => k.einstand,
      zelle: (k) => euro(k.einstand),
    },
    {
      id: "preis",
      kopf: "Angebot / Verkauf",
      ausrichtung: "rechts",
      optional: true,
      sortierWert: (k) =>
        k.machine.verkaufspreis ?? k.machine.angebotspreis ?? null,
      zelle: (k) =>
        euro(k.machine.verkaufspreis ?? k.machine.angebotspreis ?? null),
    },
    {
      id: "rohertrag",
      kopf: "Rohertrag",
      ausrichtung: "rechts",
      sortierWert: (k) => k.rohertrag,
      zelle: (k) =>
        k.rohertrag == null ? (
          "–"
        ) : (
          <span className={k.rohertrag < 0 ? "text-bad" : undefined}>
            {euro(k.rohertrag)}
          </span>
        ),
    },
    {
      id: "lager",
      kopf: "Lagertage",
      ausrichtung: "rechts",
      sortierWert: (k) => k.lagerTage,
      zelle: (k) => (k.lagerTage == null ? "–" : ganzzahl(k.lagerTage)),
    },
    {
      id: "gesellschaft",
      kopf: "Gesellschaft",
      optional: true,
      zelle: (k) => n.gesellschaftKurz(k.machine.companyId),
    },
  ];

  return (
    <>
      <SeitenKopf
        titel="Baumaschinen"
        unterzeile={`Handel: Lager, Rohertrag, Kapitalbindung · Plattform: Burn-Rate und Runway${data.quelle === "mock" ? " · Musterdaten" : ""}`}
        aktionen={
          <Knopf onClick={() => setImportOffen(true)}>
            <FileSpreadsheet /> Bestand importieren
          </Knopf>
        }
      />

      <div className="mb-4">
        <Segmente
          label="Bereich"
          wert={reiter}
          onChange={setReiter}
          optionen={[
            { wert: "handel", label: "Handel" },
            { wert: "plattform", label: "Plattform" },
          ]}
        />
      </div>

      {reiter === "handel" ? (
        keinBestand ? (
          <Karte>
            <Leerzustand
              icon={Truck}
              titel="Maschinenbestand fehlt"
              text={`Für ${handelsGesellschaften.map((c) => c.shortName).join(", ") || "den Handel"} ist noch keine Maschine erfasst. Ohne Bestand zeigt das Board keine Handelszahlen.`}
              aktion={
                <Knopf variante="primaer" onClick={() => setImportOffen(true)}>
                  <FileSpreadsheet /> Excel oder CSV importieren
                </Knopf>
              }
            />
          </Karte>
        ) : (
          <>
            <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <KpiKarte
                label="Lagerwert"
                wert={euroKompakt(handel.lagerwert)}
                hinweis={`${handel.bestand.length} Maschinen zu Einstandspreisen`}
              />
              <KpiKarte
                label="Ø Lagerdauer"
                wert={
                  handel.lagerDauerSchnitt == null
                    ? "–"
                    : `${handel.lagerDauerSchnitt} Tage`
                }
                hinweis={`gelb ab ${LAGER_GELB}, rot ab ${LAGER_ROT} Tagen`}
                ampel={
                  handel.lagerDauerSchnitt == null
                    ? "grau"
                    : handel.lagerDauerSchnitt >= LAGER_ROT
                      ? "rot"
                      : handel.lagerDauerSchnitt >= LAGER_GELB
                        ? "gelb"
                        : "gruen"
                }
              />
              <KpiKarte
                label="Rohertrag 12 Monate"
                wert={euroKompakt(handel.rohertrag12)}
                hinweis={`${handel.verkauft12.length} Verkäufe · Marge ${prozent(handel.marge12)}`}
              />
              <KpiKarte
                label="Lagerumschlag"
                wert={
                  handel.umschlag == null
                    ? "–"
                    : `${dezimal(handel.umschlag, 1)}×`
                }
                hinweis="Wareneinsatz 12 Monate / Lagerwert"
              />
              <KpiKarte
                label="Finanzierung durch Gruppe"
                wert={euroKompakt(handel.icFinanzierung)}
                hinweis={
                  handel.icFinanzierung > 0
                    ? `${euroKompakt(handel.icZinsenPa)} Zinsen p. a.`
                    : "keine IC-Darlehen erfasst"
                }
                href="/board/darlehen"
              />
            </div>

            <Abschnitt
              titel="Maschinen"
              beschreibung={`Erwarteter Rohertrag des Bestands ${euroKompakt(handel.rohertragBestand)} zu Angebotspreisen. Finanzierungskosten kalkulatorisch mit ${prozent(IC_ZINS)} p. a.`}
            >
              <DatenTabelle
                label="Maschinen"
                zeilen={handel.maschinen}
                spalten={spalten}
                schluessel={(k) => k.machine.id}
                onZeileKlick={(k) => setOffen(k.machine.id)}
                aktiveZeile={offenId ?? null}
                suchText={(k) =>
                  `${k.machine.id} ${k.machine.hersteller} ${k.machine.modell} ${k.machine.kategorie ?? ""} ${k.machine.seriennummer ?? ""}`
                }
                suchPlatzhalter="Maschine, Modell, Seriennummer…"
                filter={[
                  {
                    id: "status",
                    label: "Status",
                    optionen: MASCHINEN_STATUS.map((s) => ({
                      wert: s,
                      label: MASCHINEN_STATUS_LABEL[s],
                    })),
                    passt: (k, w) => k.machine.status === w,
                  },
                ]}
                startSortierung={{ id: "lager", richtung: "ab" }}
              />
            </Abschnitt>
          </>
        )
      ) : (
        <Abschnitt
          titel="Plattform"
          beschreibung="Bankbestand aus Kontosalden und Umsätzen, Burn-Rate als Ø Nettoabfluss der letzten drei Monate"
        >
          {plattform.length === 0 ? (
            <Karte>
              <Leerzustand
                icon={Truck}
                titel="Keine Plattform-Gesellschaft"
                text="Keiner Gesellschaft ist das Segment Plattform zugeordnet. Das lässt sich unter Datenqualität ändern."
              />
            </Karte>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {plattform.map((p) => (
                <Karte key={p.companyId} className="p-5">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-heading">
                      {p.name}
                    </h3>
                    {!p.datenVorhanden ? (
                      <StatusBadge ampel="gelb">Daten fehlen</StatusBadge>
                    ) : p.runwayMonate != null ? (
                      <StatusBadge
                        ampel={
                          p.runwayMonate < 6
                            ? "rot"
                            : p.runwayMonate < 12
                              ? "gelb"
                              : "gruen"
                        }
                      >
                        Runway {dezimal(p.runwayMonate, 1)} Monate
                      </StatusBadge>
                    ) : null}
                  </div>
                  <Kennzahlen
                    eintraege={[
                      {
                        label: "Bankbestand",
                        wert:
                          p.bestand == null ? "Saldo fehlt" : euro(p.bestand),
                        hervorheben: true,
                      },
                      {
                        label: "Burn-Rate je Monat",
                        wert: p.burnRate == null ? "–" : euro(p.burnRate),
                      },
                      {
                        label: "Runway",
                        wert:
                          p.runwayMonate == null
                            ? "–"
                            : `${dezimal(p.runwayMonate, 1)} Monate`,
                      },
                      {
                        label: "Finanzierung durch Gruppe",
                        wert: euro(p.finanzierung),
                      },
                    ]}
                  />
                  {!p.datenVorhanden ? (
                    <p className="mt-4 text-xs text-text-muted">
                      Für diese Gesellschaft ist kein Bankkonto angebunden.
                      Konto unter Datenqualität erfassen oder in EBICS
                      aufnehmen.
                    </p>
                  ) : null}
                </Karte>
              ))}
            </div>
          )}
        </Abschnitt>
      )}

      <DetailPanel
        offen={!!offen}
        onSchliessen={() => setOffen(undefined)}
        titel={
          offen ? `${offen.machine.hersteller} ${offen.machine.modell}` : ""
        }
        unterzeile={offen ? offen.machine.id : undefined}
        kopfzeile={
          offen ? (
            <StatusBadge ampel={offen.ampel}>
              {MASCHINEN_STATUS_LABEL[offen.machine.status]}
            </StatusBadge>
          ) : null
        }
      >
        {offen ? (
          <>
            <PanelAbschnitt titel="Wirtschaftlich">
              <Kennzahlen
                eintraege={[
                  {
                    label: "Einkaufspreis",
                    wert: euro(offen.machine.einkaufspreis),
                  },
                  { label: "Nebenkosten", wert: euro(offen.kosten) },
                  {
                    label: "Einstand",
                    wert: euro(offen.einstand),
                    hervorheben: true,
                  },
                  {
                    label:
                      offen.machine.status === "verkauft"
                        ? "Verkaufspreis"
                        : "Angebotspreis",
                    wert: euro(
                      offen.machine.verkaufspreis ??
                        offen.machine.angebotspreis,
                    ),
                  },
                  { label: "Rohertrag", wert: euro(offen.rohertrag) },
                  { label: "Marge", wert: prozent(offen.marge) },
                  {
                    label: "Lagertage",
                    wert:
                      offen.lagerTage == null ? "–" : ganzzahl(offen.lagerTage),
                  },
                  {
                    label: "Finanzierungskosten",
                    wert: euro(offen.zinskosten),
                  },
                ]}
              />
            </PanelAbschnitt>
            <PanelAbschnitt titel="Maschine">
              <Kennzahlen
                eintraege={[
                  { label: "Kategorie", wert: offen.machine.kategorie ?? "–" },
                  { label: "Baujahr", wert: offen.machine.baujahr ?? "–" },
                  {
                    label: "Betriebsstunden",
                    wert: ganzzahl(offen.machine.betriebsstunden),
                  },
                  {
                    label: "Seriennummer",
                    wert: offen.machine.seriennummer ?? "–",
                  },
                  { label: "Standort", wert: offen.machine.standort ?? "–" },
                  {
                    label: "Gesellschaft",
                    wert: n.gesellschaftName(offen.machine.companyId),
                  },
                ]}
              />
            </PanelAbschnitt>
            <PanelAbschnitt titel="Ein- und Verkauf">
              <Kennzahlen
                eintraege={[
                  { label: "Ankauf am", wert: datum(offen.machine.ankaufAm) },
                  { label: "Lieferant", wert: offen.machine.lieferant ?? "–" },
                  { label: "Verkauf am", wert: datum(offen.machine.verkaufAm) },
                  { label: "Käufer", wert: offen.machine.kaeufer ?? "–" },
                ]}
              />
              {offen.machine.inseratUrl ? (
                <a
                  href={offen.machine.inseratUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" /> Inserat öffnen
                </a>
              ) : null}
              {offen.machine.bemerkung ? (
                <p className="mt-3 text-sm text-text-muted">
                  {offen.machine.bemerkung}
                </p>
              ) : null}
            </PanelAbschnitt>
          </>
        ) : null}
      </DetailPanel>

      <MaschinenImportDialog
        offen={importOffen}
        onSchliessen={() => setImportOffen(false)}
        daten={data}
      />
    </>
  );
}
