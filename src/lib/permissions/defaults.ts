import type { RolleName } from "@/types";
import {
  AKTIONS_BERECHTIGUNGEN,
  alleBerechtigungsIds,
  SYSTEM_KONFIGURIERBARE_ROLLEN,
  SEITEN_BERECHTIGUNGEN,
  type BerechtigungId,
  type KonfigurierbareRolle,
  type RolleBerechtigungenMap,
  type SystemKonfigurierbareRolle,
} from "./registry";

const ALLE_IDS = alleBerechtigungsIds();

function alleAktiv(): Record<BerechtigungId, boolean> {
  return Object.fromEntries(ALLE_IDS.map((id) => [id, true])) as Record<BerechtigungId, boolean>;
}

function alleInaktiv(): Record<BerechtigungId, boolean> {
  return Object.fromEntries(ALLE_IDS.map((id) => [id, false])) as Record<BerechtigungId, boolean>;
}

function nurSeiten(ids: string[]): Record<BerechtigungId, boolean> {
  const set = new Set(ids);
  return Object.fromEntries(
    ALLE_IDS.map((id) => [id, set.has(id)]),
  ) as Record<BerechtigungId, boolean>;
}

const MANAGER_SEITEN: string[] = [
  "seite.dashboard",
  "seite.verwaltung.gesellschaften",
  "seite.verwaltung.objekte",
  "seite.verwaltung.einheiten",
  "seite.verwaltung.mietverhaeltnisse",
  "seite.verwaltung.sollstellung",
  "seite.verwaltung.zahlungen",
  "seite.verwaltung.nebenkosten",
  "seite.dokumente.ablage",
  "seite.dokumente.pruefordner",
  "seite.dokumente.pruefung",
  "seite.transaktionen.liste",
  "seite.transaktionen.expose_import",
  "seite.einstellungen.rollen",
  "seite.einstellungen.audit",
  "seite.einstellungen.benutzer",
];

const MANAGER_AKTIONEN: string[] = [
  "aktion.dashboard.zeitraum.aendern",
  "aktion.verwaltung.gesellschaften.anlegen",
  "aktion.verwaltung.gesellschaften.bearbeiten",
  "aktion.verwaltung.gesellschaften.loeschen",
  "aktion.verwaltung.objekte.anlegen",
  "aktion.verwaltung.objekte.lesen",
  "aktion.verwaltung.objekte.bearbeiten",
  "aktion.verwaltung.objekte.loeschen",
  "aktion.verwaltung.einheiten.anlegen",
  "aktion.verwaltung.einheiten.bearbeiten",
  "aktion.verwaltung.einheiten.loeschen",
  "aktion.verwaltung.mietverhaeltnisse.anlegen",
  "aktion.verwaltung.mietverhaeltnisse.bearbeiten",
  "aktion.verwaltung.mietverhaeltnisse.loeschen",
  "aktion.buchhaltung.sollstellung.erzeugen",
  "aktion.buchhaltung.zahlungen.bankimport",
  "aktion.buchhaltung.nebenkosten.abrechnung_erstellen",
  "aktion.buchhaltung.nebenkosten.kostenposition_anlegen",
  "aktion.buchhaltung.nebenkosten.pdf_exportieren",
  "aktion.dokumente.pruefordner.bestaetigen",
  "aktion.dokumente.pruefordner.neu_zuordnen",
  "aktion.dokumente.pruefordner.ablehnen",
  "aktion.dokumente.pruefordner.ablegen",
  "aktion.dokumente.pruefordner.pruefen",
  "aktion.dokumente.pruefordner.analyse_wiederholen",
  "aktion.dokumente.pruefordner.buchen",
  "aktion.dokumente.pruefordner.exposes_verschieben",
  "aktion.dokumente.pruefordner.zu_tam",
  "aktion.dokumente.outlook.verbinden",
  "aktion.dokumente.kategorien.verwalten",
  "aktion.dokumente.posteingang.analysieren",
  "aktion.dokumente.ablage.bearbeiten",
  "aktion.transaktionen.liste.pruefen",
  "aktion.transaktionen.liste.exportieren",
  "aktion.transaktionen.liste.analyse_wiederholen",
  "aktion.transaktionen.expose_import.hochladen",
  "aktion.transaktionen.expose_import.uebernehmen",
  "aktion.transaktionen.expose_import.salesforce_session",
  "aktion.transaktionen.expose_import.korrigieren",
  "aktion.transaktionen.expose_import.verwerfen",
  "aktion.einstellungen.rollen.bearbeiten",
  "aktion.einstellungen.rollen.anlegen",
  "aktion.einstellungen.benutzer.einladen",
  "aktion.einstellungen.benutzer.bearbeiten",
  "aktion.einstellungen.benutzer.loeschen",
];

