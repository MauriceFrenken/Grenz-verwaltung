import type { RolleName, RollenDefinition } from "@/types";
import {
  SYSTEM_KONFIGURIERBARE_ROLLEN,
  type KonfigurierbareRolle,
  type SystemKonfigurierbareRolle,
} from "./registry";

export type { RollenDefinition } from "@/types";

/** Niedrigerer Rang = höhere Stufe. op_admin (0) ist systemseitig. */
export const ROLLE_RANG: Record<RolleName, number> = {
  op_admin: 0,
  administrator: 1,
  manager: 2,
  mitarbeiter: 3,
  leser: 4,
};

/** Rollen, die die Rollen-Seite öffnen dürfen (hardcoded — Henne-Ei-Schutz). */
export const ROLLEN_SEITE_ZUGRIFF: RolleName[] = ["op_admin", "administrator", "manager"];

export function rangMapAusRollen(rollen: RollenDefinition[]): Record<string, number> {
  const map: Record<string, number> = { op_admin: 0 };
  for (const rolle of rollen) {
    map[rolle.id] = rolle.rang;
  }
  return map;
}

export function rolleRang(rolle: string, rangMap: Record<string, number>): number {
  if (rolle === "op_admin") return 0;
  return rangMap[rolle] ?? ROLLE_RANG[rolle as RolleName] ?? 99;
}

export function primaereRolle(
  rollen: Array<{ rolle: string }>,
  rangMap: Record<string, number>,
): string | null {
  if (rollen.length === 0) return null;
  return rollen.reduce((best, r) =>
    rolleRang(r.rolle, rangMap) < rolleRang(best.rolle, rangMap) ? r : best,
  ).rolle;
}

/** Darf bearbeiter die Ziel-Rolle in der Matrix bearbeiten? (nur nach unten) */
export function darfRolleBearbeiten(
  bearbeiter: string | null,
  ziel: KonfigurierbareRolle,
  rangMap: Record<string, number>,
): boolean {
  if (!bearbeiter) return false;
  if (bearbeiter === "op_admin") return true;
  if (!ROLLEN_SEITE_ZUGRIFF.includes(bearbeiter as RolleName)) return false;
  return rolleRang(ziel, rangMap) > rolleRang(bearbeiter, rangMap);
}

function rollenMitFallback(alleRollen: KonfigurierbareRolle[]): KonfigurierbareRolle[] {
  return alleRollen.length > 0 ? alleRollen : [...SYSTEM_KONFIGURIERBARE_ROLLEN];
}

export function bearbeitbareRollen(
  bearbeiter: string | null,
  alleRollen: KonfigurierbareRolle[],
  rangMap: Record<string, number>,
): KonfigurierbareRolle[] {
  const basis = rollenMitFallback(alleRollen);
  if (bearbeiter === "op_admin") return [...basis];
  return basis.filter((rolle) => darfRolleBearbeiten(bearbeiter, rolle, rangMap));
}

/** Darf bearbeiter einen Benutzer mit zielRolle verwalten? OP-Admin: ausnahmslos alles. */
export function darfBenutzerVerwalten(
  bearbeiter: string | null,
  zielRolle: string,
  rangMap: Record<string, number>,
): boolean {
  if (!bearbeiter) return false;
  if (bearbeiter === "op_admin") return true;
  if (zielRolle === "op_admin") return false;
  return rolleRang(zielRolle, rangMap) > rolleRang(bearbeiter, rangMap);
}

/** Rollen, die beim Einladen/Bearbeiten zugewiesen werden dürfen. OP-Admin: alle inkl. op_admin. */
export function zuweisbareRollen(
  bearbeiter: string | null,
  alleRollen: KonfigurierbareRolle[],
  rangMap: Record<string, number>,
): KonfigurierbareRolle[] {
  const basis = rollenMitFallback(alleRollen);
  if (bearbeiter === "op_admin") {
    return ["op_admin", ...basis.filter((rolle) => rolle !== "op_admin")];
  }
  return bearbeitbareRollen(bearbeiter, basis, rangMap);
}

/** Bezugs-Rollen für Platzierung einer neuen Rolle (unterhalb der eigenen Stufe). */
export function platzierbareBezugsRollen(
  bearbeiter: string | null,
  rollen: RollenDefinition[],
  rangMap: Record<string, number>,
): RollenDefinition[] {
  if (!bearbeiter || bearbeiter === "op_admin") {
    return [...rollen].sort((a, b) => a.rang - b.rang);
  }
  const eigenerRang = rolleRang(bearbeiter, rangMap);
  return rollen.filter((r) => r.rang >= eigenerRang).sort((a, b) => a.rang - b.rang);
}

export function darfRollenSeite(bearbeiter: string | null): boolean {
  if (!bearbeiter) return false;
  return ROLLEN_SEITE_ZUGRIFF.includes(bearbeiter as RolleName);
}

export function istSystemKonfigurierbareRolle(rolle: string): rolle is SystemKonfigurierbareRolle {
  return (SYSTEM_KONFIGURIERBARE_ROLLEN as readonly string[]).includes(rolle);
}

/** @deprecated Nutze istSystemKonfigurierbareRolle */
export function istKonfigurierbareRolle(rolle: RolleName): rolle is SystemKonfigurierbareRolle {
  return istSystemKonfigurierbareRolle(rolle);
}
