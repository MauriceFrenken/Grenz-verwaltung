import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { datum as datumDe, euro, euroKompakt, prozent } from "@/lib/format/de";
import { plusMonate, tageZwischen, teile, type IsoDatum } from "@/lib/kalender";
import { cn } from "@/lib/utils";
import {
  GRUPPE_FARBE,
  GRUPPE_LABEL,
  type GeberZeile,
  type Gruppe,
  type KreisSummen,
  type LaufzeitZeile,
  type NehmerZeile,
  type NettoZeile,
  type ProfilJahr,
} from "./logik/kreise";

const ACHSE = { fontSize: 11, fill: "var(--text-subtle)" } as const;
const ACHSE_NAME = { fontSize: 12, fill: "var(--text-muted)" } as const;
/** 2px Fuge zwischen gestapelten Segmenten */
const FUGE = { stroke: "var(--surface)", strokeWidth: 2 } as const;

function TipRahmen({
  titel,
  children,
}: {
  titel: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-[180px] rounded-lg border border-hairline bg-elevated px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgb(0_0_0/0.2)]">
      <div className="mb-1 font-medium text-heading">{titel}</div>
      {children}
    </div>
  );
}

function TipZeile({
  farbe,
  label,
  wert,
  fett,
}: {
  farbe?: string;
  label: ReactNode;
  wert: ReactNode;
  fett?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-text-muted">
        {farbe ? (
          <span className="size-2 rounded-sm" style={{ background: farbe }} />
        ) : null}
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums text-foreground",
          fett && "font-semibold text-heading",
        )}
      >
        {wert}
      </span>
    </div>
  );
}

/** Legende über dem Diagramm: Farbfeld + Name (Identität nie nur über Farbe). */
export function Legende({ gruppen }: { gruppen: Gruppe[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
      {gruppen.map((g) => (
        <span key={g} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: GRUPPE_FARBE[g] }}
            aria-hidden
          />
          {GRUPPE_LABEL[g]}
        </span>
      ))}
    </div>
  );
}

