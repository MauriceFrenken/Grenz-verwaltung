import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Calculator } from "lucide-react";
import { useMemo, useState } from "react";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { Knopf } from "@/components/board/Knopf";
import {
  Abschnitt,
  Karte,
  BuehnenKennzahl,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt, StatusBadge } from "@/components/board/Status";
import {
  datum,
  euro,
  euroKompakt,
  monatKurz,
  parseDeutscheZahl,
  tagKurz,
} from "@/lib/format/de";
import { plusTage } from "@/lib/kalender";
import { cn } from "@/lib/utils";
import { useDarlehenAuswertung } from "@/modules/darlehen/useDarlehen";
import { useImmobilienAuswertung } from "@/modules/immobilien/useImmobilien";
import { useBoardDaten, useGesellschaftsFilter } from "@/modules/shell/daten";
import { GesellschaftDetail } from "./GesellschaftDetail";
import {
  HORIZONT_MONATE,
  HORIZONT_TAGE,
  haupttreiber,
  kreisReihe,
  liquiditaetsAmpel,
  monatsVerlauf,
  tiefpunkt,
  tragbaresEk,
  type GesellschaftsLiquiditaet,
  type LiqKategorie,
  type MonatsZeile,
  type Szenario,
} from "./logik/liquiditaet";
import { useLiquiditaetAuswertung } from "./useLiquiditaet";

type Ansicht = "kurz" | "lang";

const MONATS_SPALTEN: Array<{
  id: string;
  label: string;
  kategorien: LiqKategorie[];
}> = [
  { id: "miete", label: "Mieten", kategorien: ["miete"] },
  {
    id: "kapitaldienst",
    label: "Kapitaldienst",
    kategorien: ["kapitaldienst", "darlehen_ic"],
  },
  {
    id: "objekte",
    label: "Objekte & Projekte",
    kategorien: ["bewirtschaftung", "projekt", "rechnung"],
  },
  { id: "verkauf", label: "Verkäufe", kategorien: ["verkauf"] },
  {
    id: "betrieb",
    label: "Personal & Steuern",
    kategorien: ["personal", "steuern", "sonstiges", "intercompany"],
  },
  { id: "szenario", label: "Szenario", kategorien: ["szenario"] },
];

