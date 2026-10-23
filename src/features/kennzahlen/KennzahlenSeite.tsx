import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { PageWrapper, ContentSection } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatDate, formatEuro } from "@/lib/format";
import type { KennzahlenDto } from "@/lib/kennzahlen/types";
import { cn } from "@/lib/utils";

const ERSTES_JAHR = 2026;

const MONAT_KURZ = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

const chartConfig = {
  einnahmen: { label: "Einnahmen", color: "var(--chart-2)" },
  ausgaben: { label: "Ausgaben", color: "var(--chart-4)" },
  saldo: { label: "Liquidität", color: "var(--chart-1)" },
} satisfies ChartConfig;

function euroKurz(n: number): string {
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)} T€`;
  return `${Math.round(n)} €`;
}

function ibanFormatiert(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function Kachel({
  titel,
  wert,
  unterzeile,
  ton,
}: {
  titel: string;
  wert: string;
  unterzeile?: string;
  ton?: "gut" | "schlecht";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4">
      <span className="label-caps text-text-muted">{titel}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums text-heading",
          ton === "gut" && "text-chart-2",
          ton === "schlecht" && "text-danger",
        )}
      >
        {wert}
      </span>
      {unterzeile ? (
        <span className="text-xs text-text-muted">{unterzeile}</span>
      ) : null}
    </div>
  );
}

/** Kennzahlen des Maklerunternehmens aus den Bankbuchungen. */
export function KennzahlenSeite() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const aktuellesJahr = new Date().getFullYear();
  const [jahr, setJahr] = useState(aktuellesJahr);
  const [daten, setDaten] = useState<KennzahlenDto | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    setLaedt(true);
    try {
      const { kennzahlenLadenFn } = await import("@/lib/kennzahlen/server-fn");
      setDaten(
        await kennzahlenLadenFn({ data: { supabaseAccessToken: token, jahr } }),
      );
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLaedt(false);
    }
  }, [token, jahr]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const jahre = Array.from(
    { length: Math.max(1, aktuellesJahr - ERSTES_JAHR + 1) },
    (_, i) => aktuellesJahr - i,
  );

  const chartDaten = (daten?.monate ?? [])
    .filter((m) => m.saldo !== null || m.einnahmen || m.ausgaben)
    .map((m) => ({
      ...m,
      name: MONAT_KURZ[Number(m.monat.slice(5, 7)) - 1],
    }));

  const maxKategorie = Math.max(
    1,
    ...(daten?.kategorien ?? []).map((k) => k.betrag),
  );

  return (
    <>
      <PageHeader
        titel="Kennzahlen"
        beschreibung="Grenz & Co. Immobilienberatungs-GmbH · aus den Bankbuchungen, Beträge brutto"
        aktionen={
          <Select
            value={String(jahr)}
            onValueChange={(v) => setJahr(Number(v))}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jahre.map((j) => (
                <SelectItem key={j} value={String(j)}>
                  {j}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <PageWrapper>
        {!daten ? (
          <p className="text-sm text-text-muted">
            {laedt ? "Lädt…" : "Keine Daten."}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kachel
                titel="Liquidität"
                wert={formatEuro(daten.liquiditaet)}
                unterzeile={
                  daten.reichweiteMonate !== null
                    ? `reicht ca. ${daten.reichweiteMonate.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Monate`
                    : undefined
                }
              />
              <Kachel
                titel={`Provisionen ${daten.jahr}`}
                wert={formatEuro(daten.provisionBrutto)}
                unterzeile={`${daten.anzahlProvisionen} Abschlüsse · netto ${formatEuro(daten.provisionNetto)}`}
              />
              <Kachel
                titel={`Ausgaben ${daten.jahr}`}
                wert={formatEuro(daten.ausgaben)}
                unterzeile={`davon Steuern ${formatEuro(daten.steuern)} · Ø ${formatEuro(daten.kostenProMonat)}/Monat`}
              />
              <Kachel
                titel="Ergebnis (Cash)"
                wert={formatEuro(daten.ergebnis)}
                unterzeile="Einnahmen minus Ausgaben, ohne Umbuchungen"
                ton={daten.ergebnis >= 0 ? "gut" : "schlecht"}
              />
            </div>

            <ContentSection titel="Monatsverlauf">
              <div className="rounded-lg border border-hairline bg-surface p-4">
                <ChartContainer config={chartConfig} className="h-72 w-full">
                  <ComposedChart data={chartDaten}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis
                      yAxisId="fluss"
                      tickFormatter={euroKurz}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <YAxis
                      yAxisId="saldo"
                      orientation="right"
                      tickFormatter={euroKurz}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <div className="flex w-full justify-between gap-4">
                              <span className="text-text-muted">
                                {chartConfig[name as keyof typeof chartConfig]
                                  ?.label ?? name}
                              </span>
                              <span className="font-mono tabular-nums">
                                {formatEuro(Number(value))}
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      yAxisId="fluss"
                      dataKey="einnahmen"
                      fill="var(--color-einnahmen)"
                      radius={2}
                    />
                    <Bar
                      yAxisId="fluss"
                      dataKey="ausgaben"
                      fill="var(--color-ausgaben)"
                      radius={2}
                    />
                    <Line
                      yAxisId="saldo"
                      dataKey="saldo"
                      type="monotone"
                      stroke="var(--color-saldo)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ChartContainer>
              </div>
            </ContentSection>

            <div className="grid gap-6 xl:grid-cols-2">
              <ContentSection titel="Provisionen">
                <div className="overflow-x-auto border border-hairline">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-muted text-left text-xs text-text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Datum</th>
                        <th className="px-3 py-2 font-medium">
                          Zahler / Objekt
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Netto
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Brutto
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {daten.provisionen.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-3 text-text-muted">
                            Keine Provisionen in {daten.jahr}.
                          </td>
                        </tr>
                      ) : null}
                      {daten.provisionen.map((p) => (
                        <tr key={`${p.datum}-${p.zahler}-${p.brutto}`}>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {formatDate(p.datum)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-heading">{p.zahler}</div>
                            {p.objekt ? (
                              <div className="text-xs text-text-muted">
                                {p.objekt}
                              </div>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            {formatEuro(p.netto)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                            {formatEuro(p.brutto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ContentSection>

              <ContentSection titel="Ausgaben nach Kategorie">
                <ul className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface p-4">
                  {daten.kategorien.map((k) => (
                    <li
                      key={k.kategorie}
                      className="flex flex-col gap-1 text-sm"
                    >
                      <div className="flex justify-between gap-4">
                        <span className="text-heading">{k.label}</span>
                        <span className="tabular-nums">
                          {formatEuro(k.betrag)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-surface-muted">
                        <div
                          className="h-1.5 rounded-full bg-chart-4"
                          style={{
                            width: `${(k.betrag / maxKategorie) * 100}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </ContentSection>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ContentSection titel="Größte Zahlungsempfänger">
                <ul className="divide-y divide-hairline border border-hairline">
                  {daten.topEmpfaenger.map((e) => (
                    <li
                      key={e.name}
                      className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-heading">{e.name}</div>
                        <div className="text-xs text-text-muted">
                          {e.kategorie}
                        </div>
                      </div>
                      <span className="shrink-0 tabular-nums">
                        {formatEuro(e.betrag)}
                      </span>
                    </li>
                  ))}
                </ul>
              </ContentSection>

              <ContentSection titel="Konten">
                <ul className="divide-y divide-hairline border border-hairline">
                  {daten.konten.map((k) => (
                    <li
                      key={k.iban}
                      className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="text-heading">
                          {k.bezeichnung ?? "Konto"}
                        </div>
                        <div className="font-mono text-xs text-text-muted">
                          {ibanFormatiert(k.iban)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-medium tabular-nums text-heading">
                          {formatEuro(k.saldo)}
                        </div>
                        <div className="text-xs text-text-muted">
                          {k.saldoStichtag
                            ? `Stand ${formatDate(k.saldoStichtag)}`
                            : "–"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </ContentSection>
            </div>
          </>
        )}
      </PageWrapper>
    </>
  );
}
