import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  MessagesSquare,
} from "lucide-react";

import {
  checklistenStand,
  faelligStand,
  type FaelligStand,
} from "@/lib/aufgaben/logik";
import {
  themenfeldLabel,
  type Aufgabe,
  type Person,
  type Spalte,
} from "@/lib/aufgaben/typen";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const FELD =
  "h-9 w-full border border-input bg-background px-2 text-sm text-heading focus:outline-none focus:ring-1 focus:ring-ring";

const FAELLIG_TON: Record<Exclude<FaelligStand, null>, string> = {
  ueberfaellig: "bg-bad-soft text-bad",
  heute: "bg-warn-soft text-warn",
  bald: "bg-warn-soft text-warn",
  spaeter: "bg-surface-muted text-text-muted",
};

export function Initialen({
  person,
  klein,
}: {
  person: Person | undefined;
  klein?: boolean;
}) {
  if (!person) return null;
  return (
    <span
      title={person.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-brand font-medium text-white",
        klein ? "size-6 text-[10px]" : "size-7 text-[11px]",
      )}
    >
      {person.initialen}
    </span>
  );
}

export function AufgabeKarte({
  aufgabe,
  spalte,
  person,
  heute,
  ziehend,
  mitThemenfeld,
  mitStatus,
  onOeffnen,
  onDragStart,
  onDragEnd,
}: {
  aufgabe: Aufgabe;
  spalte: Spalte | undefined;
  person: Person | undefined;
  heute: string;
  ziehend: boolean;
  /** Themenfeld als Kennzeichen zeigen (Ansicht nach Status). */
  mitThemenfeld?: boolean;
  /** Spalte als Kennzeichen zeigen (Ansicht nach Themenfeld). */
  mitStatus?: boolean;
  onOeffnen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const stand = faelligStand(aufgabe, spalte, heute);
  const liste = checklistenStand(aufgabe.checkliste);
  return (
    <button
      type="button"
      draggable
      data-aufgabe={aufgabe.id}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOeffnen}
      className={cn(
        "group flex w-full cursor-grab flex-col gap-2 border border-hairline bg-elevated p-3 text-left shadow-[0_1px_0_rgb(0_0_0/0.04)] transition hover:border-[var(--gc-navy-hell)] active:cursor-grabbing",
        aufgabe.prioritaet === "hoch" && "border-l-[3px] border-l-brand",
        ziehend && "opacity-40",
      )}
    >
      {((mitThemenfeld && aufgabe.themenfeld) ||
        (mitStatus && spalte) ||
        aufgabe.ruecksprache) && (
        <span className="flex max-w-full flex-wrap gap-1">
          {mitThemenfeld && aufgabe.themenfeld && (
            <span className="bg-brand px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
              {themenfeldLabel(aufgabe.themenfeld, true)}
            </span>
          )}
          {mitStatus && spalte && (
            <span className="border border-hairline px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {spalte.titel}
            </span>
          )}
          {aufgabe.ruecksprache && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 bg-[var(--gc-hellblau-zart)] px-1.5 py-0.5 text-[11px] text-heading">
              <MessagesSquare className="size-3 shrink-0" />
              <span className="truncate">{aufgabe.ruecksprache}</span>
            </span>
          )}
        </span>
      )}
      <span
        className={cn(
          "text-sm leading-snug text-heading",
          spalte?.erledigt &&
            "text-text-muted line-through decoration-[var(--gc-grau)]",
        )}
      >
        {aufgabe.titel}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
        {aufgabe.faelligAm && (
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5",
              stand ? FAELLIG_TON[stand] : "bg-ok-soft text-ok",
            )}
          >
            <CalendarDays className="size-3" />
            {formatDate(aufgabe.faelligAm)}
          </span>
        )}
        {aufgabe.beschreibung && (
          <AlignLeft className="size-3.5" aria-label="Mit Beschreibung" />
        )}
        {liste.gesamt > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              liste.erledigt === liste.gesamt && "text-ok",
            )}
          >
            <CheckSquare className="size-3.5" />
            {liste.erledigt}/{liste.gesamt}
          </span>
        )}
        {aufgabe.prioritaet === "niedrig" && <span>niedrig</span>}
        <span className="ml-auto">
          <Initialen person={person} klein />
        </span>
      </span>
    </button>
  );
}
