import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
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

import {
  BalkenListe,
  EuroTooltip,
  Kachel,
  KachelReihe,
  Karte,
  Tabelle,
} from "./bausteine";
import { VIZ, euroKurz, monatLabel, zelle, zelleRechts } from "./hilfen";

const ERSTES_JAHR = 2025;

const flussConfig = {
  einnahmen: { label: "Einnahmen", color: VIZ[0] },
  ausgaben: { label: "Ausgaben", color: VIZ[1] },
} satisfies ChartConfig;

const saldoConfig = {
  saldo: { label: "Liquidität", color: VIZ[0] },
} satisfies ChartConfig;

const kumuliertConfig = {
  provisionen: { label: "Provisionen kumuliert", color: VIZ[0] },
  ausgaben: { label: "Ausgaben kumuliert", color: VIZ[1] },
} satisfies ChartConfig;

function ibanFormatiert(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function labels(config: ChartConfig): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [k, String(v.label ?? k)]),
  );
}

/** Finanzkennzahlen aus den Bankbuchungen. */
export function FinanzenTab() {
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

  const monate = (daten?.monate ?? [])
    .filter((m) => m.saldo !== null || m.einnahmen || m.ausgaben)
    .map((m) => ({ ...m, name: monatLabel(m.monat) }));

  const katConfig: ChartConfig = Object.fromEntries(
    (daten?.kategorienMonat.kategorien ?? []).map((k, i) => [
      k.schluessel,
      { label: k.label, color: VIZ[i % VIZ.length] },
    ]),
  );
  const katMonate = (daten?.kategorienMonat.monate ?? []).map((m) => ({
    ...m,
    name: monatLabel(String(m.monat)),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-muted">
          Aus den Bankbuchungen, Beträge brutto, ohne Umbuchungen zwischen den
          eigenen Konten.
        </p>
        <Select value={String(jahr)} onValueChange={(v) => setJahr(Number(v))}>
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
      </div>

      {!daten ? (
        <p className="text-sm text-text-muted">
          {laedt ? "Lädt…" : "Keine Daten."}
        </p>
      ) : (
        <>
          <KachelReihe>
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
              unterzeile={`${daten.anzahlProvisionen} Zahlungen · netto ${formatEuro(daten.provisionNetto)}`}
            />
            <Kachel
              titel={`Ausgaben ${daten.jahr}`}
              wert={formatEuro(daten.ausgaben)}
              unterzeile={`davon Steuern ${formatEuro(daten.steuern)} · Ø ${formatEuro(daten.kostenProMonat)}/Monat`}
            />
            <Kachel
              titel="Ergebnis (Cash)"
              wert={formatEuro(daten.ergebnis)}
              unterzeile="Einnahmen minus Ausgaben"
              ton={daten.ergebnis >= 0 ? "gut" : "schlecht"}
            />
          </KachelReihe>

          <KachelReihe>
            <Kachel
              titel="Fixkosten je Monat"
              wert={formatEuro(daten.fixkosten.fixProMonat)}
              unterzeile={`${daten.fixkosten.posten.length} wiederkehrende Empfänger`}
            />
            <Kachel
              titel="Fix vs. variabel"
              wert={`${formatEuro(daten.fixkosten.fixSumme)}`}
              unterzeile={`variabel ${formatEuro(daten.fixkosten.variabelSumme)} (ohne Steuern)`}
            />
            <Kachel
              titel="Break-even je Monat"
              wert={formatEuro(daten.kostenProMonat * 1.19)}
              unterzeile="nötige Bruttoprovision, um Ø-Kosten zu decken"
            />
            <Kachel
              titel="Deckung bisher"
              wert={
                daten.ausgaben > 0
                  ? `${Math.round((daten.provisionBrutto / daten.ausgaben) * 100)} %`
                  : "–"
              }
              unterzeile="Provisionen ÷ Ausgaben im Jahr"
              ton={daten.provisionBrutto >= daten.ausgaben ? "gut" : "schlecht"}
            />
          </KachelReihe>

          <div className="grid gap-6 xl:grid-cols-2">
            <Karte titel="Einnahmen und Ausgaben je Monat">
              <ChartContainer config={flussConfig} className="h-64 w-full">
                <BarChart data={monate} barGap={2}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={euroKurz}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <ChartTooltip
                    content={<EuroTooltip labels={labels(flussConfig)} />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="einnahmen"
                    fill="var(--color-einnahmen)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="ausgaben"
                    fill="var(--color-ausgaben)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </Karte>

            <Karte
              titel="Liquidität am Monatsende"
              hinweis="Alle Konten, aus dem aktuellen Saldo zurückgerechnet."
            >
              <ChartContainer config={saldoConfig} className="h-64 w-full">
                <LineChart data={monate}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={euroKurz}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <ChartTooltip
                    content={<EuroTooltip labels={labels(saldoConfig)} />}
                  />
                  <Line
                    dataKey="saldo"
                    type="monotone"
                    stroke="var(--color-saldo)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ChartContainer>
            </Karte>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Karte
              titel="Provisionen vs. Ausgaben (laufende Summe)"
              hinweis="Liegt die blaue Linie über der orangen, tragen die Provisionen das Jahr."
            >
              <ChartContainer config={kumuliertConfig} className="h-64 w-full">
                <LineChart
                  data={daten.kumuliert.map((k) => ({
                    ...k,
                    name: monatLabel(k.monat),
                  }))}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={euroKurz}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <ChartTooltip
                    content={<EuroTooltip labels={labels(kumuliertConfig)} />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    dataKey="provisionen"
                    type="stepAfter"
                    stroke="var(--color-provisionen)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="ausgaben"
                    type="monotone"
                    stroke="var(--color-ausgaben)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </Karte>

            <Karte titel="Ausgaben je Monat nach Kategorie">
              <ChartContainer config={katConfig} className="h-64 w-full">
                <BarChart data={katMonate}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={euroKurz}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <ChartTooltip
                    content={<EuroTooltip labels={labels(katConfig)} />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  {daten.kategorienMonat.kategorien.map((k) => (
                    <Bar
                      key={k.schluessel}
                      dataKey={k.schluessel}
                      stackId="a"
                      fill={`var(--color-${k.schluessel})`}
                      stroke="var(--surface)"
                      strokeWidth={1}
                    />
                  ))}
                </BarChart>
              </ChartContainer>
            </Karte>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Karte titel="Ausgaben nach Kategorie">
              <BalkenListe
                zeilen={daten.kategorien.map((k) => ({
                  name: k.label,
                  wert: k.betrag,
                }))}
                format={formatEuro}
                farbe={VIZ[1]}
              />
            </Karte>
            <Karte
              titel="Wiederkehrende Kosten"
              hinweis="Empfänger, die in mindestens drei Monaten bezahlt wurden."
            >
              <Tabelle
                kopf={[
                  { titel: "Empfänger" },
                  { titel: "Monate", rechts: true },
                  { titel: "Ø/Monat", rechts: true },
                ]}
                leer={
                  daten.fixkosten.posten.length
                    ? null
                    : "Keine wiederkehrenden Zahlungen."
                }
              >
                {daten.fixkosten.posten.map((p) => (
                  <tr key={p.name}>
                    <td className="max-w-48 truncate px-2 py-2" title={p.name}>
                      <div className="truncate text-heading">{p.name}</div>
                      <div className="text-xs text-text-muted">
                        {p.kategorie}
                      </div>
                    </td>
                    <td className={zelleRechts}>{p.monate}</td>
                    <td className={zelleRechts}>{formatEuro(p.proMonat)}</td>
                  </tr>
                ))}
              </Tabelle>
            </Karte>
            <Karte titel="Größte Zahlungsempfänger">
              <BalkenListe
                zeilen={daten.topEmpfaenger.map((e) => ({
                  name: e.name,
                  wert: e.betrag,
                  zusatz: e.kategorie,
                }))}
                format={formatEuro}
                farbe={VIZ[1]}
              />
            </Karte>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Karte titel="Provisionen" className="xl:col-span-2">
              <Tabelle
                kopf={[
                  { titel: "Datum" },
                  { titel: "Zahler / Objekt" },
                  { titel: "Netto", rechts: true },
                  { titel: "Brutto", rechts: true },
                ]}
                leer={
                  daten.provisionen.length
                    ? null
                    : `Keine Provisionen in ${daten.jahr}.`
                }
              >
                {daten.provisionen.map((p) => (
                  <tr key={`${p.datum}-${p.zahler}-${p.brutto}`}>
                    <td className={zelle}>{formatDate(p.datum)}</td>
                    <td className="px-2 py-2">
                      <div className="text-heading">{p.zahler}</div>
                      {p.objekt ? (
                        <div className="text-xs text-text-muted">
                          {p.objekt}
                        </div>
                      ) : null}
                    </td>
                    <td className={zelleRechts}>{formatEuro(p.netto)}</td>
                    <td className={`${zelleRechts} font-medium`}>
                      {formatEuro(p.brutto)}
                    </td>
                  </tr>
                ))}
              </Tabelle>
            </Karte>
            <Karte titel="Provisionen nach Zahler">
              <BalkenListe
                zeilen={daten.provisionsZahler.map((z) => ({
                  name: z.name,
                  wert: z.brutto,
                  zusatz: z.anzahl > 1 ? `${z.anzahl}×` : undefined,
                }))}
                format={formatEuro}
                leer="Keine Provisionen."
              />
            </Karte>
          </div>

          <Karte titel="Konten">
            <ul className="divide-y divide-hairline">
              {daten.konten.map((k) => (
                <li
                  key={k.iban}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
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
          </Karte>
        </>
      )}
    </div>
  );
}
