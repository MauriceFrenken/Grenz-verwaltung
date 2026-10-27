import { euroKurz } from "@/features/kennzahlen/hilfen";
import type { PruefungKurz } from "@/lib/investoren/typen";
import { PRUEF_LABEL, STATUS_LABEL } from "@/lib/investoren/typen";
import { cn } from "@/lib/utils";

export function volumenText(min: number | null, max: number | null): string {
  if (min && max) return `${euroKurz(min)} bis ${euroKurz(max)}`;
  if (max) return `bis ${euroKurz(max)}`;
  if (min) return `ab ${euroKurz(min)}`;
  return "k. A.";
}

const STATUS_TON: Record<string, string> = {
  aktiv: "bg-ok-soft text-ok",
  ruhend: "bg-surface-muted text-text-muted",
  kein_interesse: "bg-warn-soft text-warn",
  gesperrt: "bg-bad-soft text-bad",
  erloschen: "bg-bad-soft text-bad",
  neu: "bg-accent-soft text-brand-text",
};

export function StatusMarke({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TON[status] ?? STATUS_TON.ruhend)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const PRUEF_TON: Record<string, string> = {
  aktiv: "text-ok",
  insolvenz: "text-bad",
  liquidation: "text-bad",
  geloescht: "text-bad",
  unklar: "text-text-subtle",
};

/** Ergebnis der Existenz- und Insolvenzprüfung, mit Quelle als Link. */
export function PruefMarke({ pruefung }: { pruefung: PruefungKurz | null }) {
  if (!pruefung) return <span className="text-xs text-text-subtle">nicht geprüft</span>;
  const text = PRUEF_LABEL[pruefung.status] ?? pruefung.status;
  const inhalt = (
    <span className={cn("text-xs font-medium", PRUEF_TON[pruefung.status])} title={pruefung.begruendung ?? undefined}>
      {text}
      {pruefung.aktiv2026 ? " · 2026 aktiv" : ""}
    </span>
  );
  return pruefung.quelleUrl ? (
    <a href={pruefung.quelleUrl} target="_blank" rel="noreferrer" className="hover:underline">
      {inhalt}
    </a>
  ) : (
    inhalt
  );
}
