import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Info } from "lucide-react";
import { useMemo } from "react";
import {
  Abschnitt,
  BuehnenKennzahl,
  Karte,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import {
  datum,
  euroGanz,
  euroKompakt,
  flaeche,
  prozent,
} from "@/lib/format/de";
import { cn } from "@/lib/utils";
import { CF_KATEGORIEN } from "@/modules/cashflow/logik/einordnung";
import { useBoardDaten } from "@/modules/shell/daten";
import {
  aufteilerAuswerten,
  SZENARIEN,
  type AufteilerStand,
  type KostenPosition,
} from "./logik/aufteiler";
import type { Szenario } from "./logik/plaene";

const SZENARIO_LABEL: Record<Szenario, string> = {
  best: "Best Case",
  base: "Base Case",
  worst: "Worst Case",
};

const KOSTEN: Array<{ k: KostenPosition; label: string; hinweis: string }> = [
  {
    k: "grundstueck",
    label: "Grundstückskosten inkl. Erwerbsnebenkosten",
    hinweis: "Kaufpreis, Grunderwerbsteuer, Notar, Grundbuch, Makler",
  },
  {
    k: "bau",
    label: "Baukosten inkl. BauNK und Reserve",
    hinweis: "Sanierung und Handwerker",
  },
  {
    k: "finanzierung",
    label: "Projektfinanzierung",
    hinweis: "Zinsen der Objektdarlehen",
  },
  {
    k: "sonstige",
    label: "Sonstige Nebenkosten",
    hinweis: "Beratung, Verwaltung, Vermarktung",
  },
];

const TH = "px-3 text-right font-medium whitespace-nowrap";

export function AufteilerSeite() {
  const { data, isLoading, error } = useBoardDaten();
  const search = useSearch({ from: "/board/aufteiler" });
  const navigate = useNavigate({ from: "/board/aufteiler" });
  const projekte = useMemo(
    () => (data ? aufteilerAuswerten(data) : null),
    [data],
  );

  if (error)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Daten konnten nicht geladen werden"
        text={(error as Error).message}
      />
    );
  if (isLoading || !data || !projekte) return <SeitenSkelett />;

  const aktiv = projekte.find((p) => p.plan.objektId === search.projekt);
  const waehle = (id: string | undefined) =>
    navigate({
      search: { projekt: id },
      replace: true,
      resetScroll: false,
    });
  const summe = (f: (p: AufteilerStand) => number) =>
    projekte.reduce((s, p) => s + f(p), 0);

  return (
    <>
      <SeitenKopf
        titel="Aufteilerprojekte"
        unterzeile="Plan aus den Kalkulationen gegen Ist aus den Bankumsätzen: was investiert ist, was noch kommt und was am Ende übrig bleibt."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <BuehnenKennzahl
            label="Gesamtinvestition Plan"
            wert={euroKompakt(summe((p) => p.investitionPlan))}
            hinweis={`${projekte.length} Projekte`}
          />
          <BuehnenKennzahl
            label="Investiert bisher"
            wert={euroKompakt(summe((p) => p.ist.investition))}
            hinweis={`${prozent(summe((p) => p.ist.investition) / summe((p) => p.investitionPlan), 0)} vom Plan`}
          />
          <BuehnenKennzahl
            label="Verkaufserlös Base"
            wert={euroKompakt(summe((p) => p.erloes.base))}
            hinweis={`bisher erhalten ${euroKompakt(summe((p) => p.ist.verkauf))}`}
          />
          <BuehnenKennzahl
            label="Erwarteter Gewinn Base"
            wert={euroKompakt(summe((p) => p.gewinn.base))}
            hinweis={`Worst ${euroKompakt(summe((p) => p.gewinn.worst))} · Best ${euroKompakt(summe((p) => p.gewinn.best))}`}
            ampel={summe((p) => p.gewinn.worst) > 0 ? "gruen" : "gelb"}
          />
        </div>
      </SeitenKopf>

      <div className="nicht-drucken mb-6">
        <Segmente
          label="Projekt"
          wert={aktiv?.plan.objektId ?? "uebersicht"}
          onChange={(id) => waehle(id === "uebersicht" ? undefined : id)}
          optionen={[
            { wert: "uebersicht", label: "Übersicht" },
            ...projekte.map((p) => ({
              wert: p.plan.objektId,
              label: p.plan.name,
            })),
          ]}
        />
      </div>

      {aktiv ? (
        <Projekt p={aktiv} />
      ) : (
        <Uebersicht projekte={projekte} onWaehle={waehle} />
      )}
    </>
  );
}

