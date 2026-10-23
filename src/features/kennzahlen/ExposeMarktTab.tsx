import { Fragment, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { toast } from "sonner";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { ExposeAnalyseDto } from "@/lib/expose-analyse/types";
import { formatDate, formatEuro, formatInt, formatNumber } from "@/lib/format";

import {
  AnzahlTooltip,
  BalkenListe,
  Kachel,
  KachelReihe,
  Karte,
  Tabelle,
} from "./bausteine";
import { VIZ, euroKurz, prozent, zahl1, zelle, zelleRechts } from "./hilfen";

const wochenConfig = {
  anzahl: { label: "Exposés", color: VIZ[0] },
  exportiert: { label: "nach Salesforce", color: VIZ[2] },
} satisfies ChartConfig;

const klassenConfig = {
  anzahl: { label: "Exposés", color: VIZ[0] },
} satisfies ChartConfig;
const streuungConfig = {
  mieteQm: { label: "Miete je m²", color: VIZ[0] },
} satisfies ChartConfig;

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function KlassenChart({
  daten,
}: {
  daten: Array<{ name: string; anzahl: number }>;
}) {
  return (
    <ChartContainer config={klassenConfig} className="h-48 w-full">
      <BarChart data={daten} margin={{ top: 16 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip
          content={<AnzahlTooltip labels={{ anzahl: "Exposés" }} />}
        />
        <Bar dataKey="anzahl" fill="var(--color-anzahl)" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="anzahl" position="top" className="fill-heading" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Wochentag × Uhrzeit der Exposé-Eingänge, Deckkraft = Anzahl. */
function Heatmap({ werte }: { werte: number[][] }) {
  const max = Math.max(1, ...werte.flat());
  const stunden = Array.from({ length: 15 }, (_, i) => i + 6); // 6–20 Uhr
  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-[2px] text-[10px] text-text-muted"
        style={{
          gridTemplateColumns: `2rem repeat(${stunden.length}, minmax(1.25rem, 1fr))`,
        }}
      >
        <span />
        {stunden.map((h) => (
          <span key={h} className="text-center">
            {h % 2 === 0 ? h : ""}
          </span>
        ))}
        {TAGE.map((tag, t) => (
          <Fragment key={tag}>
            <span className="self-center">{tag}</span>
            {stunden.map((h) => {
              const n = werte[t]?.[h] ?? 0;
              return (
                <span
                  key={h}
                  title={`${tag} ${h}–${h + 1} Uhr: ${n} Exposé${n === 1 ? "" : "s"}`}
                  className="aspect-square rounded-[3px] bg-surface-muted"
                  style={
                    n
                      ? { background: VIZ[0], opacity: 0.25 + (0.75 * n) / max }
                      : undefined
                  }
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Markt-Sicht auf die eingegangenen Ankauf-Exposés. */
export function ExposeMarktTab() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [daten, setDaten] = useState<ExposeAnalyseDto | null>(null);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    if (!token) return;
    let aktiv = true;
    setLaedt(true);
    void (async () => {
      try {
        const { exposeAnalyseLadenFn } =
          await import("@/lib/expose-analyse/server-fn");
        const d = await exposeAnalyseLadenFn({
          data: { supabaseAccessToken: token },
        });
        if (aktiv) setDaten(d);
      } catch (err) {
        toast.error(apiFehlermeldung(err));
      } finally {
        if (aktiv) setLaedt(false);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [token]);

  if (!daten) {
    return (
      <p className="text-sm text-text-muted">
        {laedt ? "Lädt…" : "Keine Daten."}
      </p>
    );
  }
  if (daten.anzahl === 0) {
    return (
      <p className="text-sm text-text-muted">Noch keine Exposés eingegangen.</p>
    );
  }

  const wochen = daten.wochen.length || 1;
  const wochenDaten = daten.wochen.map((w) => ({
    ...w,
    name: formatDate(w.woche).slice(0, 6),
  }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-text-muted">
        Exposés aus dem Ankauf-Postfach, per KI ausgelesen (
        {formatDate(daten.erstesDatum)} bis {formatDate(daten.letztesDatum)}).
        Werte so, wie sie in den Exposés stehen.
      </p>

      <KachelReihe>
        <Kachel
          titel="Exposés"
          wert={formatInt(daten.anzahl)}
          unterzeile={`Ø ${zahl1(daten.anzahl / wochen)} je Woche · ${daten.exportiert} nach Salesforce`}
        />
        <Kachel
          titel="Angebotene Jahresmiete"
          wert={euroKurz(daten.mieteGesamt)}
          unterzeile={`aus ${daten.mitMiete} Exposés · ${formatInt(daten.flaecheGesamt)} m²`}
        />
        <Kachel
          titel="Median Faktor"
          wert={
            daten.medianFaktor !== null
              ? `${zahl1(daten.medianFaktor)}-fach`
              : "–"
          }
          unterzeile={
            daten.medianRendite !== null
              ? `≈ ${prozent(daten.medianRendite, 1)} Bruttorendite · ${daten.mitPreis} mit Preis`
              : `nur ${daten.mitPreis} Exposés mit Preis`
          }
        />
        <Kachel
          titel="Median Miete je m²"
          wert={
            daten.medianMieteQm !== null
              ? `${formatNumber(daten.medianMieteQm)} €`
              : "–"
          }
          unterzeile={
            daten.medianPreisQm !== null
              ? `Kaufpreis Median ${formatEuro(daten.medianPreisQm).replace(",00", "")}/m²`
              : "Kaltmiete monatlich"
          }
        />
      </KachelReihe>

      <Karte titel="Eingänge je Woche">
        <ChartContainer config={wochenConfig} className="h-64 w-full">
          <BarChart data={wochenDaten} barGap={2}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <ChartTooltip
              content={
                <AnzahlTooltip
                  labels={{ anzahl: "Exposés", exportiert: "nach Salesforce" }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="anzahl"
              fill="var(--color-anzahl)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="exportiert"
              fill="var(--color-exportiert)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </Karte>

      <div className="grid gap-6 xl:grid-cols-3">
        <Karte titel="Objektart">
          <BalkenListe
            zeilen={daten.objektarten.map((o) => ({
              name: o.name,
              wert: o.anzahl,
            }))}
          />
        </Karte>
        <Karte titel="Baujahr">
          <KlassenChart daten={daten.baujahre} />
        </Karte>
        <Karte titel="Größe (Wohneinheiten)">
          <KlassenChart daten={daten.groessen} />
        </Karte>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Karte titel="Städte" hinweis="Stadtteile sind der Stadt zugeordnet.">
          <Tabelle
            kopf={[
              { titel: "Stadt" },
              { titel: "Exposés", rechts: true },
              { titel: "Jahresmiete", rechts: true },
              { titel: "Miete/m²", rechts: true },
              { titel: "Faktor", rechts: true },
            ]}
          >
            {daten.staedte.map((s) => (
              <tr key={s.name}>
                <td className="px-2 py-2 text-heading">{s.name}</td>
                <td className={zelleRechts}>{s.anzahl}</td>
                <td className={zelleRechts}>
                  {s.miete ? euroKurz(s.miete) : "–"}
                </td>
                <td className={zelleRechts}>
                  {s.medianMieteQm !== null
                    ? `${formatNumber(s.medianMieteQm)} €`
                    : "–"}
                </td>
                <td className={zelleRechts}>
                  {s.medianFaktor !== null ? zahl1(s.medianFaktor) : "–"}
                </td>
              </tr>
            ))}
          </Tabelle>
        </Karte>

        <Karte titel="Makler" hinweis="Wer schickt die meisten Angebote?">
          <Tabelle
            kopf={[
              { titel: "Makler" },
              { titel: "Exposés", rechts: true },
              { titel: "Jahresmiete", rechts: true },
              { titel: "Faktor", rechts: true },
            ]}
          >
            {daten.makler.map((m) => (
              <tr key={m.name}>
                <td className="px-2 py-2">
                  <div className="text-heading">{m.name}</div>
                  {m.staedte.length ? (
                    <div className="text-xs text-text-muted">
                      {m.staedte.join(", ")}
                    </div>
                  ) : null}
                </td>
                <td className={zelleRechts}>{m.anzahl}</td>
                <td className={zelleRechts}>
                  {m.miete ? euroKurz(m.miete) : "–"}
                </td>
                <td className={zelleRechts}>
                  {m.medianFaktor !== null ? zahl1(m.medianFaktor) : "–"}
                </td>
              </tr>
            ))}
          </Tabelle>
        </Karte>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Karte
          titel="Fläche und Miete je m²"
          hinweis="Jeder Punkt ein Exposé, Punktgröße = Jahresmiete."
          className="xl:col-span-2"
        >
          <ChartContainer config={streuungConfig} className="h-72 w-full">
            <ScatterChart margin={{ top: 8, right: 16 }}>
              <CartesianGrid />
              <XAxis
                type="number"
                dataKey="flaeche"
                name="Fläche"
                tickFormatter={(v: number) => `${formatInt(v)} m²`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                dataKey="mieteQm"
                name="Miete je m²"
                tickFormatter={(v: number) => `${v} €`}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <ZAxis type="number" dataKey="miete" range={[40, 400]} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(_v, _n, item) => {
                      const p =
                        item.payload as ExposeAnalyseDto["streuung"][number];
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-heading">
                            {p.label}
                          </span>
                          <span>
                            {formatInt(p.flaeche)} m² ·{" "}
                            {formatNumber(p.mieteQm)} €/m²
                          </span>
                          <span>Jahresmiete {formatEuro(p.miete)}</span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Scatter
                data={daten.streuung}
                fill="var(--color-mieteQm)"
                fillOpacity={0.7}
                stroke="var(--surface)"
                strokeWidth={1}
              />
            </ScatterChart>
          </ChartContainer>
        </Karte>
        <div className="flex flex-col gap-6">
          <Karte titel="Energieklasse">
            <KlassenChart daten={daten.energie.filter((e) => e.anzahl > 0)} />
          </Karte>
          <Karte
            titel="Wann kommen Exposés?"
            hinweis="Wochentag und Uhrzeit des Eingangs."
          >
            <Heatmap werte={daten.heatmap} />
          </Karte>
        </div>
      </div>

      <Karte titel="Alle Exposés">
        <Tabelle
          kopf={[
            { titel: "Eingang" },
            { titel: "Objekt" },
            { titel: "Art" },
            { titel: "Makler" },
            { titel: "WE", rechts: true },
            { titel: "m²", rechts: true },
            { titel: "Baujahr", rechts: true },
            { titel: "Jahresmiete", rechts: true },
            { titel: "Preis", rechts: true },
            { titel: "Faktor", rechts: true },
          ]}
        >
          {daten.objekte.map((o) => (
            <tr key={o.id}>
              <td className={zelle}>{formatDate(o.eingegangenAm)}</td>
              <td className="px-2 py-2">
                <div className="text-heading">{o.adresse ?? "–"}</div>
                <div className="text-xs text-text-muted">
                  {o.stadt ?? ""}
                  {o.exportiert ? " · in Salesforce" : ""}
                </div>
              </td>
              <td className={`${zelle} text-text-muted`}>
                {o.objektart ?? "–"}
              </td>
              <td
                className="max-w-40 truncate px-2 py-2 text-text-muted"
                title={o.makler ?? ""}
              >
                {o.makler ?? "–"}
              </td>
              <td className={zelleRechts}>{o.einheiten ?? "–"}</td>
              <td className={zelleRechts}>
                {o.flaeche ? formatInt(o.flaeche) : "–"}
              </td>
              <td className={zelleRechts}>{o.baujahr ?? "–"}</td>
              <td className={zelleRechts}>
                {o.miete ? formatEuro(o.miete) : "–"}
              </td>
              <td className={zelleRechts}>
                {o.preis ? euroKurz(o.preis) : "–"}
              </td>
              <td className={zelleRechts}>
                {o.faktor !== null ? zahl1(o.faktor) : "–"}
              </td>
            </tr>
          ))}
        </Tabelle>
      </Karte>
    </div>
  );
}
