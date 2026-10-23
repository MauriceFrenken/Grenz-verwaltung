import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatDate, formatEuro, formatInt } from "@/lib/format";
import type { MaklerDto } from "@/lib/steuerung/types";

import {
  AnzahlTooltip,
  BalkenListe,
  EuroTooltip,
  Kachel,
  KachelReihe,
  Karte,
  Tabelle,
} from "./bausteine";
import {
  VIZ,
  euroKurz,
  monatLabel,
  prozent,
  zelle,
  zelleRechts,
} from "./hilfen";

const aktivitaetConfig = {
  Akquisebrief: { label: "Akquisebrief", color: VIZ[0] },
  Anruf: { label: "Anruf", color: VIZ[1] },
  "E-Mail": { label: "E-Mail", color: VIZ[2] },
  Aufgabe: { label: "Aufgabe", color: VIZ[3] },
} satisfies ChartConfig;

const dealsConfig = {
  kaufpreis: { label: "Vermittelter Kaufpreis", color: VIZ[0] },
} satisfies ChartConfig;

const umsatzConfig = {
  umsatz: { label: "Umsatz", color: VIZ[0] },
  kosten: { label: "Kosten", color: VIZ[1] },
  ergebnis: { label: "Ergebnis", color: VIZ[2] },
} satisfies ChartConfig;

const phaseConfig = {
  anzahl: { label: "Mandate", color: VIZ[0] },
} satisfies ChartConfig;
const funnelConfig = {
  anzahl: { label: "Kontakte", color: VIZ[0] },
} satisfies ChartConfig;
const quartalConfig = {
  anzahl: { label: "Neue Mandate", color: VIZ[0] },
} satisfies ChartConfig;

function labels(config: ChartConfig): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [k, String(v.label ?? k)]),
  );
}

/** Abgeschlossene Phasen grau, offene in der Akzentfarbe. */
function phasenFarbe(phase: string): string {
  if (phase === "Gewonnen") return VIZ[2];
  if (phase === "Verloren") return VIZ[1];
  if (phase === "Interne Übergabe" || phase === "ohne Phase")
    return "var(--chart-5)";
  return VIZ[0];
}

