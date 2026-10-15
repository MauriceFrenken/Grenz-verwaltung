import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Abschnitt,
  BuehnenKennzahl,
  Karte,
  SeitenKopf,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import {
  datum,
  dezimal,
  euro,
  euroGanz,
  euroKompakt,
  flaeche,
  monat as monatLang,
  monatKurz,
  prozent,
} from "@/lib/format/de";
import { cn } from "@/lib/utils";
import { useDarlehenAuswertung } from "@/modules/darlehen/useDarlehen";
import {
  useBoardDaten,
  useGesellschaftsFilter,
  useNachschlagen,
} from "@/modules/shell/daten";
import {
  CF_KATEGORIEN,
  type CfKategorie,
  type CfPosten,
} from "./logik/einordnung";
import {
  cashflowAuswerten,
  PLAN_ANNAHMEN,
  type CfMonat,
  type ObjektCf,
  type Summenzeile,
} from "./logik/objektCashflow";

const ZUORDNUNG: Record<CfPosten["zuordnung"], string> = {
  darlehen: "Darlehen",
  mietvertrag: "Mietvertrag",
  adresse: "Adresse im Text",
  konto: "Mietkonto",
  keine: "Gesellschaft",
};

const vorzeichenKlasse = (v: number) =>
  v < 0 ? "text-bad" : v > 0 ? "text-foreground" : "text-text-subtle";

