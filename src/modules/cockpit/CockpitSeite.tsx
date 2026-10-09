import { AlertTriangle } from "lucide-react";
import { Buehne, LivePunkt } from "@/components/board/Bausteine";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { datum, datumLang, tagKurz } from "@/lib/format/de";
import {
  HORIZONT_TAGE,
  kreisReihe,
} from "@/modules/liquiditaet/logik/liquiditaet";
import { useLage } from "@/modules/pruefliste/useLage";
import { useGesellschaftsFilter } from "@/modules/shell/daten";
import { standZaehlen, zehnFragen } from "./logik/zehnFragen";
import {
  BalkenListe,
  BedarfBalken,
  Kachel,
  MonatsSaeulen,
  Ring,
  SegmentBalken,
  StandPille,
  Verlaufslinie,
} from "./Kacheln";

function gruss(): string {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
}

export function CockpitSeite() {
  const lage = useLage();
  const filter = useGesellschaftsFilter();

  if (lage.fehler)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Cockpit nicht verfügbar"
        text={(lage.fehler as Error).message}
      />
    );
  if (!lage.data || !lage.liquiditaet || !lage.darlehen || !lage.immobilien)
    return <SeitenSkelett />;

  const { data: daten, liquiditaet: l } = lage;
  const stichtag = daten.stichtag;
  const ids = filter.alle ? l.freieIds : [filter.gesellschaft];
  const f = zehnFragen({
    daten,
    darlehen: lage.darlehen,
    immobilien: lage.immobilien,
    liquiditaet: l,
    ids,
    alle: filter.alle,
  });
  const zahl = standZaehlen(f);

  const kreis = daten.companies.filter((c) => ids.includes(c.id));
  const min = kreis.reduce((s, c) => s + c.minLiquidity, 0);
  const kurz = kreisReihe(l.verlauf, ids).slice(0, HORIZONT_TAGE + 1);
  const bankStand = daten.datenstand.find(
    (x) => x.id === "bankumsaetze",
  )?.stand;

  return (
    <>
      <Buehne>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
              <LivePunkt />
              {daten.quelle === "mock"
                ? "Demodaten"
                : bankStand
                  ? `Bankstand ${datum(bankStand.slice(0, 10))}`
                  : "Bankstand unbekannt"}
            </div>
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-heading">
              {gruss()}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {datumLang(stichtag)} ·{" "}
              {filter.alle
                ? "Gruppe (frei verfügbar, ohne Maklerbereich)"
                : daten.companies.find((c) => c.id === filter.gesellschaft)
                    ?.name}
            </p>
          </div>
          {daten.quelle === "live" ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <StandPille gross stand="echt" anzahl={zahl.echt} />
              <StandPille gross stand="teilweise" anzahl={zahl.teilweise} />
              <StandPille gross stand="fehlt" anzahl={zahl.fehlt} />
            </div>
          ) : null}
        </div>
      </Buehne>

      <div className="grid grid-cols-1 gap-4 *:min-w-0 md:grid-cols-2 xl:grid-cols-12">
        {/* Kopfzeile: vier große Zahlen */}
        <Kachel a={f[0]} titel="Liquidität heute" className="xl:col-span-3">
          {kurz.length > 1 ? <Verlaufslinie werte={kurz} /> : null}
        </Kachel>
        <Kachel a={f[5]} titel="Restschuld" className="xl:col-span-3">
          <SegmentBalken balken={f[5].balken} />
        </Kachel>
        <Kachel a={f[6]} titel="Mietrückstand" className="xl:col-span-3">
          <BalkenListe
            balken={f[6].balken}
            zeilen={3}
            leer="Alle Mieten bezahlt"
          />
        </Kachel>
        <Kachel a={f[9]} titel="Maschinenlager" className="xl:col-span-3" />

        {/* Liquidität */}
        <Kachel
          a={f[1]}
          titel="Reicht das Geld 13 Wochen?"
          className="md:col-span-2 xl:col-span-8"
        >
          {kurz.length > 1 ? (
            <ZeitreihenDiagramm
              label="Liquidität 13 Wochen"
              daten={kurz.map((p) => ({ x: p.datum, saldo: p.wert }))}
              xSchluessel="x"
              xFormat={tagKurz}
              hoehe={240}
              kompakt
              referenz={
                min > 0 ? { wert: min, label: "Mindestliquidität" } : undefined
              }
              reihen={[
                {
                  schluessel: "saldo",
                  label: "Saldo",
                  farbe: "var(--brand)",
                  flaeche: true,
                },
              ]}
            />
          ) : null}
        </Kachel>
        <Kachel
          a={f[2]}
          titel="Große Zahlungen 30 Tage"
          className="md:col-span-2 xl:col-span-4"
        >
          <BalkenListe
            balken={f[2].balken}
            zeilen={7}
            leer="Keine großen Zahlungen"
          />
        </Kachel>

        {/* Finanzierung */}
        <Kachel
          a={f[3]}
          titel="Darlehen enden in 12 Monaten"
          className="md:col-span-2 xl:col-span-8"
        >
          <MonatsSaeulen balken={f[3].balken} label="Fälligkeiten je Monat" />
        </Kachel>
        <Kachel
          a={f[4]}
          titel="Zinsen und Raten bezahlt"
          className="md:col-span-2 xl:col-span-4"
          kopfzahl={f[4].antwort}
        >
          <Ring
            balken={f[4].balken}
            mitte={f[4].antwort ?? "–"}
            unter="Fällige Zahlungen der letzten 12 Monate"
          />
        </Kachel>

        {/* Immobilien */}
        <Kachel
          a={f[7]}
          titel="Mietausfall durch Leerstand"
          className="xl:col-span-6"
        >
          <BalkenListe balken={f[7].balken} leer="Kein Leerstand" />
        </Kachel>
        <Kachel a={f[8]} titel="Ankaufspipeline" className="xl:col-span-6">
          {f[8].vergleich ? (
            <div className="mb-5">
              <BedarfBalken {...f[8].vergleich} />
            </div>
          ) : null}
          <BalkenListe balken={f[8].balken} leer="Keine aktiven Deals" />
        </Kachel>

        <Kachel
          a={f[9]}
          titel="Standzeit Maschinen"
          className="md:col-span-2 xl:col-span-12"
          kopfzahl={`${f[9].balken.filter((b) => b.wert > (f[9].schwelle ?? 0)).length} über ${f[9].schwelle} Tage`}
        >
          <BalkenListe
            balken={f[9].balken}
            zeilen={8}
            schwelle={f[9].schwelle}
            schwelleLabel={`${f[9].schwelle} Tage`}
            leer="Keine Maschinen im Lager"
          />
        </Kachel>
      </div>
    </>
  );
}
