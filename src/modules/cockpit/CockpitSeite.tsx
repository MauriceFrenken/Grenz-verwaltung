import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Buehne, LivePunkt } from "@/components/board/Bausteine";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { Karte } from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt } from "@/components/board/Status";
import { datum, datumLang, tagKurz } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import {
  HORIZONT_TAGE,
  kreisReihe,
} from "@/modules/liquiditaet/logik/liquiditaet";
import { useLage } from "@/modules/pruefliste/useLage";
import { useGesellschaftsFilter } from "@/modules/shell/daten";
import {
  standZaehlen,
  zehnFragen,
  type FrageAntwort,
  type FrageStand,
} from "./logik/zehnFragen";

const STAND_PILLE: Record<FrageStand, { label: string; klasse: string }> = {
  echt: { label: "Echte Daten", klasse: "bg-ok-soft text-ok" },
  teilweise: { label: "Teilweise", klasse: "bg-warn-soft text-warn" },
  fehlt: {
    label: "Daten fehlen",
    klasse: "bg-surface-muted text-text-muted",
  },
  muster: { label: "Musterdaten", klasse: "bg-brand-soft text-brand-text" },
};

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
  const antworten = zehnFragen({
    daten,
    darlehen: lage.darlehen,
    immobilien: lage.immobilien,
    liquiditaet: l,
    ids,
    alle: filter.alle,
  });
  const zahl = standZaehlen(antworten);

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
              <StandZahl stand="echt" anzahl={zahl.echt} />
              <StandZahl stand="teilweise" anzahl={zahl.teilweise} />
              <StandZahl stand="fehlt" anzahl={zahl.fehlt} />
            </div>
          ) : null}
        </div>
      </Buehne>

      <div className="mb-6 grid gap-4 *:min-w-0 lg:grid-cols-2">
        {antworten.map((a) => (
          <FrageKarte key={a.id} a={a} />
        ))}
      </div>

      {kurz.length > 1 ? (
        <Karte className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-heading">
              Liquidität nächste 13 Wochen
            </h2>
            <Link
              to="/board/liquiditaet"
              className="text-xs font-medium text-brand-text hover:underline"
            >
              Planung öffnen
            </Link>
          </div>
          <ZeitreihenDiagramm
            label="Liquidität 13 Wochen"
            daten={kurz.map((p) => ({ x: p.datum, saldo: p.wert }))}
            xSchluessel="x"
            xFormat={tagKurz}
            hoehe={220}
            kompakt
            referenz={{ wert: min, label: "Mindestliquidität" }}
            reihen={[
              {
                schluessel: "saldo",
                label: "Saldo",
                farbe: "var(--brand)",
                flaeche: true,
              },
            ]}
          />
        </Karte>
      ) : null}
    </>
  );
}

function StandZahl({ stand, anzahl }: { stand: FrageStand; anzahl: number }) {
  const p = STAND_PILLE[stand];
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium",
        p.klasse,
      )}
    >
      <span className="ziffern">{anzahl}</span> {p.label}
    </span>
  );
}

function FrageKarte({ a }: { a: FrageAntwort }) {
  const pille = STAND_PILLE[a.stand];
  return (
    <Karte className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
          <span className="ziffern text-text-subtle">
            {String(a.nr).padStart(2, "0")}
          </span>
          {a.bereich}
        </div>
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium",
            pille.klasse,
          )}
        >
          {pille.label}
        </span>
      </div>
      <h2 className="mt-2 text-[15px] font-semibold leading-snug text-heading">
        {a.frage}
      </h2>

      {a.antwort !== null ? (
        <>
          <div className="mt-4 flex items-center gap-2.5">
            {a.ampel !== "grau" ? <AmpelPunkt ampel={a.ampel} /> : null}
            <span className="ziffern text-[28px] font-semibold leading-none tracking-[-0.03em] text-heading">
              {a.antwort}
            </span>
          </div>
          <p className="mt-2 text-xs text-text-muted">{a.zusatz}</p>
          {a.zeilen.length ? (
            <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
              {a.zeilen.map((z, i) => (
                <li key={i} className="flex items-center gap-2 py-2 text-xs">
                  {z.ampel ? (
                    <AmpelPunkt ampel={z.ampel} />
                  ) : (
                    <span className="size-1.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-text-muted">
                    {z.text}
                  </span>
                  <span className="ziffern shrink-0 font-medium text-heading">
                    {z.wert}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-input px-4 py-3">
          <div className="text-sm font-medium text-heading">
            Noch keine verlässliche Zahl
          </div>
          <p className="mt-1 text-xs text-text-muted">{a.hinweis}</p>
        </div>
      )}

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="min-w-0 text-[11px] text-text-subtle">
          <div className="truncate">Quelle: {a.quelle}</div>
          {a.stand === "teilweise" && a.hinweis ? (
            <div className="mt-0.5 line-clamp-2 text-warn">{a.hinweis}</div>
          ) : null}
        </div>
        <Link
          to={a.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-brand-text transition-colors hover:bg-surface-muted"
        >
          Öffnen <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Karte>
  );
}
