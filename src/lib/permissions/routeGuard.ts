import { redirect } from "@tanstack/react-router";
import { hatBerechtigung } from "./resolve";
import {
  SEITEN_BERECHTIGUNGEN,
  seitenBerechtigungFuerPfad,
  type SeitenBerechtigungId,
} from "./registry";
import { useAuthStore } from "@/store/auth";
import { usePermissionsStore } from "@/store/permissions";
import { primaereRolle } from "./hierarchy";
import type { RolleName } from "@/types";
import type { RolleBerechtigungenMap } from "./registry";

function ersteErlaubteSeite(rolle: RolleName | null, matrix: RolleBerechtigungenMap): string {
  for (const seite of SEITEN_BERECHTIGUNGEN) {
    if (hatBerechtigung(rolle, seite.id, matrix)) {
      return seite.pfad;
    }
  }
  return "/anmelden";
}

/** Prüft Seiten-Zugriff für TanStack Router beforeLoad (ohne React-Hooks). */
export function pruefeSeitenZugriff(seitenId: SeitenBerechtigungId): void {
  const { benutzer, isLoading } = useAuthStore.getState();

  // AuthGate / Session-Setup übernehmen — sonst Redirect-Schleife auf /
  if (isLoading || !benutzer) {
    return;
  }

  const matrix = usePermissionsStore.getState().matrix;
  const rangMap = usePermissionsStore.getState().rangMap();
  const rolle = primaereRolle(benutzer.rollen, rangMap);

  if (!hatBerechtigung(rolle, seitenId, matrix)) {
    const ziel = ersteErlaubteSeite(rolle, matrix);
    const aktuelleSeite = SEITEN_BERECHTIGUNGEN.find((s) => s.id === seitenId)?.pfad;
    if (ziel !== aktuelleSeite) {
      throw redirect({ to: ziel });
    }
  }
}

export function pruefeSeitenZugriffFuerPfad(pfad: string): void {
  const seitenId = seitenBerechtigungFuerPfad(pfad);
  if (seitenId) {
    pruefeSeitenZugriff(seitenId);
  }
}

/** Factory für Route beforeLoad mit fester Seiten-ID. */
export function seitenGuard(seitenId: SeitenBerechtigungId) {
  return () => {
    pruefeSeitenZugriff(seitenId);
  };
}
