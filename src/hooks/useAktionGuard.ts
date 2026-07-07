import { toast } from "sonner";
import { usePermissions } from "@/hooks/useAuth";
import type { AktionsBerechtigungId } from "@/lib/permissions";
import { AKTIONS_BERECHTIGUNGEN } from "@/lib/permissions/registry";

function aktionsLabel(id: AktionsBerechtigungId): string {
  return AKTIONS_BERECHTIGUNGEN.find((a) => a.id === id)?.label ?? id;
}

export function useAktionGuard() {
  const { darfAktion } = usePermissions();

  return {
    erlaubtOderHinweis(berechtigung: AktionsBerechtigungId): boolean {
      if (darfAktion(berechtigung)) return true;
      toast.error(`Keine Berechtigung: ${aktionsLabel(berechtigung)}`);
      return false;
    },
  };
}
