import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface RolleBeschreibungFeldProps {
  value: string;
  onChange: (value: string) => void;
  readonly: boolean;
  className?: string;
}

export function RolleBeschreibungFeld({
  value,
  onChange,
  readonly,
  className,
}: RolleBeschreibungFeldProps) {
  if (readonly) {
    return (
      <p className={cn("text-sm text-text-muted", className)}>
        {value.trim() || "Keine Beschreibung"}
      </p>
    );
  }

  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      maxLength={500}
      placeholder="Kurzbeschreibung der Rolle"
      className={cn("resize-none text-sm", className)}
    />
  );
}
