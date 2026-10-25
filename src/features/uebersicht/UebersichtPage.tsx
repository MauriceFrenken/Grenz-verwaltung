import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  ChartColumn,
  CircleDot,
  FileText,
  Inbox,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AnzahlTooltip,
  EuroTooltip,
  Kachel,
  KachelReihe,
  Karte,
} from "@/features/kennzahlen/bausteine";
import { VIZ, euroKurz, monatLabel } from "@/features/kennzahlen/hilfen";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatDate, formatInt } from "@/lib/format";
import type { KennzahlenDto } from "@/lib/kennzahlen/types";
import type { UebersichtDto, ZuTun } from "@/lib/uebersicht/berechnen";
import { cn } from "@/lib/utils";

const aktivitaetConfig = {
  Anruf: { label: "Anruf", color: VIZ[0] },
  "E-Mail": { label: "E-Mail", color: VIZ[1] },
  Termin: { label: "Termin", color: VIZ[2] },
  Aufgabe: { label: "Aufgabe", color: VIZ[3] },
} satisfies ChartConfig;

const provisionConfig = {
  provisionen: { label: "Provisionseingang", color: VIZ[0] },
} satisfies ChartConfig;

function labels(config: ChartConfig): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [k, String(v.label ?? k)]),
  );
}

function tagesgruss(): string {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

/** „+3 ggü. 4 Wochen davor“ */
function vergleich(jetzt: number, vorher: number): string {
  const diff = jetzt - vorher;
  const zeichen = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return `${zeichen}${Math.abs(diff)} ggü. 4 Wochen davor`;
}

function wocheLabel(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

/** Startseite: das Geschäft von Grenz & Co. auf einen Blick. */
export function UebersichtPage() {
  const { benutzer, session } = useAuth();
  const token = session?.access_token ?? "";
  const vorname = benutzer?.name?.trim().split(/\s+/)[0];
  const [daten, setDaten] = useState<UebersichtDto | null>(null);
  const [finanzen, setFinanzen] = useState<KennzahlenDto | null>(null);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    if (!token) return;
    let aktiv = true;
    setLaedt(true);
    void (async () => {
      const [u, k] = await Promise.allSettled([
        import("@/lib/uebersicht/server-fn").then(({ uebersichtLadenFn }) =>
          uebersichtLadenFn({ data: { supabaseAccessToken: token } }),
        ),
        import("@/lib/kennzahlen/server-fn").then(({ kennzahlenLadenFn }) =>
          kennzahlenLadenFn({
            data: {
              supabaseAccessToken: token,
              jahr: new Date().getFullYear(),
            },
          }),
        ),
      ]);
      if (!aktiv) return;
      if (u.status === "fulfilled") setDaten(u.value);
      else toast.error(apiFehlermeldung(u.reason));
      if (k.status === "fulfilled") setFinanzen(k.value);
      setLaedt(false);
    })();
    return () => {
      aktiv = false;
    };
  }, [token]);

  const datum = new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <header className="hairline-b flex shrink-0 flex-col gap-1 border-b border-hairline bg-surface px-8 py-6">
        <span className="label-caps text-text-muted">{datum}</span>
        <h1 className="text-2xl font-semibold tracking-tight text-heading">
          {tagesgruss()}
          {vorname ? `, ${vorname}` : ""}
        </h1>
        <p className="text-sm text-text-muted">
          Was heute ansteht, was gerade läuft und wie sich das Geschäft
          entwickelt.
        </p>
      </header>
      <PageWrapper>
        {!daten ? (
          <p className="text-sm text-text-muted">
            {laedt ? "Lädt…" : "Keine Daten."}
          </p>
        ) : (
          <Dashboard daten={daten} finanzen={finanzen} />
        )}
      </PageWrapper>
    </>
  );
}

