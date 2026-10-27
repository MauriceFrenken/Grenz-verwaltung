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
import type { Aufgabe, Person, Spalte } from "@/lib/aufgaben/typen";
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
  onOeffnen,
  onDragStart,
  onDragEnd,
}: {
  aufgabe: Aufgabe;
  spalte: Spalte | undefined;
  person: Person | undefined;
  heute: string;
  ziehend: boolean;
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
      {aufgabe.ruecksprache && (
        <span className="inline-flex max-w-full items-center gap-1 self-start truncate bg-[var(--gc-hellblau-zart)] px-1.5 py-0.5 text-[11px] text-heading">
          <MessagesSquare className="size-3 shrink-0" />
          <span className="truncate">{aufgabe.ruecksprache}</span>
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