export function LiquiditaetSeite() {
  const { data, isLoading, error } = useBoardDaten();
  const darlehen = useDarlehenAuswertung(data);
  const immobilien = useImmobilienAuswertung(data, darlehen);
  const filter = useGesellschaftsFilter();
  const search = useSearch({ from: "/board/liquiditaet" });
  const navigate = useNavigate({ from: "/board/liquiditaet" });
  const [ansicht, setAnsicht] = useState<Ansicht>("kurz");

  const stichtag = data?.stichtag ?? "";
  const [szAktiv, setSzAktiv] = useState(false);
  const [szEk, setSzEk] = useState("1.500.000");
  const [szDatum, setSzDatum] = useState("");
  const [szFirma, setSzFirma] = useState("c-mh");
  const szDatumWert = szDatum || (stichtag ? plusTage(stichtag, 70) : "");
  const szenario: Szenario | null = useMemo(() => {
    const ek = parseDeutscheZahl(szEk);
    return szAktiv && ek && ek > 0 && szDatumWert
      ? { ek, datum: szDatumWert, companyId: szFirma }
      : null;
  }, [szAktiv, szEk, szDatumWert, szFirma]);

  const { basis, mitSzenario } = useLiquiditaetAuswertung(
    data,
    darlehen,
    immobilien,
    szenario,
  );

  const kreis = useMemo(() => {
    if (!basis || !data) return null;
    const ids = filter.alle ? basis.freieIds : [filter.gesellschaft];
    const companies = data.companies.filter((c) => ids.includes(c.id));
    return {
      ids: new Set(ids),
      min: companies.reduce((s, c) => s + c.minLiquidity, 0),
      minFehlt: companies.filter((c) => !c.minLiquidityGesetzt).length,
      ohneSaldo: data.bankAccounts.filter(
        (k) => ids.includes(k.companyId) && !k.saldoBekannt,
      ).length,
      name: filter.alle
        ? "Gruppe (frei verfügbar)"
        : (companies[0]?.name ?? ""),
    };
  }, [basis, data, filter]);

  if (error)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Daten konnten nicht geladen werden"
        text={(error as Error).message}
      />
    );
  if (isLoading || !data || !basis || !kreis) return <SeitenSkelett />;

  const reihe = kreisReihe(basis.verlauf, kreis.ids);
  const reiheSz = mitSzenario
    ? kreisReihe(mitSzenario.verlauf, kreis.ids)
    : null;
  const kurz = reihe.slice(0, HORIZONT_TAGE + 1);
  const heute = reihe[0].wert;
  const in13 = kurz.at(-1)!.wert;
  const tief13 = tiefpunkt(kurz);
  const tief24 = tiefpunkt(reihe);
  const ampel = liquiditaetsAmpel(kreis.min, tief13.saldo, tief24.saldo);
  const monate = monatsVerlauf(
    heute,
    (mitSzenario ?? basis).bewegungen,
    kreis.ids,
    stichtag,
    HORIZONT_MONATE,
    true,
  );
  const monateBasis = mitSzenario
    ? monatsVerlauf(
        heute,
        basis.bewegungen,
        kreis.ids,
        stichtag,
        HORIZONT_MONATE,
        true,
      )
    : monate;

  const gesellschaften = basis.gesellschaften.filter((g) =>
    filter.passt(g.company.id),
  );
  const warnungen = gesellschaften
    .filter((g) => g.ampel !== "gruen")
    .sort((a, b) =>
      a.ampel === b.ampel
        ? (a.ersteUnterschreitung ?? "9").localeCompare(
            b.ersteUnterschreitung ?? "9",
          )
        : a.ampel === "rot"
          ? -1
          : 1,
    );

  const diagramm =
    ansicht === "kurz"
      ? kurz.map((p, i) => ({
          x: p.datum,
          basis: p.wert,
          ...(reiheSz ? { szenario: reiheSz[i].wert } : {}),
        }))
      : monateBasis.map((m, i) => ({
          x: `${m.monat}-01`,
          basis: m.saldoEnde,
          ...(mitSzenario ? { szenario: monate[i].saldoEnde } : {}),
        }));

  const tragbar = tragbaresEk(
    kreisReihe(basis.verlauf, filter.alle ? basis.freieIds : [szFirma]),
    szDatumWert,
    filter.alle
      ? basis.mindestFrei
      : (data.companies.find((c) => c.id === szFirma)?.minLiquidity ?? 0),
  );
  const tiefSz = reiheSz
    ? tiefpunkt(reiheSz.filter((p) => p.datum >= szDatumWert))
    : null;

  const offeneFirma = search.firma
    ? basis.gesellschaften.find((g) => g.company.id === search.firma)
    : undefined;
  const oeffne = (id: string | undefined) =>
    navigate({ search: { firma: id }, replace: true, resetScroll: false });

  const spalten: Spalte<GesellschaftsLiquiditaet>[] = [
    {
      id: "name",
      kopf: "Gesellschaft",
      zelle: (g) => (
        <div className="flex items-center gap-2">
          <AmpelPunkt ampel={g.ampel} />
          <div className="min-w-0">
            <div className="truncate font-medium">{g.company.name}</div>
            {g.company.separateArea ? (
              <div className="text-xs text-text-muted">getrennter Bereich</div>
            ) : null}
          </div>
        </div>
      ),
      sortierWert: (g) => g.company.name,
    },
    {
      id: "heute",
      kopf: "Heute",
      ausrichtung: "rechts",
      zelle: (g) => euro(g.heute),
      sortierWert: (g) => g.heute,
    },
    {
      id: "in13",
      kopf: "In 13 Wochen",
      ausrichtung: "rechts",
      zelle: (g) => euro(g.in13Wochen),
      sortierWert: (g) => g.in13Wochen,
    },
    {
      id: "tief13",
      kopf: "Tiefpunkt 13 W",
      ausrichtung: "rechts",
      zelle: (g) => (
        <div>
          <div
            className={cn(
              g.tief13.saldo < g.company.minLiquidity && "text-bad",
            )}
          >
            {euro(g.tief13.saldo)}
          </div>
          <div className="text-xs text-text-muted">{datum(g.tief13.datum)}</div>
        </div>
      ),
      sortierWert: (g) => g.tief13.saldo,
    },
    {
      id: "tief24",
      kopf: "Tiefpunkt 24 M",
      ausrichtung: "rechts",
      zelle: (g) => (
        <div>
          <div
            className={cn(
              g.tief24.saldo < g.company.minLiquidity && "text-bad",
            )}
          >
            {euro(g.tief24.saldo)}
          </div>
          <div className="text-xs text-text-muted">{datum(g.tief24.datum)}</div>
        </div>
      ),
      sortierWert: (g) => g.tief24.saldo,
      optional: true,
    },
    {
      id: "min",
      kopf: "Mindestliquidität",
      ausrichtung: "rechts",
      zelle: (g) =>
        g.company.minLiquidityGesetzt ? (
          euro(g.company.minLiquidity)
        ) : (
          <span className="text-xs text-warn">nicht festgelegt</span>
        ),
      sortierWert: (g) => g.company.minLiquidity,
      optional: true,
    },
    {
      id: "status",
      kopf: "Status",
      zelle: (g) => (
        <StatusBadge ampel={g.ampel}>
          {g.ampel === "rot"
            ? "Unterschreitung ≤ 13 W"
            : g.ampel === "gelb"
              ? g.ersteUnterschreitung
                ? `ab ${datum(g.ersteUnterschreitung)}`
                : "knapp"
              : "ausreichend"}
        </StatusBadge>
      ),
      sortierWert: (g) => ({ rot: 0, gelb: 1, gruen: 2, grau: 3 })[g.ampel],
    },
  ];

  return (
    <>
      <SeitenKopf
        titel="Liquidität"
        unterzeile={`${kreis.name} · Stand ${datum(stichtag)} · konsolidiert ohne interne Zahlungen${filter.alle ? ", ohne Maklerbereich" : ""}`}
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <BuehnenKennzahl
            label="Liquidität heute"
            wert={euroKompakt(heute)}
            hinweis={
              kreis.ohneSaldo
                ? `Daten fehlen: ${kreis.ohneSaldo} ${kreis.ohneSaldo > 1 ? "Konten" : "Konto"} ohne Saldo`
                : kreis.minFehlt
                  ? `Mindestliquidität bei ${kreis.minFehlt} nicht festgelegt`
                  : `Mindestens ${euroKompakt(kreis.min)}`
            }
            ampel={!kreis.ohneSaldo && heute < kreis.min ? "rot" : "grau"}
          />
          <BuehnenKennzahl
            label="In 13 Wochen"
            wert={euroKompakt(in13)}
            hinweis={`${in13 >= heute ? "+" : "−"}${euroKompakt(Math.abs(in13 - heute))} ggü. heute`}
          />
          <BuehnenKennzahl
            label="Tiefpunkt 13 Wochen"
            wert={euroKompakt(tief13.saldo)}
            hinweis={`am ${datum(tief13.datum)}`}
            ampel={
              tief13.saldo < kreis.min
                ? "rot"
                : tief13.saldo < 1.5 * kreis.min
                  ? "gelb"
                  : "gruen"
            }
          />
          <BuehnenKennzahl
            label="Tiefpunkt 24 Monate"
            wert={euroKompakt(tief24.saldo)}
            hinweis={`am ${datum(tief24.datum)}`}
            ampel={
              ampel === "rot"
                ? "rot"
                : tief24.saldo < kreis.min
                  ? "gelb"
                  : "gruen"
            }
          />
          <BuehnenKennzahl
            label="Warnungen"
            wert={String(warnungen.length)}
            hinweis={
              warnungen.length
                ? warnungen.map((w) => w.company.shortName).join(", ")
                : "alle Gesellschaften über Mindestliquidität"
            }
            ampel={
              warnungen.some((w) => w.ampel === "rot")
                ? "rot"
                : warnungen.length
                  ? "gelb"
                  : "gruen"
            }
          />
        </div>
      </SeitenKopf>

      <div className="mb-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Karte className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-heading">
                Liquiditätsverlauf
              </h2>
              <p className="text-xs text-text-muted">
                {ansicht === "kurz"
                  ? "Tagessalden der nächsten 13 Wochen"
                  : "Monatsendsalden der nächsten 24 Monate"}
                {mitSzenario ? " · gestrichelt: mit Ankauf" : ""}
              </p>
            </div>
            <Segmente
              label="Horizont"
              wert={ansicht}
              onChange={setAnsicht}
              optionen={[
                { wert: "kurz", label: "13 Wochen" },
                { wert: "lang", label: "24 Monate" },
              ]}
            />
          </div>
          <ZeitreihenDiagramm
            label="Liquiditätsverlauf"
            daten={diagramm}
            xSchluessel="x"
            xFormat={ansicht === "kurz" ? tagKurz : monatKurz}
            referenz={{ wert: kreis.min, label: "Mindestliquidität" }}
            hoehe={340}
            reihen={[
              {
                schluessel: "basis",
                label: "Plan",
                farbe: "var(--brand)",
                flaeche: true,
              },
              ...(mitSzenario
                ? [
                    {
                      schluessel: "szenario",
                      label: "Mit Ankauf",
                      farbe: "var(--warn)",
                      gestrichelt: true,
                    },
                  ]
                : []),
            ]}
          />
        </Karte>

        <Karte className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Calculator className="size-4 text-text-muted" aria-hidden />
            <h2 className="text-[15px] font-semibold text-heading">
              Szenario Ankauf
            </h2>
          </div>
          <p className="mb-4 text-xs text-text-muted">
            Eigenkapital für einen Ankauf an einem Datum. Das Board zeigt die
            zweite Linie und ob der Puffer hält.
          </p>
          <div className="space-y-3">
            <label className="block text-xs text-text-muted">
              Eigenkapital (€)
              <input
                inputMode="decimal"
                value={szEk}
                onChange={(e) => setSzEk(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-input bg-surface px-2.5 text-sm text-foreground tabular-nums outline-none focus:border-brand"
              />
            </label>
            <label className="block text-xs text-text-muted">
              Datum
              <input
                type="date"
                lang="de-DE"
                value={szDatumWert}
                min={plusTage(stichtag, 1)}
                max={basis.bis}
                onChange={(e) => setSzDatum(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-input bg-surface px-2.5 text-sm text-foreground outline-none focus:border-brand"
              />
            </label>
            <label className="block text-xs text-text-muted">
              Käufergesellschaft
              <select
                value={szFirma}
                onChange={(e) => setSzFirma(e.target.value)}
                className="mt-1 h-8 w-full cursor-pointer rounded-md border border-input bg-surface px-2 text-sm text-foreground outline-none"
              >
                {data.companies
                  .filter((c) => !c.separateArea)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <Knopf
              variante={szAktiv ? "sekundaer" : "primaer"}
              className="w-full"
              onClick={() => setSzAktiv((a) => !a)}
            >
              {szAktiv ? "Szenario ausblenden" : "Szenario berechnen"}
            </Knopf>
          </div>
          <div className="mt-4 bg-surface-muted p-3 text-sm">
            <div className="text-xs text-text-muted">
              Tragbares Eigenkapital am {datum(szDatumWert)}
            </div>
            <div className="mt-0.5 text-lg font-semibold text-heading tabular-nums">
              {euro(tragbar)}
            </div>
            {tiefSz ? (
              <p
                className={cn(
                  "mt-2 text-xs",
                  tiefSz.saldo < kreis.min ? "text-bad" : "text-ok",
                )}
              >
                {tiefSz.saldo < kreis.min
                  ? `Nicht tragbar: Tiefpunkt ${euro(tiefSz.saldo)} am ${datum(tiefSz.datum)}, ${euro(kreis.min - tiefSz.saldo)} unter Mindestliquidität.`
                  : `Tragbar: Tiefpunkt danach ${euro(tiefSz.saldo)} am ${datum(tiefSz.datum)}.`}
              </p>
            ) : (
              <p className="mt-2 text-xs text-text-muted">
                Höchster Einsatz, bei dem die Mindestliquidität bis zum Planende
                hält.
              </p>
            )}
          </div>
        </Karte>
      </div>

      {warnungen.length > 0 || basis.refinanzierungen.length > 0 ? (
        <Abschnitt
          titel="Warnungen"
          beschreibung="Unterschreitungen der Mindestliquidität mit Haupttreiber (größter Abfluss in den 30 Tagen davor)"
        >
          <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
            {warnungen.map((w) => {
              const t = w.ersteUnterschreitung
                ? haupttreiber(
                    basis.bewegungen,
                    new Set([w.company.id]),
                    w.ersteUnterschreitung,
                  )
                : null;
              return (
                <li key={w.company.id}>
                  <button
                    type="button"
                    onClick={() => oeffne(w.company.id)}
                    className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left text-sm hover:bg-surface-muted"
                  >
                    <AmpelPunkt ampel={w.ampel} className="mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-heading">
                        {w.company.name}
                        {w.ersteUnterschreitung
                          ? ` unterschreitet ${euroKompakt(w.company.minLiquidity)} ab ${datum(w.ersteUnterschreitung)}`
                          : ` bleibt knapp über ${euroKompakt(w.company.minLiquidity)}`}
                      </div>
                      <div className="mt-0.5 text-xs text-text-muted">
                        Tiefpunkt {euro(w.tief24.saldo)} am{" "}
                        {datum(w.tief24.datum)}
                        {w.luecke > 0 ? ` · Lücke ${euro(w.luecke)}` : ""}
                        {t
                          ? ` · Treiber: ${t.label} (${euro(t.betrag)} am ${datum(t.datum)})`
                          : ""}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
            {basis.refinanzierungen.map((r) => (
              <li
                key={r.loan.id}
                className="flex items-start gap-3 px-4 py-3 text-sm"
              >
                <AmpelPunkt ampel="gelb" className="mt-1.5" />
                <div>
                  <div className="font-medium text-heading">
                    Anschlussfinanzierung {r.loan.id} über {euro(r.betrag)} am{" "}
                    {datum(r.datum)} angenommen
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    Ohne Prolongation fließt der Betrag ab; Verhandlung
                    rechtzeitig starten.
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Abschnitt>
      ) : null}

      <Abschnitt
        titel="Gesellschaften"
        beschreibung="Bankbestand heute und Planverlauf je Gesellschaft; Zeile öffnet Konten und Zahlungen"
      >
        <DatenTabelle
          label="Liquidität je Gesellschaft"
          zeilen={gesellschaften}
          spalten={spalten}
          schluessel={(g) => g.company.id}
          onZeileKlick={(g) => oeffne(g.company.id)}
          aktiveZeile={search.firma}
          startSortierung={{ id: "status", richtung: "auf" }}
          fusszeile={
            <div className="flex justify-between">
              <span>{gesellschaften.length} Gesellschaften</span>
              <span className="tabular-nums">
                Summe heute{" "}
                {euro(gesellschaften.reduce((s, g) => s + g.heute, 0))}
              </span>
            </div>
          }
        />
      </Abschnitt>

      <Abschnitt
        titel="Monatsplan"
        beschreibung={`${kreis.name} · interne Umlagen und Darlehen zwischen Gruppengesellschaften eliminiert`}
      >
        <MonatsTabelle monate={monate} />
      </Abschnitt>

      <GesellschaftDetail
        g={offeneFirma}
        daten={data}
        auswertung={basis}
        onSchliessen={() => oeffne(undefined)}
      />
    </>
  );
}

function MonatsTabelle({ monate }: { monate: MonatsZeile[] }) {
  const spalten = MONATS_SPALTEN.filter((s) =>
    monate.some((m) => s.kategorien.some((k) => m.jeKategorie[k])),
  );
  const wert = (m: MonatsZeile, kategorien: LiqKategorie[]) =>
    kategorien.reduce((s, k) => s + (m.jeKategorie[k] ?? 0), 0);
  return (
    <div className="max-h-[520px] overflow-auto rounded-xl border border-hairline bg-surface">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
            <th className="h-9 px-4 text-left font-medium">Monat</th>
            {spalten.map((s) => (
              <th
                key={s.id}
                className="px-3 text-right font-medium whitespace-nowrap"
              >
                {s.label}
              </th>
            ))}
            <th className="px-3 text-right font-medium">Netto</th>
            <th className="px-4 text-right font-medium whitespace-nowrap">
              Saldo Monatsende
            </th>
          </tr>
        </thead>
        <tbody>
          {monate.map((m) => (
            <tr
              key={m.monat}
              className="border-t border-hairline first:border-t-0"
            >
              <td className="h-9 px-4 whitespace-nowrap">
                {monatKurz(`${m.monat}-01`)}
              </td>
              {spalten.map((s) => {
                const v = wert(m, s.kategorien);
                return (
                  <td
                    key={s.id}
                    className={cn(
                      "px-3 text-right whitespace-nowrap",
                      v === 0 && "text-text-subtle",
                    )}
                  >
                    {v === 0 ? "–" : euro(v)}
                  </td>
                );
              })}
              <td
                className={cn(
                  "px-3 text-right whitespace-nowrap",
                  m.netto < 0 && "text-bad",
                )}
              >
                {euro(m.netto)}
              </td>
              <td className="px-4 text-right font-medium whitespace-nowrap">
                {euro(m.saldoEnde)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
