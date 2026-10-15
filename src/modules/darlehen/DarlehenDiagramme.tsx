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
import { euro, euroKompakt, prozent } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import {
  GRUPPE_FARBE,
  GRUPPE_LABEL,
  type GeberZeile,
  type Gruppe,
  type KreisSummen,
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