function Dashboard({
  daten,
  finanzen,
}: {
  daten: UebersichtDto;
  finanzen: KennzahlenDto | null;
}) {
  const k = daten.kacheln;
  const jahr = daten.heute.slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      {daten.salesforceLeer ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn-soft p-4 text-sm">
          <span className="flex items-center gap-2 text-heading">
            <RefreshCw className="size-4" strokeWidth={1.5} />
            Noch keine Salesforce-Daten abgerufen. Mandate, Interessenten und
            Aktivitäten erscheinen nach dem ersten Abruf.
          </span>
          <Link
            to="/einstellungen/integrationen"
            className="font-medium text-brand-text hover:underline"
          >
            Jetzt abrufen
          </Link>
        </div>
      ) : null}

      <KachelReihe>
        <Kachel
          titel="Provision in der Pipeline"
          wert={euroKurz(k.provisionPipeline)}
          unterzeile={`aus ${k.mandateMitProvision} beauftragten Mandaten mit Preis`}
        />
        <Kachel
          titel="Aktive Mandate"
          wert={formatInt(k.aktiveMandate)}
          unterzeile={`${k.neueMandate4W} neu in 4 Wochen (${vergleich(k.neueMandate4W, k.neueMandateVor4W)})`}
        />
        <Kachel
          titel={`Provision ${jahr} (Abschlüsse)`}
          wert={euroKurz(k.provisionJahr)}
          unterzeile={`${k.abschluesseJahr} ${k.abschluesseJahr === 1 ? "Verkauf" : "Verkäufe"} · ${euroKurz(k.kaufpreisJahr)} Kaufpreis vermittelt`}
        />
        <Kachel
          titel="Offene Interessenten"
          wert={formatInt(k.offeneInteressenten)}
          unterzeile={`${k.imDatenraum} im Datenraum`}
        />
      </KachelReihe>

      <div className="grid gap-6 lg:grid-cols-5">
        <Karte
          titel="Heute zu tun"
          hinweis="Vorgänge, bei denen wir den nächsten Schritt machen – Warnungen zuerst."
          className="lg:col-span-3"
        >
          <ZuTunListe eintraege={daten.zuTun} />
        </Karte>
        <Karte
          titel="Mandats-Pipeline"
          hinweis="Offene Mandate nach Phase, Volumen = Summe der Exposé-Preise."
          className="lg:col-span-2"
        >
          <Pipeline daten={daten} />
        </Karte>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Karte
          titel="Vertriebsaktivität"
          hinweis={`Salesforce-Aktivitäten je Woche · ${daten.aktivitaetGesamt4W} in den letzten 4 Wochen (${vergleich(daten.aktivitaetGesamt4W, daten.aktivitaetVor4W)})`}
          className="lg:col-span-3"
        >
          <ChartContainer config={aktivitaetConfig} className="h-64 w-full">
            <BarChart data={daten.aktivitaetWochen}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="woche"
                tickLine={false}
                axisLine={false}
                tickFormatter={wocheLabel}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ChartTooltip
                labelFormatter={(w) => `Woche ab ${wocheLabel(String(w))}`}
                content={<AnzahlTooltip labels={labels(aktivitaetConfig)} />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {Object.keys(aktivitaetConfig).map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={`var(--color-${key})`}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </Karte>
        <Karte
          titel="Letzte Aktivität"
          hinweis="Neueste Anrufe, E-Mails, Termine und Aufgaben"
          className="lg:col-span-2"
        >
          <AktivitaetsListe daten={daten} />
        </Karte>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Karte
          titel="Größte beauftragte Mandate"
          hinweis="Nach erwarteter Provision"
          className="lg:col-span-3"
        >
          <TopMandate daten={daten} />
        </Karte>
        <Karte
          titel="Letzte Abschlüsse"
          hinweis="Verkäufe mit bezahlter Rechnung"
          className="lg:col-span-2"
        >
          {daten.abschluesse.length === 0 ? (
            <p className="text-sm text-text-muted">Noch keine Abschlüsse.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {daten.abschluesse.map((a) => (
                <li
                  key={a.name}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-heading">
                      {a.name.replace(/^Opp\.\s*/, "")}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatDate(a.datum)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-semibold tabular-nums text-heading">
                      {a.provision ? euroKurz(a.provision) : "–"}
                    </span>
                    <span className="text-xs tabular-nums text-text-muted">
                      {a.kaufpreis ? `${euroKurz(a.kaufpreis)} KP` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Karte>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Karte
          titel={`Liquidität und Provisionseingang ${jahr}`}
          hinweis="Aus den Bankumsätzen (EBICS / Kontoauszüge)"
          className="lg:col-span-3"
        >
          {finanzen ? (
            <Finanzen finanzen={finanzen} />
          ) : (
            <p className="text-sm text-text-muted">Keine Bankdaten.</p>
          )}
        </Karte>
        <Karte
          titel="Markt & Schnellzugriff"
          hinweis="Ein Klick öffnet die passende Liste."
          className="lg:col-span-2"
        >
          <Schnellzugriff daten={daten} />
        </Karte>
      </div>

      <p className="text-xs text-text-muted">
        Quelle: Salesforce (Stand{" "}
        {daten.letzterAbruf
          ? new Date(daten.letzterAbruf).toLocaleString("de-DE", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "–"}
        , täglicher Abruf) · Testdatensätze ausgeblendet.
      </p>
    </div>
  );
}

function ZuTunListe({ eintraege }: { eintraege: ZuTun[] }) {
  if (eintraege.length === 0)
    return (
      <p className="text-sm text-text-muted">
        Nichts offen – alle Vorgänge laufen.
      </p>
    );
  return (
    <ul className="-mx-4 divide-y divide-hairline">
      {eintraege.slice(0, 9).map((e, i) => {
        const inhalt: ReactNode = (
          <>
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-md",
                e.ton === "warnung"
                  ? "bg-warn-soft text-warn"
                  : "bg-brand-soft text-brand-text",
              )}
            >
              {e.ton === "warnung" ? (
                <AlertTriangle className="size-4" strokeWidth={1.5} />
              ) : (
                <CircleDot className="size-4" strokeWidth={1.5} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-heading group-hover:text-brand-text">
                {e.titel}
              </span>
              <span className="block truncate text-xs text-text-muted">
                {e.text}
              </span>
            </span>
            <ArrowRight
              className="size-3.5 shrink-0 text-text-subtle transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </>
        );
        const klasse =
          "group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted";
        return (
          <li key={`${e.titel}-${i}`}>
            {e.mandatSfId ? (
              <Link
                to="/mandate/$sfId"
                params={{ sfId: e.mandatSfId }}
                className={klasse}
              >
                {inhalt}
              </Link>
            ) : (
              <Link to={e.pfad ?? "/mandate"} className={klasse}>
                {inhalt}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Pipeline({ daten }: { daten: UebersichtDto }) {
  const gesamt = daten.mandatsPhasen.reduce((s, p) => s + p.anzahl, 0);
  const abgeschlossen = daten.gewonnen + daten.verloren;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
        {daten.mandatsPhasen.map((p, i) =>
          p.anzahl ? (
            <div
              key={p.phase}
              style={{
                width: `${(p.anzahl / Math.max(1, gesamt)) * 100}%`,
                background: VIZ[i],
              }}
              title={`${p.phase}: ${p.anzahl}`}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {daten.mandatsPhasen.map((p, i) => (
          <li key={p.phase} className="flex items-center gap-3 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: VIZ[i] }}
            />
            <span className="flex-1 text-heading">{p.phase}</span>
            <span className="w-20 text-right text-xs tabular-nums text-text-muted">
              {p.volumen ? euroKurz(p.volumen) : "–"}
            </span>
            <span className="w-8 text-right font-semibold tabular-nums text-heading">
              {p.anzahl}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-3 text-sm">
        <div>
          <span className="label-caps text-text-muted">Gewonnen</span>
          <p className="font-semibold tabular-nums text-chart-2">
            {daten.gewonnen}
          </p>
        </div>
        <div>
          <span className="label-caps text-text-muted">Gewinnquote</span>
          <p className="font-semibold tabular-nums text-heading">
            {abgeschlossen
              ? `${Math.round((daten.gewonnen / abgeschlossen) * 100)} %`
              : "–"}
          </p>
        </div>
      </div>
      {daten.interessentenPhasen.length ? (
        <div className="border-t border-hairline pt-3">
          <span className="label-caps text-text-muted">
            Interessenten nach Phase
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {daten.interessentenPhasen.map((p) => (
              <span
                key={p.phase}
                className="rounded-full border border-hairline px-2.5 py-0.5 text-xs text-heading"
              >
                {p.phase} · {p.anzahl}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AktivitaetsListe({ daten }: { daten: UebersichtDto }) {
  if (daten.letzteAktivitaeten.length === 0)
    return <p className="text-sm text-text-muted">Noch keine Aktivität.</p>;
  return (
    <ul className="divide-y divide-hairline">
      {daten.letzteAktivitaeten.map((a, i) => (
        <li key={i} className="flex items-start gap-3 py-2 text-sm">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-heading" title={a.betreff}>
              {a.betreff}
            </span>
            <span className="block truncate text-xs text-text-muted">
              {a.art}
              {a.mandat ? (
                <>
                  {" · "}
                  <Link
                    to="/mandate/$sfId"
                    params={{ sfId: a.mandatSfId ?? "" }}
                    className="hover:text-brand-text hover:underline"
                  >
                    {a.mandat}
                  </Link>
                </>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 text-xs tabular-nums text-text-muted">
            {formatDate(a.datum.slice(0, 10))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TopMandate({ daten }: { daten: UebersichtDto }) {
  if (daten.topMandate.length === 0)
    return (
      <p className="text-sm text-text-muted">Keine beauftragten Mandate.</p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-text-muted">
          <tr className="border-b border-hairline">
            <th className="px-2 py-2 font-medium">Objekt</th>
            <th className="px-2 py-2 text-right font-medium">Preis</th>
            <th className="px-2 py-2 text-right font-medium">Provision</th>
            <th className="px-2 py-2 text-right font-medium">Interessenten</th>
            <th className="whitespace-nowrap px-2 py-2 text-right font-medium">
              Letzte Aktivität
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {daten.topMandate.map((m) => (
            <tr key={m.sfId}>
              <td className="max-w-64 truncate px-2 py-2">
                <Link
                  to="/mandate/$sfId"
                  params={{ sfId: m.sfId }}
                  className="text-heading hover:text-brand-text hover:underline"
                >
                  {m.objekt ?? m.name}
                </Link>
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                {m.preis ? euroKurz(m.preis) : "–"}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums">
                {m.provision ? euroKurz(m.provision) : "–"}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {m.interessenten}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-text-muted">
                {formatDate(m.letzteAktivitaet?.slice(0, 10))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Finanzen({ finanzen }: { finanzen: KennzahlenDto }) {
  const monate = finanzen.monate.filter((m) => m.saldo !== null);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <MiniWert titel="Liquidität" wert={euroKurz(finanzen.liquiditaet)} />
        <MiniWert
          titel="Provision netto"
          wert={euroKurz(finanzen.provisionNetto)}
        />
        <MiniWert
          titel="Reichweite"
          wert={
            finanzen.reichweiteMonate === null
              ? "–"
              : `${Math.round(finanzen.reichweiteMonate)} Monate`
          }
        />
      </div>
      <ChartContainer config={provisionConfig} className="h-44 w-full">
        <BarChart data={monate}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="monat"
            tickLine={false}
            axisLine={false}
            tickFormatter={(m) => monatLabel(String(m))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(n) => euroKurz(Number(n))}
          />
          <ChartTooltip
            labelFormatter={(m) => monatLabel(String(m), true)}
            content={<EuroTooltip labels={labels(provisionConfig)} />}
          />
          <Bar
            dataKey="provisionen"
            fill="var(--color-provisionen)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
      <Link
        to="/kennzahlen"
        className="self-start text-xs font-medium text-brand-text hover:underline"
      >
        Alle Kennzahlen →
      </Link>
    </div>
  );
}

function MiniWert({ titel, wert }: { titel: string; wert: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-caps text-text-muted">{titel}</span>
      <span className="text-lg font-semibold tabular-nums text-heading">
        {wert}
      </span>
    </div>
  );
}

function Schnellzugriff({ daten }: { daten: UebersichtDto }) {
  const x = daten.exposes;
  const links = [
    {
      to: "/exposes",
      label: "Offene Exposés",
      zusatz: `${x.offen} offen · ${x.neu7Tage} neu in 7 Tagen`,
      icon: Inbox,
    },
    {
      to: "/mandate",
      label: "Mandate",
      zusatz: `${daten.kacheln.aktiveMandate} aktiv`,
      icon: Briefcase,
    },
    {
      to: "/exposes/karte",
      label: "Exposé-Karte",
      zusatz: `${x.gesamt} Angebote im Markt`,
      icon: MapPin,
    },
    {
      to: "/exposes/auswertung",
      label: "Exposé-Auswertung",
      zusatz: "Preise und Faktoren",
      icon: FileText,
    },
    {
      to: "/kennzahlen",
      label: "Kennzahlen",
      zusatz: "Finanzen und Maklergeschäft",
      icon: ChartColumn,
    },
  ] as const;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
      {links.map((l) => (
        <li key={l.to}>
          <Link
            to={l.to}
            className="group flex h-full items-center gap-3 rounded-lg border border-hairline p-3 transition-colors hover:border-brand hover:bg-surface-muted"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-text">
              <l.icon className="size-4" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-heading group-hover:text-brand-text">
                {l.label}
              </span>
              <span className="block truncate text-xs text-text-muted">
                {l.zusatz}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
