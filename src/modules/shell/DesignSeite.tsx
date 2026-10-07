import { Building2, Inbox, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { Knopf, Taste } from "@/components/board/Knopf";
import { KpiKarte } from "@/components/board/KpiKarte";
import {
  Abschnitt,
  Karte,
  Kennzahlen,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { KpiSkelett, TabellenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt, StatusBadge, type Ampel } from "@/components/board/Status";
import { datum, euro, euroKompakt, prozent, tagKurz } from "@/lib/format/de";
import { plusTage } from "@/lib/kalender";

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
        unterzeile="Bausteine des Management Boards"
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
      />

      <Abschnitt
        titel="Farben"
        beschreibung="Neutrale Basis, eine Akzentfarbe, Status nur für Bedeutung"
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            ["Akzent", "bg-primary"],
            ["Fläche", "bg-surface border border-hairline"],
            ["Grund", "bg-background border border-hairline"],
            ["OK", "bg-ok"],
            ["Prüfen", "bg-warn"],
            ["Überfällig", "bg-bad"],
          ].map(([n, k]) => (
            <div key={n}>
              <div className={`h-12 rounded-[8px] ${k}`} />
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
