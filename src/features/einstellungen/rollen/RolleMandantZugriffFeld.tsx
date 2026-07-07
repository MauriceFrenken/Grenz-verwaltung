import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MANDANT_ZUWEISUNG_OPTIONEN } from "@/lib/rollenMandant";
import { cn } from "@/lib/utils";
import type { MandantZuweisung } from "@/types";

interface RolleMandantZugriffFeldProps {
  value: MandantZuweisung;
  onChange: (value: MandantZuweisung) => void;
  readonly: boolean;
  className?: string;
}

export function RolleMandantZugriffFeld({
  value,
  onChange,
  readonly,
  className,
}: RolleMandantZugriffFeldProps) {
  const aktuelleOption = MANDANT_ZUWEISUNG_OPTIONEN.find((o) => o.wert === value);

  if (readonly) {
    return (
      <div className={cn("grid gap-1", className)}>
        <span className="label-caps text-text-subtle">Mandantenzugriff</span>
        <p className="text-sm text-text-muted">{aktuelleOption?.label ?? value}</p>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor="mandant-zuweisung">Mandantenzugriff bei Benutzerzuweisung</Label>
      <Select value={value} onValueChange={(v) => onChange(v as MandantZuweisung)}>
        <SelectTrigger id="mandant-zuweisung" className="rounded-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MANDANT_ZUWEISUNG_OPTIONEN.map((option) => (
            <SelectItem key={option.wert} value={option.wert}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