/** Maklergeschäft: Mandate, Deals, Vermarktung, Aktivität, Abschlusszahlen. */
export function MaklerTab() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [daten, setDaten] = useState<MaklerDto | null>(null);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    if (!token) return;
    let aktiv = true;
    setLaedt(true);
    void (async () => {
      try {
        const { maklerKennzahlenLadenFn } =
          await import("@/lib/steuerung/server-fn");
        const d = await maklerKennzahlenLadenFn({
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

  const k = daten.kacheln;
  const funnelMax = daten.funnel[0]?.anzahl || 1;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-text-muted">
        Stand {formatDate(daten.stand)} · Quelle: Salesforce-Auszug,
        Jahresabschluss 2025, BWA Q3 2026 ({daten.quellen.join(", ")}). Neue
        Stände werden ergänzt, ältere bleiben gespeichert.
      </p>

      <KachelReihe>
        <Kachel
          titel="Provision in der Pipeline"
          wert={formatEuro(k.pipelineProvision)}
          unterzeile={`${k.beauftragt} beauftragte Mandate · ${k.beauftragtOhnePreis} ohne Preis`}
        />
        <Kachel
          titel="Exposé-Volumen beauftragt"
          wert={euroKurz(k.pipelinePreise)}
          unterzeile="Summe der Exposé-Preise mit Preisangabe"
        />
        <Kachel
          titel="Vermittelter Kaufpreis"
          wert={euroKurz(k.vermittelterKaufpreis)}
          unterzeile={`${k.verkaeufe} Verkäufe · ${k.offeneDeals} offene Deals`}
        />
        <Kachel
          titel="Gewinnquote Mandate"
          wert={prozent(k.gewinnquote)}
          unterzeile="gewonnen ÷ (gewonnen + verloren)"
        />
      </KachelReihe>

      <div className="grid gap-6 xl:grid-cols-2">
        <Karte titel="Mandate nach Phase" hinweis="Ohne Testdatensätze.">
          <ChartContainer config={phaseConfig} className="h-64 w-full">
            <BarChart
              data={daten.phasen}
              layout="vertical"
              margin={{ left: 8, right: 32 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="phase"
                tickLine={false}
                axisLine={false}
                width={112}
              />
              <ChartTooltip
                content={<AnzahlTooltip labels={labels(phaseConfig)} />}
              />
              <Bar dataKey="anzahl" radius={[0, 4, 4, 0]}>
                {daten.phasen.map((p) => (
                  <Cell key={p.phase} fill={phasenFarbe(p.phase)} />
                ))}
                <LabelList
                  dataKey="anzahl"
                  position="right"
                  className="fill-heading"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </Karte>

        <Karte titel="Neue Mandate je Quartal">
          <ChartContainer config={quartalConfig} className="h-64 w-full">
            <BarChart data={daten.mandateJeQuartal} margin={{ top: 20 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="quartal" tickLine={false} axisLine={false} />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ChartTooltip
                content={<AnzahlTooltip labels={labels(quartalConfig)} />}
              />
              <Bar
                dataKey="anzahl"
                fill="var(--color-anzahl)"
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="anzahl"
                  position="top"
                  className="fill-heading"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </Karte>
      </div>

      <Karte
        titel="Pipeline: beauftragte Mandate"
        hinweis="Sortiert nach prognostizierter Provision. Fehlende Preise sind Pflegelücken in Salesforce."
      >
        <Tabelle
          kopf={[
            { titel: "Mandat" },
            { titel: "Objekt" },
            { titel: "Art" },
            { titel: "Betreuer" },
            { titel: "Exposé-Preis", rechts: true },
            { titel: "Satz", rechts: true },
            { titel: "Provision", rechts: true },
          ]}
          leer={daten.pipeline.length ? null : "Keine beauftragten Mandate."}
        >
          {daten.pipeline.map((p) => (
            <tr key={p.mandat}>
              <td className={`${zelle} font-mono text-xs`}>{p.mandat}</td>
              <td className="px-2 py-2 text-heading">{p.objekt}</td>
              <td className={`${zelle} text-text-muted`}>{p.art ?? "–"}</td>
              <td className={`${zelle} text-text-muted`}>
                {p.betreuer ?? "–"}
              </td>
              <td className={zelleRechts}>
                {p.preis ? formatEuro(p.preis) : "–"}
              </td>
              <td className={zelleRechts}>{prozent(p.provisionProzent, 1)}</td>
              <td className={`${zelleRechts} font-medium`}>
                {p.provision ? formatEuro(p.provision) : "–"}
              </td>
            </tr>
          ))}
        </Tabelle>
      </Karte>

      <div className="grid gap-6 xl:grid-cols-2">
        <Karte
          titel="Vermarktungs-Funnel"
          hinweis="Alle Vermarktungskampagnen zusammen. Jede Stufe zählt alle, die mindestens so weit kamen."
        >
          <ChartContainer config={funnelConfig} className="h-56 w-full">
            <BarChart
              data={daten.funnel}
              layout="vertical"
              margin={{ left: 8, right: 64 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="stufe"
                tickLine={false}
                axisLine={false}
                width={96}
              />
              <ChartTooltip
                content={<AnzahlTooltip labels={labels(funnelConfig)} />}
              />
              <Bar
                dataKey="anzahl"
                fill="var(--color-anzahl)"
                radius={[0, 4, 4, 0]}
              >
                <LabelList
                  dataKey="anzahl"
                  content={(props) => {
                    const x = Number(props.x) + Number(props.width) + 6;
                    const y = Number(props.y) + Number(props.height) / 2;
                    const v = Number(props.value);
                    return (
                      <text
                        x={x}
                        y={y}
                        dominantBaseline="middle"
                        className="fill-heading text-xs"
                      >
                        {`${formatInt(v)} · ${Math.round((v / funnelMax) * 100)} %`}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </Karte>

        <Karte
          titel="Vermittelter Kaufpreis je Jahr"
          hinweis="Deals mit Status „Invoice Paid“."
        >
          <ChartContainer config={dealsConfig} className="h-56 w-full">
            <BarChart data={daten.dealsJeJahr} margin={{ top: 20 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="jahr" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={euroKurz}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <ChartTooltip
                content={<EuroTooltip labels={labels(dealsConfig)} />}
              />
              <Bar
                dataKey="kaufpreis"
                fill="var(--color-kaufpreis)"
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="kaufpreis"
                  position="top"
                  className="fill-heading"
                  formatter={(v: number) => euroKurz(v)}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          <p className="text-xs text-text-muted">
            {daten.dealsJeJahr
              .map(
                (d) =>
                  `${d.jahr}: ${d.gewonnen} gewonnen, ${d.verloren} verloren`,
              )
              .join(" · ")}
          </p>
        </Karte>
      </div>

      <Karte titel="Kampagnen je Objekt">
        <Tabelle
          kopf={[
            { titel: "Objekt" },
            { titel: "Status" },
            { titel: "Start" },
            { titel: "Kontakte", rechts: true },
            { titel: "Interesse", rechts: true },
            { titel: "Besichtigung", rechts: true },
            { titel: "Angebot", rechts: true },
            { titel: "Absage", rechts: true },
            { titel: "Interesse-Quote", rechts: true },
          ]}
          leer={daten.kampagnen.length ? null : "Keine Kampagnen."}
        >
          {daten.kampagnen.map((c) => {
            const weiter = c.interesse + c.besichtigung + c.angebot;
            return (
              <tr key={c.name}>
                <td className="px-2 py-2 text-heading">{c.name}</td>
                <td className={`${zelle} text-text-muted`}>{c.status}</td>
                <td className={zelle}>{formatDate(c.start)}</td>
                <td className={zelleRechts}>{c.kontakte}</td>
                <td className={zelleRechts}>{c.interesse || "–"}</td>
                <td className={zelleRechts}>{c.besichtigung || "–"}</td>
                <td className={zelleRechts}>{c.angebot || "–"}</td>
                <td className={zelleRechts}>{c.absage || "–"}</td>
                <td className={zelleRechts}>
                  {c.kontakte ? prozent((weiter / c.kontakte) * 100) : "–"}
                </td>
              </tr>
            );
          })}
        </Tabelle>
      </Karte>

      <Karte
        titel="Vertriebsaktivität je Monat"
        hinweis="Aufgaben, Akquisebriefe, Anrufe und E-Mails in Salesforce."
      >
        <ChartContainer config={aktivitaetConfig} className="h-72 w-full">
          <BarChart
            data={daten.aktivitaet.map((a) => ({
              ...a,
              name: monatLabel(a.monat, true),
            }))}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              interval={1}
            />
            <YAxis tickLine={false} axisLine={false} width={40} />
            <ChartTooltip
              content={<AnzahlTooltip labels={labels(aktivitaetConfig)} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            {Object.keys(aktivitaetConfig).map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={`var(--color-${key})`}
                stroke="var(--surface)"
                strokeWidth={1}
              />
            ))}
          </BarChart>
        </ChartContainer>
        <div className="grid gap-2 sm:grid-cols-4">
          {daten.aktivitaetSummen.map((s) => (
            <div key={s.typ} className="text-sm">
              <div className="text-text-muted">{s.typ}</div>
              <div className="tabular-nums text-heading">
                {formatInt(s.jahr)}{" "}
                <span className="text-xs text-text-muted">
                  (Vorjahr {formatInt(s.vorjahr)})
                </span>
              </div>
            </div>
          ))}
        </div>
      </Karte>

      <div className="grid gap-6 xl:grid-cols-2">
        <Karte
          titel="Umsatz, Kosten, Ergebnis"
          hinweis="Aus Jahresabschluss 2025 und BWA Q3 2026 (netto, nach Buchhaltung)."
        >
          <ChartContainer config={umsatzConfig} className="h-64 w-full">
            <BarChart data={daten.umsatzVergleich} barGap={2}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="zeitraum" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={euroKurz}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <ChartTooltip
                content={<EuroTooltip labels={labels(umsatzConfig)} />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="umsatz"
                fill="var(--color-umsatz)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="kosten"
                fill="var(--color-kosten)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="ergebnis"
                fill="var(--color-ergebnis)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </Karte>

        <Karte titel="Abschlusszahlen">
          <Tabelle
            kopf={[{ titel: "Kennzahl" }, { titel: "Wert", rechts: true }]}
          >
            {daten.finanzen.map((f) => (
              <tr key={f.kennzahl}>
                <td className="px-2 py-2">
                  <div className="text-heading">{f.kennzahl}</div>
                  <div className="text-xs text-text-muted">
                    {f.quelle}
                    {f.hinweis ? ` · ${f.hinweis}` : ""}
                  </div>
                </td>
                <td className={zelleRechts}>
                  {f.einheit === "EUR"
                    ? formatEuro(f.wert)
                    : `${f.wert.toLocaleString("de-DE")} ${f.einheit}`}
                </td>
              </tr>
            ))}
          </Tabelle>
        </Karte>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Karte
          titel="Objekte im Ordner"
          hinweis={`${daten.objekte.gesamt} Objektordner in OneDrive`}
        >
          <BalkenListe
            zeilen={daten.objekte.jeStatus.map((s) => ({
              name: s.name,
              wert: s.anzahl,
            }))}
          />
        </Karte>
        <Karte
          titel="Salesforce-Abgleich"
          hinweis="Wie gut sind die Objektordner in Salesforce gepflegt?"
        >
          <BalkenListe
            zeilen={daten.objekte.jeSalesforce.map((s) => ({
              name: s.name,
              wert: s.anzahl,
            }))}
            farbe={VIZ[1]}
          />
        </Karte>
        <Karte titel="Objekte nach Ort">
          <BalkenListe
            zeilen={daten.objekte.jeOrt.map((s) => ({
              name: s.name,
              wert: s.anzahl,
            }))}
            farbe={VIZ[2]}
          />
        </Karte>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Karte titel="Deals">
          <Tabelle
            kopf={[
              { titel: "Datum" },
              { titel: "Deal" },
              { titel: "Phase" },
              { titel: "Kaufpreis", rechts: true },
            ]}
          >
            {daten.deals.map((d) => (
              <tr key={`${d.name}-${d.datum}`}>
                <td className={zelle}>{formatDate(d.datum)}</td>
                <td className="px-2 py-2 text-heading">{d.name}</td>
                <td className={`${zelle} text-text-muted`}>{d.phase}</td>
                <td className={zelleRechts}>
                  {d.kaufpreis ? formatEuro(d.kaufpreis) : "–"}
                </td>
              </tr>
            ))}
          </Tabelle>
        </Karte>
        <div className="flex flex-col gap-6">
          <Karte titel="Gesellschaft">
            <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
              {daten.gesellschaft.map((g) => (
                <div key={g.feld} className="contents">
                  <dt className="text-text-muted">{g.feld}</dt>
                  <dd className="text-heading">{g.wert}</dd>
                </div>
              ))}
            </dl>
          </Karte>
          <Karte titel="Finanzunterlagen">
            <Tabelle
              kopf={[
                { titel: "Unterlage" },
                { titel: "Jahr" },
                { titel: "Status" },
              ]}
            >
              {daten.finanzunterlagen.map((f) => (
                <tr key={f.unterlage}>
                  <td className="px-2 py-2">
                    <div className="text-heading">{f.unterlage}</div>
                    {f.hinweis ? (
                      <div className="text-xs text-text-muted">{f.hinweis}</div>
                    ) : null}
                  </td>
                  <td className={zelle}>{f.jahr}</td>
                  <td
                    className={`${zelle} ${f.status === "fehlt" ? "text-danger" : "text-text-muted"}`}
                  >
                    {f.status}
                  </td>
                </tr>
              ))}
            </Tabelle>
          </Karte>
        </div>
      </div>
    </div>
  );
}