function Uebersicht({
  projekte,
  onWaehle,
}: {
  projekte: AufteilerStand[];
  onWaehle: (id: string) => void;
}) {
  const summe = (f: (p: AufteilerStand) => number) =>
    projekte.reduce((s, p) => s + f(p), 0);
  const investPlan = summe((p) => p.investitionPlan);
  const investIst = summe((p) => p.ist.investition);
  return (
    <Abschnitt
      titel="Alle Projekte"
      beschreibung="Ein Projekt je Zeile. Zeile anklicken für Kosten, Wohnungen und Buchungen des Projekts."
    >
      <Karte className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
              <th className="h-9 px-3 text-left font-medium">Projekt</th>
              <th className={TH}>Gesamtinvestition</th>
              <th className="w-36 px-3 text-left font-medium">
                Investiert bisher
              </th>
              <th className={TH}>Erlös Base</th>
              <th className={TH}>Gewinn Worst</th>
              <th className={TH}>Gewinn Base</th>
              <th className={TH}>Gewinn Best</th>
              <th className={TH}>Marge Base</th>
              <th className={TH}>Verkauft bisher</th>
            </tr>
          </thead>
          <tbody>
            {projekte.map((p) => (
              <tr
                key={p.plan.objektId}
                onClick={() => onWaehle(p.plan.objektId)}
                className="cursor-pointer shadow-[inset_0_-1px_0_var(--hairline)] hover:bg-surface-muted/60"
              >
                <td className="h-12 px-3">
                  <div className="font-medium text-heading">{p.plan.name}</div>
                  <div className="text-xs text-text-muted">
                    {p.plan.einheiten.length} Wohnungen ·{" "}
                    {flaeche(Math.round(p.flaeche))}
                    {p.plan.kosten.finanzierung == null
                      ? " · ohne Finanzierungskosten"
                      : ""}
                  </div>
                </td>
                <td className="px-3 text-right">
                  {euroGanz(p.investitionPlan)}
                </td>
                <td className="px-3">
                  <div className="mb-1 text-right text-xs">
                    {euroGanz(p.ist.investition)}{" "}
                    <span className="text-text-muted">
                      ({prozent(p.ist.investition / p.investitionPlan, 0)})
                    </span>
                  </div>
                  <Balken anteil={p.ist.investition / p.investitionPlan} />
                </td>
                <td className="px-3 text-right">{euroGanz(p.erloes.base)}</td>
                <td
                  className={cn(
                    "px-3 text-right",
                    p.gewinn.worst < 0 && "text-bad",
                  )}
                >
                  {euroGanz(p.gewinn.worst)}
                </td>
                <td className="px-3 text-right font-semibold text-heading">
                  {euroGanz(p.gewinn.base)}
                </td>
                <td className="px-3 text-right">{euroGanz(p.gewinn.best)}</td>
                <td className="px-3 text-right">{prozent(p.marge.base, 1)}</td>
                <td className="px-3 text-right">{euroGanz(p.ist.verkauf)}</td>
              </tr>
            ))}
            <tr className="bg-surface-muted/40 font-semibold text-heading">
              <td className="h-10 px-3">Summe</td>
              <td className="px-3 text-right">{euroGanz(investPlan)}</td>
              <td className="px-3 text-right text-xs">
                {euroGanz(investIst)} ({prozent(investIst / investPlan, 0)})
              </td>
              <td className="px-3 text-right">
                {euroGanz(summe((p) => p.erloes.base))}
              </td>
              <td className="px-3 text-right">
                {euroGanz(summe((p) => p.gewinn.worst))}
              </td>
              <td className="px-3 text-right">
                {euroGanz(summe((p) => p.gewinn.base))}
              </td>
              <td className="px-3 text-right">
                {euroGanz(summe((p) => p.gewinn.best))}
              </td>
              <td className="px-3 text-right">
                {prozent(summe((p) => p.gewinn.base) / investPlan, 1)}
              </td>
              <td className="px-3 text-right">
                {euroGanz(summe((p) => p.ist.verkauf))}
              </td>
            </tr>
          </tbody>
        </table>
      </Karte>
    </Abschnitt>
  );
}

