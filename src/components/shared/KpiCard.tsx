import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  wert: ReactNode;
  hilfetext?: string;
  aktion?: ReactNode;
}

export function KpiCard({ label, wert, hilfetext, aktion }: KpiCardProps) {
  return (
    <div className="flex flex-col justify-between border border-hairline bg-surface p-5">
      <span className="label-caps text-text-muted">{label}</span>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-heading">{wert}</div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-text-subtle">{hilfetext ?? "\u00A0"}</span>
        {aktion}
      </div>
    </div>
  );
}