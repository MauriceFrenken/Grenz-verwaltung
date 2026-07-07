import type { RolleName } from "@/types";
import { defaultMatrixFuerRolle, hatOpAdminVollzugriff } from "./defaults";
import {
  alleBerechtigungsIds,
  type BerechtigungId,
  type KonfigurierbareRolle,
  type RolleBerechtigungenMap,
  SYSTEM_KONFIGURIERBARE_ROLLEN,
} from "./registry";

export type GespeicherteBerechtigung = {
  rolle: KonfigurierbareRolle;
  berechtigung_id: BerechtigungId;
  aktiv: boolean;
};

/** Merged DB-Einträge mit Code-Defaults (DB überschreibt Default). */
export function effektiveMatrix(
  gespeichert: GespeicherteBerechtigung[],
  rollenIds: KonfigurierbareRolle[] = [...SYSTEM_KONFIGURIERBARE_ROLLEN],
): RolleBerechtigungenMap {
  const basis = Object.fromEntries(
    rollenIds.map((rolle) => [rolle, defaultMatrixFuerRolle(rolle)]),
  ) as RolleBerechtigungenMap;

  for (const eintrag of gespeichert) {
    if (!basis[eintrag.rolle]) {
      basis[eintrag.rolle] = defaultMatrixFuerRolle(eintrag.rolle);
    }
    if (eintrag.berechtigung_id in basis[eintrag.rolle]) {
      basis[eintrag.rolle][eintrag.berechtigung_id] = eintrag.aktiv;
    }
  }

  return basis;
}

export function hatBerechtigung(
  rolle: string | null,
  berechtigungId: BerechtigungId,
  matrix: RolleBerechtigungenMap,
): boolean {
  if (!rolle) return false;
  if (hatOpAdminVollzugriff(rolle as RolleName)) return true;

  return matrix[rolle]?.[berechtigungId] ?? defaultMatrixFuerRolle(rolle)[berechtigungId] ?? false;
}

/** Berechtigungen, die ein Bearbeiter an niedrigere Rollen vergeben darf. */
export function vergebareBerechtigungen(
  bearbeiter: string | null,
  matrix: RolleBerechtigungenMap,
): Set<BerechtigungId> {
  if (!bearbeiter) return new Set();
  if (hatOpAdminVollzugriff(bearbeiter as RolleName)) {
    return new Set(alleBerechtigungsIds());
  }
  const ids = alleBerechtigungsIds().filter((id) => hatBerechtigung(bearbeiter, id, matrix));
  return new Set(ids);
}

/** Flacht die Matrix für DB-Upsert ab. */
export function matrixZuEintraegen(
  matrix: RolleBerechtigungenMap,
  rollenIds?: KonfigurierbareRolle[],
): GespeicherteBerechtigung[] {
  const rollen = rollenIds ?? Object.keys(matrix);
  const eintraege: GespeicherteBerechtigung[] = [];
  for (const rolle of rollen) {
    const werte = matrix[rolle];
    if (!werte) continue;
    for (const id of alleBerechtigungsIds()) {
      eintraege.push({
        rolle,
        berechtigung_id: id,
        aktiv: werte[id],
      });
    }
  }
  return eintraege;
}

export function matrixAusDbRows(
  rows: Array<{ rolle: string; berechtigung_id: string; aktiv: boolean }>,
  rollenIds: KonfigurierbareRolle[] = [...SYSTEM_KONFIGURIERBARE_ROLLEN],
): RolleBerechtigungenMap {
  const gueltige = rows.filter((r): r is GespeicherteBerechtigung =>
    alleBerechtigungsIds().includes(r.berechtigung_id as BerechtigungId),
  ) as GespeicherteBerechtigung[];

  const alleIds = new Set(rollenIds);
  for (const row of gueltige) {
    alleIds.add(row.rolle);
  }

  return effektiveMatrix(gueltige, [...alleIds]);
}