export function CashflowSeite() {
  const { data, isLoading, error } = useBoardDaten();
  const darlehen = useDarlehenAuswertung(data);
  const n = useNachschlagen(data);
  const filter = useGesellschaftsFilter();
  const search = useSearch({ from: "/board/cashflow" });
  const navigate = useNavigate({ from: "/board/cashflow" });
  const a = useMemo(
    () => (data && darlehen ? cashflowAuswerten(data, darlehen.staende) : null),
    [data, darlehen],
  );

  if (error)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Daten konnten nicht geladen werden"
        text={(error as Error).message}
      />
    );
  if (isLoading || !data || !a) return <SeitenSkelett />;

  const objekte = a.objekte.filter((o) => filter.passt(o.companyId));
  const allgemein = a.allgemein.filter((g) => filter.passt(g.companyId));
  const pruef = a.pruefliste.filter((p) => filter.passt(p.companyId));
  const offen = search.objekt
    ? objekte.find((o) => o.objektId === search.objekt)
    : undefined;
  const waehle = (id: string | undefined) =>
    navigate({ search: { objekt: id }, replace: true, resetScroll: false });

  const summe = (z: Summenzeile) =>
    objekte.reduce((s, o) => s + o.summe.summen[z], 0);
  const sollMiete = objekte.reduce((s, o) => s + o.summe.sollMiete, 0);
  const istMiete = objekte.reduce((s, o) => s + o.summe.werte.miete, 0);
  const planCf = objekte.reduce((s, o) => s + o.plan.cfNachKd, 0);
  const kd = summe("kapitaldienst");
  const dscr = kd < 0 ? summe("noi") / -kd : null;
  const k = portfolioKennzahlen(objekte);
  const datenAb = objekte
    .map((o) => o.datenAb)
    .filter((x): x is string => Boolean(x))
    .sort()[0];

  return (
    <>
      <SeitenKopf
        titel="Cashflow je Liegenschaft"
        unterzeile={
          <>
            Ist aus den Bankumsätzen (EBICS, täglich), Jahres- und
            Quartalskosten auf ihre Monate verteilt. Soll aus den Mietverträgen,
            Plan nach den Annahmen der DCF-Kalkulation. Letzte 12 abgeschlossene
            Monate
            {datenAb ? `, Bankdaten ab ${monatLang(datenAb)}` : ""}.
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <BuehnenKennzahl
            label="Mieteingang 12 M"
            wert={euroKompakt(istMiete)}
            hinweis={`Soll ${euroKompakt(sollMiete)} · ${sollMiete ? prozent(istMiete / sollMiete, 0) : "–"}`}
            ampel={
              !sollMiete
                ? "grau"
                : istMiete / sollMiete >= 0.97
                  ? "gruen"
                  : istMiete / sollMiete >= 0.9
                    ? "gelb"
                    : "rot"
            }
          />
          <BuehnenKennzahl
            label="NOI 12 M"
            wert={euroKompakt(summe("noi"))}
            hinweis={`NOI-Rendite ${k.noiRendite == null ? "–" : prozent(k.noiRendite, 1)} auf Kaufpreis + NK`}
          />
          <BuehnenKennzahl
            label="Kapitaldienst 12 M"
            wert={euroKompakt(-kd)}
            hinweis={`DSCR ${dscr == null ? "–" : dezimal(dscr, 2)}`}
            ampel={
              dscr == null
                ? "grau"
                : dscr >= 1.2
                  ? "gruen"
                  : dscr >= 1
                    ? "gelb"
                    : "rot"
            }
          />
          <BuehnenKennzahl
            label="Cashflow nach KD"
            wert={euroKompakt(summe("cfNachKd"))}
            hinweis={`Cash-on-Cash ${k.cashOnCash == null ? "–" : prozent(k.cashOnCash, 1)} · Plan ${euroKompakt(planCf)}`}
            ampel={summe("cfNachKd") >= planCf ? "gruen" : "gelb"}
          />
          <BuehnenKennzahl
            label="Eingeordnet"
            wert={prozent(a.einordnungsQuote, 0)}
            hinweis={`${pruef.length} Buchungen zu prüfen`}
            ampel={
              a.einordnungsQuote >= 0.9
                ? "gruen"
                : a.einordnungsQuote >= 0.75
                  ? "gelb"
                  : "rot"
            }
          />
        </div>
      </SeitenKopf>

      <div className="nicht-drucken mb-6 flex flex-wrap gap-1.5">
        <Reiter aktiv={!offen} onClick={() => waehle(undefined)}>
          Portfolio
        </Reiter>
        {objekte.map((o) => (
          <Reiter
            key={o.objektId}
            aktiv={offen?.objektId === o.objektId}
            onClick={() => waehle(o.objektId ?? undefined)}
          >
            {o.name}
          </Reiter>
        ))}
      </div>

      {offen ? (
        <ObjektAnsicht
          o={offen}
          gesellschaft={n.gesellschaftName(offen.companyId)}
        />
      ) : (
        <>
          <Abschnitt
            titel="Monatsverlauf Portfolio"
            beschreibung="Mieteinnahmen, Ausgaben (Bewirtschaftung und Kapitaldienst) und Cashflow nach Kapitaldienst je Monat"
          >
            <Karte className="p-4">
              <MonatsDiagramm monate={a.portfolio.monate} />
            </Karte>
          </Abschnitt>

          <Abschnitt
            titel="Liegenschaften"
            beschreibung="Summe der abgeschlossenen Monate mit Bankdaten. Plan über denselben Zeitraum. Zeile anklicken für die Monatsansicht."
          >
            <Karte className="overflow-x-auto">
              <PortfolioTabelle
                objekte={objekte}
                gesellschaft={n.gesellschaftName}
                onWaehle={(id) => waehle(id)}
              />
            </Karte>
          </Abschnitt>

          <Abschnitt
            titel="Gesellschaft allgemein"
            beschreibung="Zahlungen ohne Objektbezug: Steuern, Personal, Gemeinkosten und Umbuchungen in der Gruppe. Bewusst nicht auf die Objekte verteilt."
          >
            <Karte className="overflow-x-auto">
              <AllgemeinTabelle liste={allgemein} />
            </Karte>
          </Abschnitt>

          <Abschnitt
            titel="Zu prüfen"
            beschreibung="Buchungen ohne Kategorie oder ohne Objekt, größte zuerst. Mit einer Regel oder einer Konto-Zuordnung verschwinden sie von hier."
          >
            <Karte className="overflow-x-auto">
              <PostenTabelle
                posten={pruef.slice(0, 60)}
                objektName={(id) => (id ? n.properties.get(id)?.name : null)}
                gesellschaft={n.gesellschaftName}
              />
            </Karte>
            {pruef.length > 60 ? (
              <p className="mt-2 text-xs text-text-muted">
                {pruef.length - 60} weitere, kleinere Buchungen nicht gezeigt.
              </p>
            ) : null}
          </Abschnitt>

          <Annahmen />
        </>
      )}
    </>
  );
}