function Balken({ anteil }: { anteil: number }) {
  const w = Math.max(0, Math.min(1, anteil));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <div
        className={cn(
          "h-full rounded-full",
          anteil > 1 ? "bg-bad" : "bg-brand",
        )}
        style={{ width: `${w * 100}%` }}
      />
    </div>
  );
}

function Projekt({ p }: { p: AufteilerStand }) {
  const k = p.plan.kosten;
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <BuehnenKennzahl
          label="Gesamtinvestition"
          wert={euroKompakt(p.investitionPlan)}
          hinweis={`${euroGanz(p.kostenJeQm)} je m² · ${flaeche(Math.round(p.flaeche))}`}
        />
        <BuehnenKennzahl
          label="Investiert bisher"
          wert={euroKompakt(p.ist.investition)}
          hinweis={`${prozent(p.investitionPlan ? p.ist.investition / p.investitionPlan : 0, 0)} vom Plan`}
        />
        <BuehnenKennzahl
          label="Gewinn Base Case"
          wert={euroKompakt(p.gewinn.base)}
          hinweis={`Marge ${prozent(p.marge.base, 1)}${k.finanzierung == null ? " · vor Finanzierung" : ""}`}
          ampel={p.gewinn.worst > 0 ? "gruen" : "gelb"}
        />
        <BuehnenKennzahl
          label="Ergebnis bisher"
          wert={euroKompakt(p.ergebnisBisher)}
          hinweis={`Verkäufe ${euroKompakt(p.ist.verkauf)} · Mieten ${euroKompakt(p.ist.mieten)}`}
        />
      </div>

      <Abschnitt
        titel="Investitionskosten"
        beschreibung="Plan aus der Kalkulation, Ist aus den Bankumsätzen dieses Objekts."
      >
        <Karte className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
                <th className="h-9 px-3 text-left font-medium">Position</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Ist bisher</th>
                <th className={TH}>Offen</th>
                <th className="w-40 px-3 text-left font-medium">Fortschritt</th>
              </tr>
            </thead>
            <tbody>
              {KOSTEN.map(({ k: pos, label, hinweis }) => {
                const plan = k[pos];
                const ist = p.ist[pos];
                return (
                  <tr
                    key={pos}
                    className="shadow-[inset_0_-1px_0_var(--hairline)]"
                  >
                    <td className="h-11 px-3">
                      <div className="text-foreground">{label}</div>
                      <div className="text-xs text-text-muted">{hinweis}</div>
                    </td>
                    <td className="px-3 text-right">
                      {plan == null ? (
                        <span className="text-warn">fehlt</span>
                      ) : (
                        euroGanz(plan)
                      )}
                    </td>
                    <td className="px-3 text-right">{euroGanz(ist)}</td>
                    <td
                      className={cn(
                        "px-3 text-right",
                        plan != null && ist > plan && "text-bad",
                      )}
                    >
                      {plan == null ? "–" : euroGanz(plan - ist)}
                    </td>
                    <td className="px-3">
                      {plan ? <Balken anteil={ist / plan} /> : null}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-surface-muted/40 font-semibold text-heading">
                <td className="h-10 px-3">Gesamtinvestition</td>
                <td className="px-3 text-right">
                  {euroGanz(p.investitionPlan)}
                </td>
                <td className="px-3 text-right">
                  {euroGanz(p.ist.investition)}
                </td>
                <td className="px-3 text-right">
                  {euroGanz(p.investitionPlan - p.ist.investition)}
                </td>
                <td className="px-3">
                  <Balken anteil={p.ist.investition / p.investitionPlan} />
                </td>
              </tr>
            </tbody>
          </table>
        </Karte>
      </Abschnitt>

      <Abschnitt
        titel="Verkauf und Gewinn"
        beschreibung={`Erwartete Verkaufspreise je Wohnung. Gewinn = Verkaufserlös minus Gesamtinvestition${k.finanzierung == null ? " (ohne Finanzierungskosten, die fehlen in der Kalkulation)" : ""}.`}
      >
        <Karte className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
                <th className="h-9 px-3 text-left font-medium">Einheit</th>
                <th className={TH}>Fläche</th>
                {SZENARIEN.map((s) => (
                  <th key={s} className={TH}>
                    {SZENARIO_LABEL[s]}
                  </th>
                ))}
                <th className={TH}>€/m² Base</th>
              </tr>
            </thead>
            <tbody>
              {p.plan.einheiten.map((e) => (
                <tr
                  key={e.label}
                  className="shadow-[inset_0_-1px_0_var(--hairline)]"
                >
                  <td className="h-10 px-3 text-foreground">{e.label}</td>
                  <td className="px-3 text-right text-text-muted">
                    {flaeche(Math.round(e.flaeche * 10) / 10)}
                  </td>
                  {SZENARIEN.map((s) => (
                    <td
                      key={s}
                      className={cn(
                        "px-3 text-right",
                        s === "base" && "font-medium text-heading",
                      )}
                    >
                      {euroGanz(e.preis[s])}
                    </td>
                  ))}
                  <td className="px-3 text-right text-text-muted">
                    {euroGanz(e.preis.base / e.flaeche)}
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-muted/40 font-medium text-heading shadow-[inset_0_-1px_0_var(--hairline)]">
                <td className="h-10 px-3">Verkaufserlös</td>
                <td className="px-3 text-right">
                  {flaeche(Math.round(p.flaeche))}
                </td>
                {SZENARIEN.map((s) => (
                  <td key={s} className="px-3 text-right">
                    {euroGanz(p.erloes[s])}
                  </td>
                ))}
                <td className="px-3 text-right">
                  {euroGanz(p.erloes.base / p.flaeche)}
                </td>
              </tr>
              <tr className="shadow-[inset_0_-1px_0_var(--hairline)]">
                <td className="h-10 px-3 text-text-muted">
                  − Gesamtinvestition
                </td>
                <td />
                {SZENARIEN.map((s) => (
                  <td key={s} className="px-3 text-right text-text-muted">
                    {euroGanz(-p.investitionPlan)}
                  </td>
                ))}
                <td />
              </tr>
              <tr className="font-semibold text-heading">
                <td className="h-10 px-3">Gewinn</td>
                <td />
                {SZENARIEN.map((s) => (
                  <td
                    key={s}
                    className={cn(
                      "px-3 text-right",
                      p.gewinn[s] < 0 && "text-bad",
                    )}
                  >
                    {euroGanz(p.gewinn[s])}
                    <div className="text-[11px] font-normal text-text-muted">
                      {prozent(p.marge[s], 1)}
                    </div>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </Karte>
      </Abschnitt>

      <Abschnitt
        titel="Hinweise zur Kalkulation"
        beschreibung={`Quelle: ${p.plan.quelle}`}
      >
        <Karte className="p-4">
          <ul className="space-y-2 text-sm">
            {p.plan.hinweise.map((h) => (
              <li key={h} className="flex gap-2 text-text-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-text" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </Karte>
      </Abschnitt>

      <Abschnitt
        titel="Buchungen des Projekts"
        beschreibung={`Alle Bankumsätze, die diesem Objekt zugeordnet sind${p.datenAb ? `, Bankdaten ab ${datum(p.datenAb)}` : ""}.`}
      >
        <Karte className="max-h-[520px] overflow-auto">
          {p.posten.length ? (
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
                  <th className="h-9 px-3 text-left font-medium">Datum</th>
                  <th className="px-3 text-left font-medium">Gegenpartei</th>
                  <th className="px-3 text-left font-medium">
                    Verwendungszweck
                  </th>
                  <th className="px-3 text-left font-medium">Kategorie</th>
                  <th className={TH}>Betrag</th>
                </tr>
              </thead>
              <tbody>
                {p.posten.map((x, i) => (
                  <tr
                    key={`${x.txId}-${i}`}
                    className="shadow-[inset_0_-1px_0_var(--hairline)]"
                  >
                    <td className="h-9 px-3 whitespace-nowrap text-text-muted">
                      {datum(x.datum)}
                    </td>
                    <td
                      className="max-w-56 truncate px-3"
                      title={x.gegenpartei}
                    >
                      {x.gegenpartei || "–"}
                    </td>
                    <td
                      className="max-w-96 truncate px-3 text-xs text-text-muted"
                      title={x.zweck}
                    >
                      {x.zweck}
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      {CF_KATEGORIEN[x.kategorie].label}
                    </td>
                    <td
                      className={cn(
                        "px-3 text-right whitespace-nowrap",
                        x.betrag < 0 ? "text-bad" : "text-foreground",
                      )}
                    >
                      {euroGanz(x.betrag)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm text-text-muted">
              Noch keine Buchungen zugeordnet.
            </p>
          )}
        </Karte>
      </Abschnitt>
    </>
  );
}
