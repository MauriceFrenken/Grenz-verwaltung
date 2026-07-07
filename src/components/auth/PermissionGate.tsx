import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/useAuth";
import type { AktionsBerechtigungId } from "@/lib/permissions";

interface PermissionGateProps {
  berechtigung: AktionsBerechtigungId;
  fallback?: "hidden" | "disabled";
  children: ReactNode;
}

/**
 * Blendet Aktionen aus, wenn die aktuelle Rolle keine Berechtigung hat.
 * Neue Buttons immer mit PermissionGate wrappen — siehe AGENTS.md.
 */
export function PermissionGate({
  berechtigung,
  fallback = "hidden",
  children,
}: PermissionGateProps) {
  const { darfAktion, permissionsLoading } = usePermissions();

  if (permissionsLoading) {
    return null;
  }

  if (!darfAktion(berechtigung)) {
    if (fallback === "hidden") {
      return null;
    }
    return (
      <span aria-disabled="true" className="pointer-events-none opacity-40">
        {children}
      </span>
    );
  }

  return children;
}
