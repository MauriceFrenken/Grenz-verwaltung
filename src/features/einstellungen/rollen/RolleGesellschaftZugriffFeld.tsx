import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GESELLSCHAFT_ZUWEISUNG_OPTIONEN } from "@/lib/rollenGesellschaft";
import { cn } from "@/lib/utils";
import type { GesellschaftZuweisung } from "@/types";

interface RolleGesellschaftZugriffFeldProps {
  value: GesellschaftZuweisung;
  onChange: (value: GesellschaftZuweisung) => void;
  readonly: boolean;
  className?: string;
}

export function RolleGesellschaftZugriffFeld({
  value,
  onChange,
  readonly,
  className,
}: RolleGesellschaftZugriffFeldProps) {
  const aktuelleOption = GESELLSCHAFT_ZUWEISUNG_OPTIONEN.find((o) => o.wert === value);

  if (readonly) {
    return (
      <div className={cn("grid gap-1", className)}>
        <span className="label-caps text-text-subtle">Gesellschaftszugriff</span>
        <p className="text-sm text-text-muted">{aktuelleOption?.label ?? value}</p>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor="gesellschaft-zuweisung">Gesellschaftszugriff bei Benutzerzuweisung</Label>
      <Select value={value} onValueChange={(v) => onChange(v as GesellschaftZuweisung)}>
        <SelectTrigger id="gesellschaft-zuweisung" className="rounded-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GESELLSCHAFT_ZUWEISUNG_OPTIONEN.map((option) => (
            <SelectItem key={option.wert} value={option.wert}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
