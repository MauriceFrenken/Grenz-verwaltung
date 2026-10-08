import { Building2, Inbox, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { Knopf, Taste } from "@/components/board/Knopf";
import { KpiKarte } from "@/components/board/KpiKarte";
import {
  Countdown,
  GrosseZahl,
  GrosserBetrag,
  Laufband,
  LosKarte,
} from "@/components/board/Auktion";
import {
  Abschnitt,
  Karte,
  Kennzahlen,
  BuehnenKennzahl,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { KpiSkelett, TabellenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt, StatusBadge, type Ampel } from "@/components/board/Status";
import {
  datum,
  euro,
  euroKompakt,
  euroMitVorzeichen,
  prozent,
  tagKurz,
} from "@/lib/format/de";
import { heuteIso, plusTage } from "@/lib/kalender";

const HEUTE = heuteIso();

interface Beispiel {
  id: string;
  name: string;
  betrag: number;
  faellig: string;
  ampel: Ampel;
}

const ZEILEN: Beispiel[] = [
  {
    id: "DL-2016-001",
    name: "Rheinblick",
    betrag: 1_784_220.5,
    faellig: "2027-01-31",
    ampel: "rot",
  },
  {
    id: "DL-2018-002",
    name: "Lindenhof",
    betrag: 1_512_000,
    faellig: "2027-07-31",
    ampel: "gelb",
  },
  {
    id: "DL-2019-003",
    name: "Am Stadtpark",
    betrag: 1_101_450.12,
    faellig: "2029-11-30",
    ampel: "gruen",
  },
  {
    id: "DL-2021-004",
    name: "Kastanienhof",
    betrag: 864_300,
    faellig: "2031-02-28",
    ampel: "grau",
  },
];

const SPALTEN: Spalte<Beispiel>[] = [
  {
    id: "id",
    kopf: "ID",
    zelle: (z) => <span className="font-medium">{z.id}</span>,
    sortierWert: (z) => z.id,
  },
  {
    id: "name",
    kopf: "Objekt",
    zelle: (z) => z.name,
    sortierWert: (z) => z.name,
  },
  {
    id: "betrag",
    kopf: "Restschuld",
    zelle: (z) => euro(z.betrag),
    sortierWert: (z) => z.betrag,
    ausrichtung: "rechts",
  },
  {
    id: "faellig",
    kopf: "Zinsbindung",
    zelle: (z) => datum(z.faellig),
    sortierWert: (z) => z.faellig,
  },
  {
    id: "status",
    kopf: "Status",
    zelle: (z) => <StatusBadge ampel={z.ampel} />,
  },
];

const VERLAUF = Array.from({ length: 30 }, (_, i) => ({
  tag: plusTage("2026-10-07", i),
  basis: 1_800_000 + Math.sin(i / 4) * 120_000 - i * 9_000,
  szenario:
    1_800_000 + Math.sin(i / 4) * 120_000 - i * 9_000 - (i > 14 ? 650_000 : 0),
}));

export function DesignSeite() {
  const [panel, setPanel] = useState<Beispiel | null>(null);
  const [horizont, setHorizont] = useState<"w" | "m">("w");

  return (
    <>
      <SeitenKopf
        titel="Designsystem"
        unterzeile="Auktionssaal: dunkle Bühne, Signal-Orange als einziger Akzent, große Zahlen, Countdown, Lose. Status bleibt Grün, Gelb, Rot, Grau."
        aktionen={
          <>
            <Knopf variante="sekundaer">Sekundär</Knopf>
            <Knopf
              variante="primaer"
              onClick={() => toast.success("Gespeichert")}
            >
              <Plus /> Primär
            </Knopf>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <BuehnenKennzahl
            label="Großer Betrag"
            wert={<GrosserBetrag wert={4_312_000} />}
            hinweis="zählt beim ersten Anzeigen hoch"
          />
          <BuehnenKennzahl
            label="Countdown"
            wert={
              <Countdown
                ziel={plusTage(HEUTE, 3)}
                stichtag={HEUTE}
                className="text-brand"
              />
            }
            hinweis="Stunden nur in der letzten Woche"
            ampel="gelb"
          />
          <BuehnenKennzahl
            label="Anzahl"
            wert={<GrosseZahl wert={32} />}
            hinweis="mit Ampel-Punkt"
            ampel="rot"
          />
          <BuehnenKennzahl
            label="Daten fehlen"
            wert="–"
            hinweis="grau statt geschätzt"
            ampel="grau"
          />
        </div>
      </SeitenKopf>

      <Laufband
        eintraege={[
          {
            id: "1",
            datum: "05.10.",
            kuerzel: "MH",
            text: "Muster Mieter",
            betrag: 1_250,
          },
          {
            id: "2",
            datum: "05.10.",
            kuerzel: "MI",
            text: "Musterbank Rate",
            betrag: -2_387.15,
          },
          {
            id: "3",
            datum: "04.10.",
            kuerzel: "MB",
            text: "Beispiel Käufer Walze",
            betrag: 27_500,
          },
        ]}
        format={euroMitVorzeichen}
      />

      <Abschnitt
        titel="Los-Karte"
        beschreibung="Ein Element für Maschinen, Deals und Fristen: Losnummer, Titel, Hauptzahl, Uhr, Status, nächster Schritt"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <LosKarte
            los="BM-2026-005"
            titel="Beispiel Walze W 120"
            untertitel="Walze · Bj. 2015 · 4.900 Bh"
            wert="24 Tsd. €"
            wertLabel="Einstand"
            uhr="142 T"
            uhrLabel="Standzeit"
            ampel="gelb"
            status="Inseriert"
            schritt="nächste Preisstufe prüfen"
            onClick={() => toast("Los geöffnet")}
          />
          <LosKarte
            los="DL-2022-008"
            titel="Darlehen endet"
            untertitel="Musterbank → MB"
            wert="60 Tsd. €"
            wertLabel="Restschuld"
            uhr={<Countdown ziel={plusTage(HEUTE, 12)} stichtag={HEUTE} />}
            uhrLabel="Frist"
            ampel="rot"
            status="Darlehen"
            schritt="Anschlussfinanzierung klären"
          />
          <LosKarte
            los="AK-2026-001"
            titel="MFH Musterweg"
            untertitel="Musterstadt"
            wert="1,6 Mio. €"
            wertLabel="Angebotspreis"
            uhr={<Countdown ziel={plusTage(HEUTE, 2)} stichtag={HEUTE} />}
            uhrLabel="nächster Schritt"
            ampel="gruen"
            status="Notar"
            schritt="Beurkundung vorbereiten"
          />
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Farben"
        beschreibung="Graphit-Bühne und Signal-Orange (#FF6600) als Marke; Orange heißt nie Warnung. Text in Orange auf Hell nutzt die dunklere Stufe (#C2410C)."
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-9">
          {[
            ["Marke", "bg-brand"],
            ["Marke Text", "bg-brand-text"],
            ["Bühne", "bg-stage"],
            ["Bühne erhöht", "bg-stage-raised"],
            ["Schwarz", "bg-primary"],
            ["Fläche", "bg-surface border border-hairline"],
            ["Grund", "bg-background border border-hairline"],
            ["OK", "bg-ok"],
            ["Prüfen", "bg-warn"],
            ["Überfällig", "bg-bad"],
          ].map(([n, k]) => (
            <div key={n}>
              <div className={`h-12 ${k}`} />
              <div className="mt-1.5 text-xs text-text-muted">{n}</div>
            </div>
          ))}
        </div>
      </Abschnitt>

      <Abschnitt titel="Typografie">
        <Karte className="space-y-2 p-5">
          <div className="text-[22px] font-semibold tracking-[-0.015em] text-heading">
            Seitentitel
          </div>
          <div className="text-[15px] font-semibold text-heading">
            Abschnitt
          </div>
          <div className="text-sm text-foreground">
            Fließtext für Beschreibungen und Tabellen.
          </div>
          <div className="text-xs text-text-muted">Metadaten · 07.10.2026</div>
          <div className="text-[26px] font-semibold tabular-nums text-heading">
            {euro(1234567.89)}
          </div>
        </Karte>
      </Abschnitt>

      <Abschnitt titel="KPI-Karten">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiKarte
            label="Liquidität heute"
            wert={euroKompakt(3_812_000)}
            hinweis="9 Konten"
            ampel="gruen"
            href="/board/liquiditaet"
          />
          <KpiKarte
            label="In 13 Wochen"
            wert={euroKompakt(2_140_000)}
            hinweis="1 Gesellschaft unter Minimum"
            ampel="gelb"
          />
          <KpiKarte
            label="Offene Prüffälle"
            wert="12"
            hinweis="davon 3 rot"
            ampel="rot"
          />
          <KpiKarte
            label="Leerstand"
            wert={prozent(0.041, 1)}
            hinweis="3 Einheiten"
          />
          <KpiSkelett />
        </div>
      </Abschnitt>

      <Abschnitt titel="Status">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge ampel="gruen" />
          <StatusBadge ampel="gelb" />
          <StatusBadge ampel="rot" />
          <StatusBadge ampel="grau" />
          <StatusBadge ampel="akzent">Intercompany</StatusBadge>
          <span className="ml-4 flex items-center gap-2">
            <AmpelPunkt ampel="gruen" /> <AmpelPunkt ampel="gelb" />{" "}
            <AmpelPunkt ampel="rot" />
          </span>
          <span className="ml-4 flex items-center gap-1 text-xs text-text-muted">
            Kürzel <Taste>⌘K</Taste>
          </span>
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Datentabelle"
        beschreibung="Sortierbar, filterbar, fixierte Kopfzeile; Klick öffnet das Detail-Panel"
      >
        <DatenTabelle
          label="Beispieltabelle"
          zeilen={ZEILEN}
          spalten={SPALTEN}
          schluessel={(z) => z.id}
          suchText={(z) => `${z.id} ${z.name}`}
          filter={[
            {
              id: "ampel",
              label: "Status",
              optionen: [
                { wert: "rot", label: "Überfällig" },
                { wert: "gelb", label: "Prüfen" },
                { wert: "gruen", label: "OK" },
              ],
              passt: (z, w) => z.ampel === w,
            },
          ]}
          onZeileKlick={setPanel}
          fusszeile={
            <span className="tabular-nums">
              Summe {euro(ZEILEN.reduce((s, z) => s + z.betrag, 0))}
            </span>
          }
        />
        <div className="mt-3">
          <TabellenSkelett zeilen={2} />
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Diagramm"
        aktionen={
          <Segmente
            label="Horizont"
            wert={horizont}
            onChange={setHorizont}
            optionen={[
              { wert: "w", label: "13 Wochen" },
              { wert: "m", label: "24 Monate" },
            ]}
          />
        }
      >
        <Karte className="p-4">
          <ZeitreihenDiagramm
            label="Beispiel Liquiditätsverlauf"
            daten={VERLAUF}
            xSchluessel="tag"
            xFormat={tagKurz}
            reihen={[
              {
                schluessel: "basis",
                label: "Basisplanung",
                farbe: "var(--chart-1)",
              },
              {
                schluessel: "szenario",
                label: "Szenario Ankauf",
                farbe: "var(--chart-4)",
                gestrichelt: true,
              },
            ]}
            referenz={{ wert: 1_000_000, label: "Mindestliquidität" }}
          />
        </Karte>
      </Abschnitt>

      <Abschnitt titel="Leerzustand">
        <div className="grid gap-3 md:grid-cols-2">
          <Karte>
            <Leerzustand
              icon={Inbox}
              titel="Keine offenen Prüffälle"
              text="Neue Fälle erscheinen hier automatisch."
              kompakt
            />
          </Karte>
          <Karte>
            <Leerzustand
              icon={Building2}
              titel="Noch keine Objekte"
              text="Lege das erste Objekt an, um Mieten abzugleichen."
              aktion={<Knopf variante="primaer">Objekt anlegen</Knopf>}
              kompakt
            />
          </Karte>
        </div>
      </Abschnitt>

      <DetailPanel
        offen={panel !== null}
        onSchliessen={() => setPanel(null)}
        titel={panel?.name ?? ""}
        unterzeile={panel?.id}
        kopfzeile={panel ? <StatusBadge ampel={panel.ampel} /> : null}
      >
        {panel ? (
          <PanelAbschnitt titel="Kennzahlen">
            <Kennzahlen
              eintraege={[
                {
                  label: "Restschuld",
                  wert: euro(panel.betrag),
                  hervorheben: true,
                },
                { label: "Zinsbindung bis", wert: datum(panel.faellig) },
              ]}
            />
          </PanelAbschnitt>
        ) : null}
      </DetailPanel>
    </>
  );
}