/** Rendite-Kennzahlen über die gefilterten Objekte (hochgerechnet auf 12 Monate) */
function portfolioKennzahlen(objekte: ObjektCf[]) {
  const mitEk = objekte.filter((o) => o.eigenkapital && o.kennzahlen.monate);
  const ek = mitEk.reduce((a, o) => a + (o.eigenkapital ?? 0), 0);
  const mitInvest = objekte.filter(
    (o) => o.gesamtinvest && o.kennzahlen.monate,
  );
  const invest = mitInvest.reduce((a, o) => a + (o.gesamtinvest ?? 0), 0);
  return {
    cashOnCash: ek
      ? mitEk.reduce((a, o) => a + o.kennzahlen.cfJahr, 0) / ek
      : null,
    noiRendite: invest
      ? mitInvest.reduce((a, o) => a + o.kennzahlen.noiJahr, 0) / invest
      : null,
  };
}

function Reiter({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 cursor-pointer rounded-md border px-3 text-xs font-medium transition-colors",
        aktiv
          ? "border-input bg-surface text-heading shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
          : "border-hairline bg-surface-muted text-text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MonatsDiagramm({ monate }: { monate: CfMonat[] }) {
  const daten = monate.map((m) => ({
    monat: m.monat,
    einnahmen: m.summen.einnahmen,
    ausgaben: m.summen.bewirtschaftung + m.summen.kapitaldienst,
    cashflow: m.summen.cfNachKd,
    laufend: !m.abgeschlossen,
  }));
  const label: Record<string, string> = {
    einnahmen: "Einnahmen",
    ausgaben: "Bewirtschaftung + Kapitaldienst",
    cashflow: "Cashflow nach KD",
  };
  return (
    <figure aria-label="Cashflow je Monat" className="w-full">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={daten}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          <XAxis
            dataKey="monat"
            tickFormatter={(v: string) => monatKurz(v)}
            tick={{ fontSize: 11, fill: "var(--text-subtle)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => euroKompakt(v)}
            tick={{ fontSize: 11, fill: "var(--text-subtle)" }}
            tickLine={false}
            axisLine={false}
            width={88}
          />
          <ReferenceLine y={0} stroke="var(--input)" />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            content={({ active, payload, label: x }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-hairline bg-elevated px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgb(0_0_0/0.2)]">
                  <div className="mb-1 font-medium text-heading">
                    {monatLang(String(x))}
                    {payload[0]?.payload?.laufend ? " (laufend)" : ""}
                  </div>
                  {payload.map((p) => (
                    <div
                      key={String(p.dataKey)}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="flex items-center gap-1.5 text-text-muted">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: p.color }}
                        />
                        {label[String(p.dataKey)]}
                      </span>
                      <span className="tabular-nums text-foreground">
                        {euro(Number(p.value))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="einnahmen"
            fill="var(--ok)"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Bar
            dataKey="ausgaben"
            fill="var(--bad)"
            fillOpacity={0.6}
            radius={[0, 0, 3, 3]}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cashflow"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 2.5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}

function Zahl({ v, fett }: { v: number; fett?: boolean }) {
  return (
    <span className={cn(vorzeichenKlasse(v), fett && "font-semibold")}>
      {v === 0 ? "–" : euroGanz(v)}
    </span>
  );
}

const TH = "px-3 text-right font-medium whitespace-nowrap";

function PortfolioTabelle({
  objekte,
  gesellschaft,
  onWaehle,
}: {
  objekte: ObjektCf[];
  gesellschaft: (id: string) => string;
  onWaehle: (id: string) => void;
}) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
          <th className="h-9 px-3 text-left font-medium">Liegenschaft</th>
          <th className="px-3 text-left font-medium">Daten ab</th>
          <th className={TH}>Soll-Kaltmiete</th>
          <th className={TH}>Ist-Miete</th>
          <th className={TH}>NK-Saldo</th>
          <th className={TH}>Nicht uml. Kosten</th>
          <th className={TH}>NOI</th>
          <th className={TH}>Kapitaldienst</th>
          <th className={TH}>CF nach KD</th>
          <th className={TH}>Plan</th>
          <th className={TH}>Abweichung</th>
          <th className={TH}>DSCR</th>
          <th className={TH}>Cash-on-Cash</th>
        </tr>
      </thead>
      <tbody>
        {objekte.map((o) => {
          const s = o.summe.summen;
          const abw = s.cfNachKd - o.plan.cfNachKd;
          return (
            <tr
              key={o.objektId}
              onClick={() => o.objektId && onWaehle(o.objektId)}
              className="cursor-pointer shadow-[inset_0_-1px_0_var(--hairline)] hover:bg-surface-muted/60"
            >
              <td className="h-11 px-3">
                <div className="font-medium text-heading">{o.name}</div>
                <div className="text-xs text-text-muted">
                  {gesellschaft(o.companyId)} · {o.einheiten} Einheiten
                  {o.flaeche ? ` · ${flaeche(Math.round(o.flaeche))}` : ""}
                </div>
              </td>
              <td className="px-3 text-xs text-text-muted">
                {o.datenAb ? (
                  <>
                    {monatKurz(o.datenAb)}
                    <span className="ml-1 text-text-subtle">
                      ({o.vergleichsMonate} M)
                    </span>
                  </>
                ) : (
                  <span className="text-warn">kein Konto</span>
                )}
              </td>
              <td className="px-3 text-right text-text-muted">
                {euroGanz(o.summe.sollMiete)}
              </td>
              <td className="px-3 text-right">
                <Zahl v={o.summe.werte.miete} />
                {o.mieteQuote != null ? (
                  <div
                    className={cn(
                      "text-[11px]",
                      o.mieteQuote >= 0.97
                        ? "text-ok"
                        : o.mieteQuote >= 0.9
                          ? "text-warn"
                          : "text-bad",
                    )}
                  >
                    {prozent(o.mieteQuote, 0)}
                  </div>
                ) : null}
              </td>
              <td className="px-3 text-right">
                <Zahl v={s.betriebskosten} />
              </td>
              <td className="px-3 text-right">
                <Zahl v={s.nichtUmlagefaehig} />
              </td>
              <td className="px-3 text-right">
                <Zahl v={s.noi} />
              </td>
              <td className="px-3 text-right">
                <Zahl v={s.kapitaldienst} />
              </td>
              <td className="px-3 text-right">
                <Zahl v={s.cfNachKd} fett />
              </td>
              <td className="px-3 text-right text-text-muted">
                {euroGanz(o.plan.cfNachKd)}
              </td>
              <td
                className={cn(
                  "px-3 text-right",
                  abw < 0 ? "text-bad" : "text-ok",
                )}
              >
                {o.vergleichsMonate ? euroGanz(abw) : "–"}
              </td>
              <td className="px-3 text-right">
                {o.dscr == null ? "–" : dezimal(o.dscr, 2)}
              </td>
              <td className="px-3 text-right">
                {o.kennzahlen.cashOnCash == null
                  ? "–"
                  : prozent(o.kennzahlen.cashOnCash, 1)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AllgemeinTabelle({ liste }: { liste: ObjektCf[] }) {
  const spalten: CfKategorie[] = [
    "steuern",
    "personal",
    "gemeinkosten",
    "bank",
    "finanzierung",
    "intercompany",
    "sonstige_einnahmen",
    "sonstiges",
  ];
  if (!liste.length)
    return (
      <p className="p-4 text-sm text-text-muted">
        Keine Zahlungen ohne Objektbezug.
      </p>
    );
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
          <th className="h-9 px-3 text-left font-medium">Gesellschaft</th>
          {spalten.map((k) => (
            <th key={k} className={TH}>
              {CF_KATEGORIEN[k].label}
            </th>
          ))}
          <th className={TH}>Summe</th>
        </tr>
      </thead>
      <tbody>
        {liste.map((g) => {
          const gesamt = Object.values(g.summe.werte).reduce(
            (a, b) => a + b,
            0,
          );
          return (
            <tr
              key={g.companyId}
              className="shadow-[inset_0_-1px_0_var(--hairline)]"
            >
              <td className="h-10 px-3 font-medium text-heading">{g.name}</td>
              {spalten.map((k) => (
                <td key={k} className="px-3 text-right">
                  <Zahl v={g.summe.werte[k]} />
                </td>
              ))}
              <td className="px-3 text-right">
                <Zahl v={gesamt} fett />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type Zeile =
  | { art: "kategorie"; k: CfKategorie; plan?: number }
  | {
      art: "summe";
      z: Summenzeile;
      label: string;
      plan?: number;
      stark?: boolean;
    }
  | { art: "titel"; label: string }
  | { art: "soll" };

/** Aufbau wie in einer Investoren-Rechnung: Miete → NOI → Kapitaldienst → Cashflow */
function zeilen(o: ObjektCf): Zeile[] {
  const p = o.plan;
  const kat = (k: CfKategorie, plan?: number): Zeile => ({
    art: "kategorie",
    k,
    plan,
  });
  return [
    { art: "soll" },
    kat("miete", p.sollMiete - p.mietausfall),
    kat("sonstige_einnahmen"),
    {
      art: "summe",
      z: "einnahmen",
      label: "Einnahmen (netto kalt)",
      plan: p.sollMiete - p.mietausfall,
    },
    { art: "titel", label: "Umlagefähige Betriebskosten" },
    kat("grundbesitz"),
    kat("versicherung"),
    kat("versorger"),
    kat("umlagen"),
    kat("nk_abrechnung"),
    {
      art: "summe",
      z: "betriebskosten",
      label: "Saldo Nebenkosten (nicht gedeckt)",
      plan: 0,
    },
    { art: "titel", label: "Nicht umlagefähige Kosten" },
    kat("instandhaltung", -p.instandhaltung),
    kat("verwaltung", -p.verwaltung),
    kat("bank"),
    {
      art: "summe",
      z: "nichtUmlagefaehig",
      label: "Nicht umlagefähige Kosten",
      plan: -(p.instandhaltung + p.verwaltung),
    },
    {
      art: "summe",
      z: "noi",
      label: "NOI (Reinertrag)",
      plan: p.noi,
      stark: true,
    },
    kat("zinsen"),
    {
      art: "summe",
      z: "cfVorTilgung",
      label: "Cashflow vor Tilgung",
    },
    kat("tilgung"),
    {
      art: "summe",
      z: "kapitaldienst",
      label: "Kapitaldienst",
      plan: -p.kapitaldienst,
    },
    {
      art: "summe",
      z: "cfNachKd",
      label: "Cashflow nach Kapitaldienst",
      plan: p.cfNachKd,
      stark: true,
    },
    { art: "titel", label: "Einmalig, Finanzierung und Abgrenzung" },
    kat("ankauf"),
    kat("verkauf"),
    kat("sanierung"),
    kat("finanzierung"),
    kat("kaution"),
    kat("abgrenzung"),
    { art: "summe", z: "netto", label: "Veränderung Bankbestand", stark: true },
  ];
}

function ObjektAnsicht({
  o,
  gesellschaft,
}: {
  o: ObjektCf;
  gesellschaft: string;
}) {
  const sichtbar = zeilen(o).filter(
    (z) =>
      z.art !== "kategorie" ||
      z.plan ||
      o.monate.some((m) => m.werte[z.k] !== 0),
  );
  const zelle = (z: Exclude<Zeile, { art: "titel" }>, m: CfMonat) =>
    z.art === "soll"
      ? m.sollMiete
      : z.art === "kategorie"
        ? m.werte[z.k]
        : m.summen[z.z];
  const gesamt = (z: Exclude<Zeile, { art: "titel" }>) =>
    z.art === "soll"
      ? o.summe.sollMiete
      : z.art === "kategorie"
        ? o.summe.werte[z.k]
        : o.summe.summen[z.z];
  const plan = (z: Zeile) =>
    z.art === "soll" || z.art === "titel" ? undefined : z.plan;
  const kz = o.kennzahlen;
  const hochgerechnet =
    kz.monate && kz.monate < 12 ? ` · aus ${kz.monate} M hochgerechnet` : "";
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <BuehnenKennzahl
          label="Ist-Miete / Soll"
          wert={o.mieteQuote == null ? "–" : prozent(o.mieteQuote, 0)}
          hinweis={`${euroGanz(o.summe.werte.miete)} von ${euroGanz(o.summe.sollMiete)}`}
        />
        <BuehnenKennzahl
          label="NOI"
          wert={euroKompakt(o.summe.summen.noi)}
          hinweis={`Plan ${euroKompakt(o.plan.noi)}`}
        />
        <BuehnenKennzahl
          label="NOI-Rendite"
          wert={kz.noiRendite == null ? "–" : prozent(kz.noiRendite, 1)}
          hinweis={`NOI p. a. ${euroKompakt(kz.noiJahr)} / Kaufpreis + NK${hochgerechnet}`}
        />
        <BuehnenKennzahl
          label="Cashflow nach KD"
          wert={euroKompakt(o.summe.summen.cfNachKd)}
          hinweis={`Plan ${euroKompakt(o.plan.cfNachKd)}`}
          ampel={o.summe.summen.cfNachKd >= o.plan.cfNachKd ? "gruen" : "gelb"}
        />
        <BuehnenKennzahl
          label="DSCR"
          wert={o.dscr == null ? "–" : dezimal(o.dscr, 2)}
          hinweis="NOI / Kapitaldienst"
          ampel={
            o.dscr == null
              ? "grau"
              : o.dscr >= 1.2
                ? "gruen"
                : o.dscr >= 1
                  ? "gelb"
                  : "rot"
          }
        />
        <BuehnenKennzahl
          label="Cash-on-Cash"
          wert={kz.cashOnCash == null ? "–" : prozent(kz.cashOnCash, 1)}
          hinweis={
            o.eigenkapital
              ? `CF p. a. ${euroKompakt(kz.cfJahr)} / EK ${euroKompakt(o.eigenkapital)}${hochgerechnet}`
              : "Eigenkapital in den Stammdaten fehlt"
          }
        />
      </div>

      <Abschnitt
        titel={`${o.name} · Monatsrechnung`}
        beschreibung={`${gesellschaft} · ${o.einheiten} Einheiten${o.flaeche ? ` · ${flaeche(Math.round(o.flaeche))}` : ""} · ${o.datenAb ? `Bankdaten ab ${monatLang(o.datenAb)}, ${o.vergleichsMonate} Monate im Vergleich` : "noch kein Bankkonto mit Umsätzen"}. Der laufende Monat zählt nicht in die Summe.`}
      >
        <Karte className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
                <th className="sticky left-0 z-10 h-9 min-w-52 bg-surface px-3 text-left font-medium">
                  Position
                </th>
                {o.monate.map((m) => (
                  <th
                    key={m.monat}
                    className={cn(
                      "px-2 text-right font-medium whitespace-nowrap",
                      !m.mitDaten && "text-text-subtle",
                    )}
                  >
                    {monatKurz(m.monat)}
                    {m.abgeschlossen ? "" : " lfd."}
                  </th>
                ))}
                <th className="bg-surface-muted/60 px-3 text-right font-semibold whitespace-nowrap text-heading">
                  Ist {o.vergleichsMonate} M
                </th>
                <th className="px-3 text-right font-medium">Plan</th>
                <th className="px-3 text-right font-medium">Abw.</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((z, i) => {
                if (z.art === "titel")
                  return (
                    <tr key={i}>
                      <td className="sticky left-0 z-10 h-8 bg-surface px-3 pt-3 text-[11px] font-medium tracking-wide whitespace-nowrap text-text-subtle uppercase">
                        {z.label}
                      </td>
                      <td colSpan={o.monate.length + 3} />
                    </tr>
                  );
                const summe = z.art === "summe";
                const stark = z.art === "summe" && z.stark;
                const label =
                  z.art === "soll"
                    ? "Soll-Miete (Verträge, netto kalt)"
                    : z.art === "kategorie"
                      ? CF_KATEGORIEN[z.k].label
                      : z.label;
                const pl = plan(z);
                const ist = gesamt(z);
                return (
                  <tr
                    key={i}
                    className={cn(
                      "shadow-[inset_0_-1px_0_var(--hairline)]",
                      summe && "bg-surface-muted/40",
                      z.art === "soll" && "text-text-muted",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky left-0 z-10 h-8 px-3 whitespace-nowrap",
                        summe
                          ? "bg-surface-muted font-medium text-heading"
                          : "bg-surface",
                        z.art === "kategorie" && "pl-6",
                        stark && "font-semibold",
                      )}
                    >
                      {label}
                    </td>
                    {o.monate.map((m) => (
                      <td
                        key={m.monat}
                        className={cn(
                          "px-2 text-right whitespace-nowrap",
                          !m.abgeschlossen && "opacity-60",
                        )}
                      >
                        {z.art === "soll" ? (
                          euroGanz(zelle(z, m))
                        ) : (
                          <Zahl v={zelle(z, m)} fett={stark} />
                        )}
                      </td>
                    ))}
                    <td className="bg-surface-muted/60 px-3 text-right whitespace-nowrap">
                      {z.art === "soll" ? euroGanz(ist) : <Zahl v={ist} fett />}
                    </td>
                    <td className="px-3 text-right whitespace-nowrap text-text-muted">
                      {pl == null ? "" : euroGanz(pl)}
                    </td>
                    <td
                      className={cn(
                        "px-3 text-right whitespace-nowrap",
                        pl != null && ist - pl < 0 ? "text-bad" : "text-ok",
                      )}
                    >
                      {pl == null || !o.vergleichsMonate
                        ? ""
                        : euroGanz(ist - pl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Karte>
      </Abschnitt>

      <Abschnitt
        titel="Buchungen"
        beschreibung="Alle Bankumsätze, die diesem Objekt zugeordnet sind, mit Kategorie und Grund der Zuordnung."
      >
        <Karte className="max-h-[560px] overflow-auto">
          <PostenTabelle posten={o.posten} />
        </Karte>
      </Abschnitt>

      <Annahmen />
    </>
  );
}

function PostenTabelle({
  posten,
  objektName,
  gesellschaft,
}: {
  posten: CfPosten[];
  objektName?: (id: string | null) => string | null | undefined;
  gesellschaft?: (id: string) => string;
}) {
  if (!posten.length)
    return <p className="p-4 text-sm text-text-muted">Keine Buchungen.</p>;
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="sticky top-0 bg-surface">
        <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
          <th className="h-9 px-3 text-left font-medium">Datum</th>
          <th className="px-3 text-left font-medium">Gegenpartei</th>
          <th className="px-3 text-left font-medium">Verwendungszweck</th>
          <th className="px-3 text-left font-medium">Kategorie</th>
          <th className="px-3 text-left font-medium">
            {objektName ? "Objekt / Gesellschaft" : "Zuordnung"}
          </th>
          <th className={TH}>Betrag</th>
        </tr>
      </thead>
      <tbody>
        {posten.map((p, i) => (
          <tr
            key={`${p.txId}-${i}`}
            className="shadow-[inset_0_-1px_0_var(--hairline)]"
          >
            <td className="h-9 px-3 whitespace-nowrap text-text-muted">
              {datum(p.datum)}
            </td>
            <td className="max-w-56 truncate px-3" title={p.gegenpartei}>
              {p.gegenpartei || "–"}
            </td>
            <td
              className="max-w-96 truncate px-3 text-xs text-text-muted"
              title={p.zweck}
            >
              {p.zweck}
            </td>
            <td
              className={cn(
                "px-3 whitespace-nowrap",
                p.kategorie === "sonstiges" && "text-warn",
              )}
            >
              {CF_KATEGORIEN[p.kategorie].label}
            </td>
            <td className="px-3 whitespace-nowrap text-xs text-text-muted">
              {objektName
                ? (objektName(p.objektId) ??
                  (gesellschaft ? gesellschaft(p.companyId) : p.companyId))
                : ZUORDNUNG[p.zuordnung]}
            </td>
            <td className="px-3 text-right whitespace-nowrap">
              <Zahl v={p.betrag} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Annahmen() {
  return (
    <Abschnitt
      titel="So wird gerechnet"
      beschreibung="Gegenüber der bisherigen Excel-Kalkulation: monatlich, aus echten Kontoumsätzen, mit Soll und Plan daneben."
    >
      <Karte className="grid gap-6 p-5 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className="mb-1 font-medium text-heading">Ist</div>
          <p className="text-text-muted">
            Jede Bankbuchung bekommt eine Kategorie und ein Objekt: über das
            Darlehen, den Mietvertrag, die Adresse im Verwendungszweck oder das
            Mietkonto des Objekts. Darlehensraten werden nach dem
            Darlehensregister in Zins und Tilgung geteilt; Zahlungen an einen
            Darlehensgeber der Gruppe zählen beim Objekt, nicht beim Geber. Was
            nichts davon trifft, steht unter „Zu prüfen“.
          </p>
        </div>
        <div>
          <div className="mb-1 font-medium text-heading">Periodisierung</div>
          <p className="text-text-muted">
            Grundbesitzabgaben, Versicherungen und Wartungsverträge werden auf
            die Monate verteilt, für die sie gelten: nach dem Zeitraum im
            Verwendungszweck, sonst nach den festen Kosten des Objekts, sonst
            Versicherung jährlich und Grundbesitzabgaben quartalsweise. Der
            Unterschied zur Zahlung steht als „Zeitliche Abgrenzung“ unter dem
            Cashflow; die Veränderung des Bankbestands stimmt weiter.
            Rendite-Kennzahlen sind auf 12 Monate hochgerechnet: Cash-on-Cash
            auf das Eigenkapital, NOI-Rendite auf Kaufpreis plus
            Kaufnebenkosten.
          </p>
        </div>
        <div>
          <div className="mb-1 font-medium text-heading">Soll</div>
          <p className="text-text-muted">
            Netto-Kaltmiete aller laufenden Mietverträge je Monat, inklusive
            zugestimmter Mieterhöhungen. Monate vor dem Kauf zählen nicht. Von
            den Mieteingängen auf der Bank wird der Anteil der
            Nebenkostenvorauszahlungen laut Vertrag als „Umlagen“ abgezogen.
          </p>
        </div>
        <div>
          <div className="mb-1 font-medium text-heading">Plan</div>
          <p className="text-text-muted">
            Netto-Kaltmiete minus {prozent(PLAN_ANNAHMEN.mietausfallQuote, 0)}{" "}
            Mietausfall; umlagefähige Kosten und Umlagen heben sich auf;
            Instandhaltung {PLAN_ANNAHMEN.instandhaltungJeQmJahr} € je m² und
            Jahr; Verwaltung {prozent(PLAN_ANNAHMEN.verwaltungQuote, 0)} der
            Kaltmiete; Kapitaldienst aus den Tilgungsplänen der Darlehen.
          </p>
        </div>
      </Karte>
    </Abschnitt>
  );
}
