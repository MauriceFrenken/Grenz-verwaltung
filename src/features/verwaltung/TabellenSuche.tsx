import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TabellenSuche({
  value,
  onChange,
  placeholder = "Suchen…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="tabellen-suche" className="label-caps text-text-subtle">
        Suche
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          strokeWidth={1.5}
        />
        <Input
          id="tabellen-suche"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-72 rounded-none pl-9"
        />
      </div>
    </div>
  );
}

export function VerwaltungTabellenLeiste({
  children,
  suchbegriff,
  onSuchbegriffChange,
  placeholder,
}: {
  children?: ReactNode;
  suchbegriff: string;
  onSuchbegriffChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      {children}
      <TabellenSuche
        value={suchbegriff}
        onChange={onSuchbegriffChange}
        placeholder={placeholder}
      />
    </div>
  );
}
