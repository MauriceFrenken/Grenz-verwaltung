import { STATUS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Ton = "neutral" | "danger" | "success" | "warn";

const DANGER = new Set(["fehler", "abgelehnt", "getrennt", "storniert", "fehlt"]);
const WARN = new Set([
  "in_pruefung",
  "offen",
  "wartung",
  "geplant",
  "entwurf",
  "leerstand",
  "analysiert",
  "teilweise",
  "ohne_iban",
  "ueberzahlung",
]);
const SUCCESS = new Set([
  "aktiv",
  "verbunden",
  "gebucht",
  "vermietet",
  "abgelegt",
  "freigegeben",
  "versendet",
  "ausgeglichen",
  "abgeschlossen",
]);

function tonFor(status: string): Ton {
  if (DANGER.has(status)) return "danger";
  if (WARN.has(status)) return "warn";
  if (SUCCESS.has(status)) return "success";
  return "neutral";
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const ton = tonFor(status);
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center border px-2 py-0.5 text-[10px]",
        ton === "neutral" && "border-foreground text-foreground",
        ton === "success" && "border-foreground text-foreground",
        ton === "warn" && "border-foreground bg-surface-muted text-foreground",
        ton === "danger" && "border-danger text-danger",
      )}
    >
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}