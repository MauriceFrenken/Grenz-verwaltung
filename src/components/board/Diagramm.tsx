import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { euro, euroKompakt } from "@/lib/format/de";

export interface Reihe {
  schluessel: string;
  label: string;
  farbe: string;
  /** gestrichelt (z. B. Szenario) */
  gestrichelt?: boolean;
  flaeche?: boolean;
}

/**
 * Zeitreihe in EUR (Liquiditätsverlauf u. Ä.). Achsen beschriftet,
 * Tooltip mit Beträgen, optionale Referenzlinie (z. B. Mindestliquidität).
 */
export function ZeitreihenDiagramm<T extends Record<string, unknown>>({
  daten,
  xSchluessel,
  xFormat,
  reihen,
  referenz,
  hoehe = 260,
  label,
  kompakt,
}: {
  daten: T[];
  xSchluessel: keyof T & string;
  xFormat: (x: string) => string;
  reihen: Reihe[];
  referenz?: { wert: number; label: string };
  hoehe?: number;
  label: string;
  kompakt?: boolean;
}) {
  return (
    <figure aria-label={label} className="w-full">
      <ResponsiveContainer width="100%" height={hoehe}>
        <ComposedChart
          data={daten}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <defs>
            {reihen.map((r) => (
              <linearGradient
                key={r.schluessel}
                id={`fl-${r.schluessel}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={r.farbe} stopOpacity={0.18} />
                <stop offset="100%" stopColor={r.farbe} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          <XAxis
            dataKey={xSchluessel}
            tickFormatter={(v: string) => xFormat(v)}
            tick={{ fontSize: 11, fill: "var(--text-subtle)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={kompakt ? 24 : 32}
          />
          <YAxis
            tickFormatter={(v: number) => euroKompakt(v)}
            tick={{ fontSize: 11, fill: "var(--text-subtle)" }}
            tickLine={false}
            axisLine={false}
            width={kompakt ? 84 : 88}
          />
          <Tooltip
            cursor={{ stroke: "var(--input)" }}
            content={({ active, payload, label: x }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-hairline bg-elevated px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgb(0_0_0/0.2)]">
                  <div className="mb-1 font-medium text-heading">
                    {xFormat(String(x))}
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
                        {reihen.find((r) => r.schluessel === p.dataKey)?.label}
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
          {referenz ? (
            <ReferenceLine
              y={referenz.wert}
              stroke="var(--bad)"
              strokeDasharray="4 4"
              strokeOpacity={0.7}
              label={{
                value: referenz.label,
                position: "insideTopRight",
                fontSize: 11,
                fill: "var(--bad)",
              }}
            />
          ) : null}
          {reihen.map((r) =>
            r.flaeche === false ? (
              <Line
                key={r.schluessel}
                type="monotone"
                dataKey={r.schluessel}
                stroke={r.farbe}
                strokeWidth={1.75}
                strokeDasharray={r.gestrichelt ? "5 4" : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ) : (
              <Area
                key={r.schluessel}
                type="monotone"
                dataKey={r.schluessel}
                stroke={r.farbe}
                strokeWidth={1.75}
                strokeDasharray={r.gestrichelt ? "5 4" : undefined}
                fill={
                  r.gestrichelt ? "transparent" : `url(#fl-${r.schluessel})`
                }
                dot={false}
                isAnimationActive={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}
