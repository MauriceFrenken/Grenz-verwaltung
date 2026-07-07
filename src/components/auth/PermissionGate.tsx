import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/useAuth";
import type { AktionsBerechtigungId } from "@/lib/permissions";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PermissionGateProps {
  berechtigung: AktionsBerechtigungId;
  fallback?: "hidden" | "disabled";
  /** Platzhalter, solange Rollen-Berechtigungen noch geladen werden */
  loading?: "hidden" | "skeleton";
  skeletonClassName?: string;
  children: ReactNode;
}

function AktionLadeSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Aktion wird geladen" className="inline-flex">
      <Skeleton className={cn("h-8 w-36 shrink-0 rounded-md", className)} aria-hidden />
    </div>
  );
}

/**
 * Blendet Aktionen aus, wenn die aktuelle Rolle keine Berechtigung hat.
 * Neue Buttons immer mit PermissionGate wrappen — siehe AGENTS.md.
 */
export function PermissionGate({
  berechtigung,
  fallback = "hidden",
  loading = "skeleton",
  skeletonClassName,
  children,
}: PermissionGateProps) {
  const { darfAktion, permissionsLoading } = usePermissions();

  if (permissionsLoading) {
    if (loading === "skeleton") {
      return <AktionLadeSkeleton className={skeletonClassName} />;
    }
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
