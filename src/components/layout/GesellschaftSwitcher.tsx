import { ChevronDown, Building2 } from "lucide-react";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useGesellschaft } from "@/hooks/useGesellschaft";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function GesellschaftSwitcher() {
  const { aktiveGesellschaft, gesellschaften, waehleGesellschaft, darfAlleGesellschaften } = useGesellschaft();
  return (
    <PermissionGate berechtigung="aktion.gesellschaft.wechseln">
      <DropdownMenu>
      <DropdownMenuTrigger className="hairline-l hairline-r flex items-center gap-2 border-hairline px-4 py-2 text-left hover:bg-surface-muted focus:outline-none">
        <Building2 className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
        <div className="flex flex-col">
          <span className="label-caps text-text-subtle">Gesellschaft</span>
          <span className="text-sm font-medium text-heading">
            {aktiveGesellschaft
              ? aktiveGesellschaft.name
              : darfAlleGesellschaften
                ? "Alle Gesellschaften"
                : gesellschaften.length === 1
                  ? (gesellschaften[0]?.name ?? "Gesellschaft")
                  : "Alle zugewiesenen"}
          </span>
        </div>
        <ChevronDown className="ml-2 h-4 w-4 text-text-subtle" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="label-caps">Gesellschaft wählen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {gesellschaften.length === 0 ? (
          <div className="px-2 py-3 text-xs text-text-muted">
            Noch keine Gesellschaften angelegt. Verwaltung erfolgt unter Verwaltung › Gesellschaften.
          </div>
        ) : (
          <>
            {(darfAlleGesellschaften || gesellschaften.length > 1) && (
              <DropdownMenuItem onSelect={() => waehleGesellschaft(null)}>
                {darfAlleGesellschaften ? "Alle Gesellschaften" : "Alle zugewiesenen"}
              </DropdownMenuItem>
            )}
            {gesellschaften.map((g) => (
              <DropdownMenuItem key={g.id} onSelect={() => waehleGesellschaft(g.id)}>
                <span className="flex-1">{g.name}</span>
                <span className="label-caps text-text-subtle">{g.kuerzel}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    </PermissionGate>
  );
}