/** Ein Balken, der die Gesamtfinanzierung in Bank / Privat / Intern teilt. */
export function Zusammensetzung({ summen }: { summen: KreisSummen }) {
  const teile: Array<{ g: Gruppe; wert: number; zinsen: number }> = [
    { g: "bank", wert: summen.bank, zinsen: summen.zinsenBankPa },
    { g: "privat", wert: summen.privat, zinsen: summen.zinsenPrivatPa },
    { g: "intern", wert: summen.intern, zinsen: summen.zinsenInternPa },
  ];
  const gesamt = teile.reduce((a, t) => a + t.wert, 0) || 1;
  return (
    <div>
      <div
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={teile
          .map((t) => `${GRUPPE_LABEL[t.g]} ${euroKompakt(t.wert)}`)
          .join(", ")}
      >
        {teile
          .filter((t) => t.wert > 0)
          .map((t) => (
            <div
              key={t.g}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(t.wert / gesamt) * 100}%`,
                background: GRUPPE_FARBE[t.g],
              }}
              title={`${GRUPPE_LABEL[t.g]}: ${euro(t.wert)}`}
            />
          ))}
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {teile.map((t) => (
          <div key={t.g} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-text-muted">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: GRUPPE_FARBE[t.g] }}
                aria-hidden
              />
              {GRUPPE_LABEL[t.g]}
              <span className="text-text-subtle">
                · {prozent(t.wert / gesamt, 0)}
              </span>
            </dt>
            <dd className="mt-1 text-xl font-semibold tracking-[-0.02em] text-heading tabular-nums">
              {euroKompakt(t.wert)}
            </dd>
            <dd className="mt-0.5 text-xs text-text-muted tabular-nums">
              {summen.anzahl[t.g]} Darlehen · Zinsen p.a.{" "}
              {euroKompakt(t.zinsen)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Externe Darlehensgeber als waagerechte Balken, Farbe nach Bank/Privat. */
export function GeberDiagramm({
  zeilen,
  name,
}: {
  zeilen: GeberZeile[];
  name: (id: string) => string;
}) {
  const daten = zeilen.map((z) => ({ ...z, label: name(z.id) }));
  return (
    <figure aria-label="Externe Darlehensgeber" className="w-full">
      <ResponsiveContainer
        width="100%"
        height={Math.max(140, daten.length * 40 + 24)}
      >
        <BarChart
          data={daten}
          layout="vertical"
          margin={{ top: 0, right: 72, bottom: 0, left: 0 }}
          barCategoryGap={10}
        >
          <CartesianGrid horizontal={false} stroke="var(--hairline)" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => euroKompakt(v)}
            tick={ACHSE}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={ACHSE_NAME}
            tickLine={false}
            axisLine={false}
            width={200}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            content={({ active, payload }) => {
              const z = active ? payload?.[0]?.payload : null;
              return z ? (
                <TipRahmen titel={z.label}>
                  <TipZeile
                    farbe={GRUPPE_FARBE[z.gruppe as Gruppe]}
                    label="Restschuld"
                    wert={euro(z.restschuld)}
                    fett
                  />
                  <TipZeile label="Darlehen" wert={z.anzahl} />
                  <TipZeile label="Ø Zins" wert={prozent(z.zinsSchnitt)} />
                  <TipZeile label="Zinsen p.a." wert={euro(z.zinsenPa)} />
                </TipRahmen>
              ) : null;
            }}
          />
          <Bar
            dataKey="restschuld"
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            isAnimationActive={false}
            label={(p: {
              x?: number;
              y?: number;
              width?: number;
              height?: number;
              value?: number;
            }) => (
              <text
                x={(p.x ?? 0) + (p.width ?? 0) + 6}
                y={(p.y ?? 0) + (p.height ?? 0) / 2}
                dominantBaseline="central"
                fontSize={11}
                fill="var(--text-muted)"
              >
                {euroKompakt(p.value ?? 0)}
              </text>
            )}
          >
            {daten.map((z) => (
              <Cell key={z.id} fill={GRUPPE_FARBE[z.gruppe]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Verbindlichkeiten je Gesellschaft, gestapelt Bank / Privat / Intern. */
export function GesellschaftDiagramm({
  zeilen,
  name,
  langName,
}: {
  zeilen: NehmerZeile[];
  name: (id: string) => string;
  langName: (id: string) => string;
}) {
  const daten = zeilen.map((z) => ({
    ...z,
    label: name(z.companyId),
    gesamt: z.bank + z.privat + z.intern,
  }));
  const gruppen: Gruppe[] = ["bank", "privat", "intern"];
  return (
    <figure aria-label="Verbindlichkeiten je Gesellschaft" className="w-full">
      <ResponsiveContainer
        width="100%"
        height={Math.max(140, daten.length * 40 + 24)}
      >
        <BarChart
          data={daten}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          barCategoryGap={10}
        >
          <CartesianGrid horizontal={false} stroke="var(--hairline)" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => euroKompakt(v)}
            tick={ACHSE}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={ACHSE_NAME}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            content={({ active, payload }) => {
              const z = active ? payload?.[0]?.payload : null;
              return z ? (
                <TipRahmen titel={langName(z.companyId)}>
                  {gruppen
                    .filter((g) => z[g] > 0)
                    .map((g) => (
                      <TipZeile
                        key={g}
                        farbe={GRUPPE_FARBE[g]}
                        label={GRUPPE_LABEL[g]}
                        wert={euro(z[g])}
                      />
                    ))}
                  <div className="my-1 border-t border-hairline" />
                  <TipZeile label="Gesamt" wert={euro(z.gesamt)} fett />
                </TipRahmen>
              ) : null;
            }}
          />
          {gruppen.map((g, i) => (
            <Bar
              key={g}
              dataKey={g}
              stackId="a"
              fill={GRUPPE_FARBE[g]}
              {...FUGE}
              radius={i === gruppen.length - 1 ? [0, 4, 4, 0] : 0}
              maxBarSize={22}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Fälligkeits- und Zinsbindungsprofil je Jahr. */
export function ProfilDiagramm({ jahre }: { jahre: ProfilJahr[] }) {
  const gruppen: Gruppe[] = ["bank", "privat", "intern"];
  const label = (j: string) => (j === "offen" ? "unbefristet" : j);
  return (
    <figure aria-label="Fälligkeitsprofil" className="w-full">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={jahre}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          <XAxis
            dataKey="jahr"
            tickFormatter={label}
            tick={ACHSE}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => euroKompakt(v)}
            tick={ACHSE}
            tickLine={false}
            axisLine={false}
            width={88}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            content={({ active, payload }) => {
              const z = active ? (payload?.[0]?.payload as ProfilJahr) : null;
              return z ? (
                <TipRahmen
                  titel={
                    z.jahr === "offen"
                      ? "Unbefristet / ohne Enddatum"
                      : `Ende oder Zinsbindung ${z.jahr}`
                  }
                >
                  {gruppen
                    .filter((g) => z[g] > 0)
                    .map((g) => (
                      <TipZeile
                        key={g}
                        farbe={GRUPPE_FARBE[g]}
                        label={GRUPPE_LABEL[g]}
                        wert={euro(z[g])}
                      />
                    ))}
                  <div className="my-1 border-t border-hairline" />
                  <TipZeile
                    label="Gesamt"
                    wert={euro(z.bank + z.privat + z.intern)}
                    fett
                  />
                </TipRahmen>
              ) : null;
            }}
          />
          {gruppen.map((g, i) => (
            <Bar
              key={g}
              dataKey={g}
              stackId="a"
              fill={GRUPPE_FARBE[g]}
              {...FUGE}
              radius={i === gruppen.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={40}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Interne Netto-Position: rechts Gläubiger (gibt mehr), links Schuldner. */
export function NettoDiagramm({
  zeilen,
  name,
  langName,
}: {
  zeilen: NettoZeile[];
  name: (id: string) => string;
  langName: (id: string) => string;
}) {
  const daten = zeilen.map((z) => ({ ...z, label: name(z.id) }));
  const GLAEUBIGER = GRUPPE_FARBE.intern;
  const SCHULDNER = "var(--text-subtle)";
  return (
    <figure aria-label="Interne Netto-Position" className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: GLAEUBIGER }}
          />
          gibt mehr, als sie nimmt (Gläubiger)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: SCHULDNER }}
          />
          nimmt mehr, als sie gibt (Schuldner)
        </span>
      </div>
      <ResponsiveContainer
        width="100%"
        height={Math.max(140, daten.length * 36 + 24)}
      >
        <BarChart
          data={daten}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid horizontal={false} stroke="var(--hairline)" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => euroKompakt(v)}
            tick={ACHSE}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={ACHSE_NAME}
            tickLine={false}
            axisLine={false}
            width={140}
          />
          <ReferenceLine x={0} stroke="var(--input)" />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            content={({ active, payload }) => {
              const z = active ? (payload?.[0]?.payload as NettoZeile) : null;
              return z ? (
                <TipRahmen titel={langName(z.id)}>
                  <TipZeile
                    label="Forderungen (gegeben)"
                    wert={euro(z.forderungen)}
                  />
                  <TipZeile
                    label="Verbindlichkeiten (genommen)"
                    wert={euro(z.verbindlichkeiten)}
                  />
                  <div className="my-1 border-t border-hairline" />
                  <TipZeile label="Netto" wert={euro(z.netto)} fett />
                </TipRahmen>
              ) : null;
            }}
          />
          <Bar dataKey="netto" maxBarSize={20} isAnimationActive={false}>
            {daten.map((z) => (
              <Cell
                key={z.id}
                fill={z.netto >= 0 ? GLAEUBIGER : SCHULDNER}
                radius={
                  (z.netto >= 0
                    ? [0, 4, 4, 0]
                    : [4, 0, 0, 4]) as unknown as number
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

const LAUFZEIT_TEXT: Record<LaufzeitZeile["art"], string> = {
  variabel: "variabel",
  zinsbindung: "Zinsbindung bis",
  ende: "läuft bis",
  unbefristet: "unbefristet",
};

/** Schraffur für variabel verzinste Darlehen (Identität nicht nur über Farbe). */
function schraffur(farbe: string) {
  return `repeating-linear-gradient(135deg, ${farbe} 0 5px, color-mix(in oklch, ${farbe} 35%, transparent) 5px 9px)`;
}

/**
 * Laufzeiten externer Darlehen als Zeitstrahl ab heute: Festzins bis
 * Zinsbindungs- bzw. Vertragsende, variabel schraffiert, unbefristet blendet aus.
 */
export function LaufzeitDiagramm({
  zeilen,
  stichtag,
  name,
  kurz,
}: {
  zeilen: LaufzeitZeile[];
  stichtag: IsoDatum;
  name: (z: LaufzeitZeile) => string;
  kurz: (z: LaufzeitZeile) => string;
}) {
  const startJahr = teile(stichtag).jahr;
  const letztes = Math.max(
    startJahr + 5,
    ...zeilen.filter((z) => z.bis).map((z) => teile(z.bis!).jahr + 1),
  );
  const endJahr = Math.min(letztes, startJahr + 15);
  const ende = `${endJahr}-12-31`;
  const spanne = tageZwischen(stichtag, ende);
  const pos = (d: IsoDatum) =>
    Math.max(0, Math.min(1, tageZwischen(stichtag, d) / spanne)) * 100;
  const jahre = Array.from(
    { length: endJahr - startJahr },
    (_, i) => startJahr + 1 + i,
  );
  const variabel = zeilen.filter((z) => z.art === "variabel");
  const summe = zeilen.reduce((a, z) => a + z.restschuld, 0) || 1;
  const sv = variabel.reduce((a, z) => a + z.restschuld, 0);
  const naechste = zeilen
    .filter((z) => z.art !== "variabel" && z.bis)
    .sort((a, b) => a.bis!.localeCompare(b.bis!))[0];
  const zwoelf = pos(plusMonate(stichtag, 12));

  return (
    <figure aria-label="Zinsbindung und Laufzeit externer Darlehen">
      <dl className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-text-muted">Variabel verzinst</dt>
          <dd className="mt-1 text-xl font-semibold tracking-[-0.02em] text-heading tabular-nums">
            {euroKompakt(sv)}
          </dd>
          <dd className="mt-0.5 text-xs text-text-muted">
            {variabel.length} Darlehen · {prozent(sv / summe, 0)} der externen
            Restschuld
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Fester Zins</dt>
          <dd className="mt-1 text-xl font-semibold tracking-[-0.02em] text-heading tabular-nums">
            {euroKompakt(summe - sv)}
          </dd>
          <dd className="mt-0.5 text-xs text-text-muted">
            {zeilen.length - variabel.length} Darlehen
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Nächster Ablauf</dt>
          <dd className="mt-1 text-xl font-semibold tracking-[-0.02em] text-heading tabular-nums">
            {naechste ? datumDe(naechste.bis) : "–"}
          </dd>
          <dd className="mt-0.5 truncate text-xs text-text-muted">
            {naechste
              ? `${naechste.loan.id} · ${kurz(naechste)} · ${euroKompakt(naechste.restschuld)}`
              : "kein festes Enddatum"}
          </dd>
        </div>
      </dl>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <Legende gruppen={["bank", "privat"]} />
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 rounded-sm"
            style={{ background: schraffur("var(--text-muted)") }}
            aria-hidden
          />
          variabel verzinst
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, var(--text-muted), transparent)",
            }}
            aria-hidden
          />
          unbefristet
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
        {/* Achse */}
        <div />
        <div className="relative h-5 text-[11px] text-text-subtle">
          <span className="absolute left-0">heute</span>
          {jahre.map((j) => {
            const x = pos(`${j}-01-01`);
            return x < 97 && x > 6 ? (
              <span
                key={j}
                className="absolute -translate-x-1/2 tabular-nums"
                style={{ left: `${x}%` }}
              >
                {j}
              </span>
            ) : null;
          })}
        </div>
        <div />

        {zeilen.map((z) => {
          const farbe = GRUPPE_FARBE[z.gruppe];
          const breite = z.bis ? Math.max(pos(z.bis), 1.2) : 100;
          const hintergrund =
            z.art === "variabel"
              ? schraffur(farbe)
              : z.bis
                ? farbe
                : `linear-gradient(to right, ${farbe} 55%, transparent)`;
          return (
            <div key={z.loan.id} className="group contents">
              <div className="min-w-0 border-t border-hairline py-2">
                <div className="truncate text-sm font-medium text-heading">
                  {z.loan.id}
                </div>
                <div className="truncate text-xs text-text-subtle">
                  {kurz(z)}
                </div>
              </div>
              <div className="relative h-full border-t border-hairline py-2">
                <div className="relative h-full min-h-8">
                  {jahre.map((j) => (
                    <span
                      key={j}
                      className="absolute inset-y-0 w-px bg-hairline"
                      style={{ left: `${pos(`${j}-01-01`)}%` }}
                      aria-hidden
                    />
                  ))}
                  <span
                    className="absolute inset-y-0 border-l border-dashed border-warn/60"
                    style={{ left: `${zwoelf}%` }}
                    aria-hidden
                  />
                  <div
                    className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-r-[4px]"
                    style={{ width: `${breite}%`, background: hintergrund }}
                  />
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute left-2 top-full z-20 mt-1 hidden w-64 group-hover:block"
                  >
                    <TipRahmen titel={`${z.loan.id} · ${name(z)}`}>
                      <TipZeile
                        farbe={farbe}
                        label="Restschuld"
                        wert={euro(z.restschuld)}
                        fett
                      />
                      <TipZeile label="Zins" wert={prozent(z.loan.rate)} />
                      <TipZeile
                        label="Zinsart"
                        wert={z.art === "variabel" ? "variabel" : "fest"}
                      />
                      <TipZeile
                        label={LAUFZEIT_TEXT[z.art]}
                        wert={z.bis ? datumDe(z.bis) : "offen"}
                      />
                    </TipRahmen>
                  </div>
                </div>
              </div>
              <div className="border-t border-hairline py-2 text-right">
                <div className="text-sm tabular-nums text-foreground">
                  {euroKompakt(z.restschuld)}
                </div>
                <div className="text-xs tabular-nums text-text-subtle">
                  {z.art === "variabel" && !z.bis
                    ? "variabel"
                    : z.bis
                      ? `${z.art === "variabel" ? "variabel, " : ""}${datumDe(z.bis)}`
                      : "unbefristet"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Gestrichelte Linie: in 12 Monaten. Bei Festzins endet der Balken mit der
        Zinsbindung, sonst mit dem Vertragsende.
      </p>
    </figure>
  );
}
