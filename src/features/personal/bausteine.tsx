/** Gemeinsame Bausteine des Personalbereichs. */

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import type { Ampel } from "@/lib/personal/berechnen";
import type { Mitarbeiter } from "@/lib/personal/typen";
import { cn } from "@/lib/utils";

export const EINGABE =
  "flex h-9 w-full border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

export function Feld({
  label,
  children,
  hinweis,
  className,
}: {
  label: string;
  children: ReactNode;
  hinweis?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs text-text-muted">{label}</Label>
      {children}
      {hinweis ? <p className="text-xs text-text-subtle">{hinweis}</p> : null}
    </div>
  );
}

export function Auswahl<T extends string>({
  wert,
  optionen,
  onChange,
  leer,
  disabled,
}: {
  wert: T | "" | null;
  optionen: Array<{ wert: T; label: string }>;
  onChange: (w: T | "") => void;
  leer?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={EINGABE}
      value={wert ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T | "")}
    >
      {leer !== undefined ? <option value="">{leer}</option> : null}
      {optionen.map((o) => (
        <option key={o.wert} value={o.wert}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const AMPEL_STIL: Record<Ampel, string> = {
  ok: "bg-[var(--gc-navy)] text-white",
  offen: "bg-[var(--gc-hellblau)] text-heading",
  kritisch: "bg-danger text-white",
  entfaellt: "bg-surface-muted text-text-subtle",
};

export function AmpelMarke({
  ampel,
  children,
}: {
  ampel: Ampel;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium",
        AMPEL_STIL[ampel],
      )}
    >
      {children}
    </span>
  );
}

/** Aktive Mitarbeiter (ohne Ausgetretene vor dem Stichtag). */
export function aktiveMitarbeiter(
  liste: Mitarbeiter[],
  stichtag: string,
): Mitarbeiter[] {
  return liste.filter((m) => !m.austrittAm || m.austrittAm >= stichtag);
}

export function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tageText(n: number): string {
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${n === 1 ? "Tag" : "Tage"}`;
}

export function Kasten({
  titel,
  aktion,
  children,
}: {
  titel: string;
  aktion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-heading">{titel}</h2>
        {aktion}
      </div>
      {children}
    </section>
  );
}