const MITARBEITER_SEITEN: string[] = [
  "seite.dashboard",
  "seite.verwaltung.objekte",
  "seite.verwaltung.einheiten",
  "seite.verwaltung.mietverhaeltnisse",
  "seite.dokumente.ablage",
  "seite.dokumente.pruefordner",
  "seite.dokumente.pruefung",
  "seite.einstellungen.audit",
  "seite.transaktionen.liste",
];

const MITARBEITER_AKTIONEN: string[] = [
  "aktion.dashboard.zeitraum.aendern",
  "aktion.verwaltung.objekte.anlegen",
  "aktion.verwaltung.objekte.lesen",
  "aktion.verwaltung.objekte.bearbeiten",
  "aktion.verwaltung.einheiten.anlegen",
  "aktion.verwaltung.einheiten.bearbeiten",
  "aktion.verwaltung.mietverhaeltnisse.anlegen",
  "aktion.verwaltung.mietverhaeltnisse.bearbeiten",
  "aktion.dokumente.pruefordner.bestaetigen",
  "aktion.dokumente.pruefordner.neu_zuordnen",
  "aktion.dokumente.pruefordner.ablehnen",
  "aktion.dokumente.pruefordner.ablegen",
  "aktion.dokumente.pruefordner.pruefen",
  "aktion.dokumente.pruefordner.analyse_wiederholen",
  "aktion.dokumente.pruefordner.buchen",
  "aktion.dokumente.pruefordner.exposes_verschieben",
  "aktion.dokumente.pruefordner.zu_tam",
  "aktion.dokumente.outlook.verbinden",
  "aktion.dokumente.kategorien.verwalten",
  "aktion.dokumente.posteingang.analysieren",
  "aktion.dokumente.ablage.bearbeiten",
];

const LESER_SEITEN: string[] = [
  "seite.dashboard",
  "seite.verwaltung.objekte",
  "seite.verwaltung.einheiten",
  "seite.verwaltung.mietverhaeltnisse",
  "seite.dokumente.ablage",
  "seite.einstellungen.audit",
  "seite.transaktionen.liste",
];

function managerDefaults(): Record<BerechtigungId, boolean> {
  const erlaubt = new Set([...MANAGER_SEITEN, ...MANAGER_AKTIONEN]);
  return Object.fromEntries(ALLE_IDS.map((id) => [id, erlaubt.has(id)])) as Record<
    BerechtigungId,
    boolean
  >;
}

function mitarbeiterDefaults(): Record<BerechtigungId, boolean> {
  const erlaubt = new Set([...MITARBEITER_SEITEN, ...MITARBEITER_AKTIONEN]);
  return Object.fromEntries(ALLE_IDS.map((id) => [id, erlaubt.has(id)])) as Record<
    BerechtigungId,
    boolean
  >;
}

const DEFAULTS_PRO_ROLLE: Record<SystemKonfigurierbareRolle, Record<BerechtigungId, boolean>> = {
  administrator: alleAktiv(),
  manager: managerDefaults(),
  mitarbeiter: mitarbeiterDefaults(),
  leser: nurSeiten(LESER_SEITEN),
};

export function defaultMatrixFuerRolle(rolle: KonfigurierbareRolle): Record<BerechtigungId, boolean> {
  if (istSystemKonfigurierbareRolle(rolle)) {
    return { ...DEFAULTS_PRO_ROLLE[rolle] };
  }
  return alleInaktiv();
}

function istSystemKonfigurierbareRolle(rolle: string): rolle is SystemKonfigurierbareRolle {
  return (SYSTEM_KONFIGURIERBARE_ROLLEN as readonly string[]).includes(rolle);
}

export function defaultMatrix(rollenIds: KonfigurierbareRolle[] = [...SYSTEM_KONFIGURIERBARE_ROLLEN]): RolleBerechtigungenMap {
  return Object.fromEntries(
    rollenIds.map((rolle) => [rolle, defaultMatrixFuerRolle(rolle)]),
  ) as RolleBerechtigungenMap;
}

export function matrixMitRollen(
  basis: RolleBerechtigungenMap,
  rollenIds: KonfigurierbareRolle[],
): RolleBerechtigungenMap {
  const erweitert = { ...basis };
  for (const rolle of rollenIds) {
    if (!erweitert[rolle]) {
      erweitert[rolle] = defaultMatrixFuerRolle(rolle);
    }
  }
  return erweitert;
}

/** op_admin hat immer Vollzugriff — nicht in der Matrix gespeichert. */
export function hatOpAdminVollzugriff(rolle: string | null | undefined): boolean {
  return rolle === "op_admin";
}

export { SEITEN_BERECHTIGUNGEN, AKTIONS_BERECHTIGUNGEN };
