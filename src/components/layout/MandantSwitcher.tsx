import { ChevronDown, Building2 } from "lucide-react";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useMandant } from "@/hooks/useMandant";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MandantSwitcher() {
  const { aktiveMandant, mandanten, waehleMandant, darfAlleMandanten } = useMandant();
  return (
    <PermissionGate berechtigung="aktion.mandant.wechseln">
      <DropdownMenu>
      <DropdownMenuTrigger className="hairline-l hairline-r flex items-center gap-2 border-hairline px-4 py-2 text-left hover:bg-surface-muted focus:outline-none">
        <Building2 className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
        <div className="flex flex-col">
          <span className="label-caps text-text-subtle">Mandant</span>
          <span className="text-sm font-medium text-heading">
            {aktiveMandant
              ? aktiveMandant.name
              : darfAlleMandanten
                ? "Alle Mandanten"
                : mandanten.length === 1
                  ? (mandanten[0]?.name ?? "Mandant")
                  : "Alle zugewiesenen"}
          </span>
        </div>
        <ChevronDown className="ml-2 h-4 w-4 text-text-subtle" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="label-caps">Mandant wählen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mandanten.length === 0 ? (
          <div className="px-2 py-3 text-xs text-text-muted">
            Noch keine Mandanten angelegt. Verwaltung erfolgt unter Verwaltung › Mandanten.
          </div>
        ) : (
          <>
            {(darfAlleMandanten || mandanten.length > 1) && (
              <DropdownMenuItem onSelect={() => waehleMandant(null)}>
                {darfAlleMandanten ? "Alle Mandanten" : "Alle zugewiesenen"}
              </DropdownMenuItem>
            )}
            {mandanten.map((g) => (
              <DropdownMenuItem key={g.id} onSelect={() => waehleMandant(g.id)}>
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