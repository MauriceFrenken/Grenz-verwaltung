/**
 * Zentrale Berechtigungs-Registry — Single Source of Truth für Seiten- und Aktions-IDs.
 * Bei neuen Seiten/Buttons: Eintrag hier, Default in defaults.ts, Gate in UI.
 * Siehe AGENTS.md → Berechtigungssystem.
 */

export const SEITEN_BERECHTIGUNGEN = [
  { id: "seite.dashboard", pfad: "/", label: "Dashboard", gruppe: "Übersicht" },
  { id: "seite.verwaltung.gesellschaften", pfad: "/verwaltung/gesellschaften", label: "Gesellschaften", gruppe: "Verwaltung" },
  { id: "seite.verwaltung.objekte", pfad: "/verwaltung/objekte", label: "Objekte", gruppe: "Verwaltung" },
  { id: "seite.verwaltung.einheiten", pfad: "/verwaltung/einheiten", label: "Einheiten", gruppe: "Verwaltung" },
  { id: "seite.verwaltung.mietverhaeltnisse", pfad: "/verwaltung/mietverhaeltnisse", label: "Mietverhältnisse", gruppe: "Verwaltung" },
  { id: "seite.verwaltung.sollstellung", pfad: "/verwaltung/sollstellung", label: "Sollstellung", gruppe: "Buchhaltung" },
  { id: "seite.verwaltung.zahlungen", pfad: "/verwaltung/zahlungen", label: "Zahlungen & Rückstände", gruppe: "Buchhaltung" },
  { id: "seite.verwaltung.nebenkosten", pfad: "/verwaltung/nebenkosten", label: "Nebenkostenabrechnung", gruppe: "Buchhaltung" },
  { id: "seite.dokumente.ablage", pfad: "/dokumente/ablage", label: "Dokumentenablage", gruppe: "Dokumente" },
  { id: "seite.dokumente.pruefordner", pfad: "/dokumente/pruefordner", label: "Postfach", gruppe: "Dokumente" },
  { id: "seite.dokumente.pruefung", pfad: "/dokumente/pruefung", label: "Dokument prüfen", gruppe: "Dokumente" },
  { id: "seite.transaktionen.liste", pfad: "/transaktionen/liste", label: "Offene Exposés", gruppe: "Transaktionen" },
  { id: "seite.transaktionen.expose_import", pfad: "/transaktionen/expose-import", label: "Exposé-Import", gruppe: "Transaktionen" },
  { id: "seite.einstellungen.benutzer", pfad: "/einstellungen/benutzer", label: "Benutzer", gruppe: "Einstellungen" },
  { id: "seite.einstellungen.rollen", pfad: "/einstellungen/rollen", label: "Rollen & Rechte", gruppe: "Einstellungen" },
  { id: "seite.einstellungen.integrationen", pfad: "/einstellungen/integrationen", label: "Integrationen", gruppe: "Einstellungen" },
  { id: "seite.einstellungen.audit", pfad: "/einstellungen/audit", label: "Audit-Trail", gruppe: "Einstellungen" },
] as const;

export const AKTIONS_BERECHTIGUNGEN = [
  { id: "aktion.dashboard.zeitraum.aendern", label: "Zeitraum wählen", seite: "seite.dashboard", gruppe: "Übersicht" },
  { id: "aktion.verwaltung.gesellschaften.anlegen", label: "Neue Gesellschaft", seite: "seite.verwaltung.gesellschaften", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.gesellschaften.bearbeiten", label: "Gesellschaft bearbeiten", seite: "seite.verwaltung.gesellschaften", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.gesellschaften.loeschen", label: "Gesellschaft löschen", seite: "seite.verwaltung.gesellschaften", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.objekte.anlegen", label: "Neues Objekt", seite: "seite.verwaltung.objekte", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.objekte.lesen", label: "Objektdetails anzeigen", seite: "seite.verwaltung.objekte", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.objekte.bearbeiten", label: "Objekt bearbeiten", seite: "seite.verwaltung.objekte", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.objekte.loeschen", label: "Objekt löschen", seite: "seite.verwaltung.objekte", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.einheiten.anlegen", label: "Neue Einheit", seite: "seite.verwaltung.einheiten", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.einheiten.bearbeiten", label: "Einheit bearbeiten", seite: "seite.verwaltung.einheiten", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.einheiten.loeschen", label: "Einheit löschen", seite: "seite.verwaltung.einheiten", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.mietverhaeltnisse.anlegen", label: "Neues Mietverhältnis", seite: "seite.verwaltung.mietverhaeltnisse", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.mietverhaeltnisse.bearbeiten", label: "Mietverhältnis bearbeiten", seite: "seite.verwaltung.mietverhaeltnisse", gruppe: "Verwaltung" },
  { id: "aktion.verwaltung.mietverhaeltnisse.loeschen", label: "Mietverhältnis löschen", seite: "seite.verwaltung.mietverhaeltnisse", gruppe: "Verwaltung" },
  { id: "aktion.buchhaltung.sollstellung.erzeugen", label: "Sollstellung erzeugen", seite: "seite.verwaltung.sollstellung", gruppe: "Buchhaltung" },
  { id: "aktion.buchhaltung.zahlungen.bankimport", label: "Bankauszug (PDF)", seite: "seite.verwaltung.zahlungen", gruppe: "Buchhaltung" },
  { id: "aktion.buchhaltung.nebenkosten.abrechnung_erstellen", label: "Abrechnung erstellen", seite: "seite.verwaltung.nebenkosten", gruppe: "Buchhaltung" },
  { id: "aktion.buchhaltung.nebenkosten.kostenposition_anlegen", label: "Kostenposition anlegen", seite: "seite.verwaltung.nebenkosten", gruppe: "Buchhaltung" },
  { id: "aktion.buchhaltung.nebenkosten.pdf_exportieren", label: "PDF ins DMS + Outlook-Entwurf", seite: "seite.verwaltung.nebenkosten", gruppe: "Buchhaltung" },
  { id: "aktion.dokumente.pruefordner.bestaetigen", label: "Bestätigen", seite: "seite.dokumente.pruefordner", gruppe: "Dokumente" },
  { id: "aktion.dokumente.pruefordner.neu_zuordnen", label: "Neu zuordnen", seite: "seite.dokumente.pruefordner", gruppe: "Dokumente" },
  { id: "aktion.dokumente.pruefordner.ablehnen", label: "Ablehnen", seite: "seite.dokumente.pruefordner", gruppe: "Dokumente" },
  { id: "aktion.dokumente.pruefordner.ablegen", label: "Auf OneDrive ablegen", seite: "seite.dokumente.pruefordner", gruppe: "Dokumente" },
  { id: "aktion.dokumente.pruefordner.pruefen", label: "Dokument prüfen (Check)", seite: "seite.dokumente.pruefordner", gruppe: "Dokumente" },
  { id: "aktion.dokumente.pruefordner.analyse_wiederholen", label: "KI-Analyse wiederholen", seite: "seite.dokumente.pruefordner", gruppe: "Dokumente" },
  { id: "aktion.dokumente.pruefordner.buchen", label: "Rechnung buchen", seite: "seite.dokumente.pruefung", gruppe: "Dokumente" },
  { id: "aktion.dokumente.pruefordner.exposes_verschieben", label: "Zu Exposés verschieben", seite: "seite.dokumente.pruefordner", gruppe: "Dokumente" },
  { id: "aktion.dokumente.outlook.verbinden", label: "Outlook verbinden", seite: "seite.dokumente.ablage", gruppe: "Dokumente" },
  { id: "aktion.dokumente.kategorien.verwalten", label: "Kategorien verwalten", seite: "seite.dokumente.ablage", gruppe: "Dokumente" },
  { id: "aktion.dokumente.posteingang.analysieren", label: "KI-Analyse starten", seite: "seite.dokumente.ablage", gruppe: "Dokumente" },
  { id: "aktion.dokumente.ablage.bearbeiten", label: "Abgelegtes Dokument bearbeiten", seite: "seite.dokumente.ablage", gruppe: "Dokumente" },
  { id: "aktion.transaktionen.liste.pruefen", label: "Exposé prüfen (Check)", seite: "seite.transaktionen.liste", gruppe: "Transaktionen" },
  { id: "aktion.transaktionen.liste.exportieren", label: "Exposé direkt exportieren", seite: "seite.transaktionen.liste", gruppe: "Transaktionen" },
  { id: "aktion.transaktionen.liste.analyse_wiederholen", label: "KI-Analyse wiederholen", seite: "seite.transaktionen.liste", gruppe: "Transaktionen" },
  { id: "aktion.transaktionen.expose_import.hochladen", label: "Exposé-PDF hochladen", seite: "seite.transaktionen.expose_import", gruppe: "Transaktionen" },
  { id: "aktion.transaktionen.expose_import.uebernehmen", label: "In Salesforce übernehmen", seite: "seite.transaktionen.expose_import", gruppe: "Transaktionen" },
  { id: "aktion.transaktionen.expose_import.salesforce_session", label: "Mit Salesforce verbinden", seite: "seite.transaktionen.expose_import", gruppe: "Transaktionen" },
  { id: "aktion.transaktionen.expose_import.korrigieren", label: "Korrigieren", seite: "seite.transaktionen.expose_import", gruppe: "Transaktionen" },
  { id: "aktion.transaktionen.expose_import.verwerfen", label: "Verwerfen", seite: "seite.transaktionen.expose_import", gruppe: "Transaktionen" },
  { id: "aktion.einstellungen.benutzer.einladen", label: "Benutzer einladen", seite: "seite.einstellungen.benutzer", gruppe: "Einstellungen" },
  { id: "aktion.einstellungen.benutzer.bearbeiten", label: "Benutzer bearbeiten", seite: "seite.einstellungen.benutzer", gruppe: "Einstellungen" },
  { id: "aktion.einstellungen.benutzer.loeschen", label: "Benutzer löschen", seite: "seite.einstellungen.benutzer", gruppe: "Einstellungen" },
  { id: "aktion.einstellungen.integrationen.verbinden", label: "Integration verbinden", seite: "seite.einstellungen.integrationen", gruppe: "Einstellungen" },
  { id: "aktion.einstellungen.integrationen.reauth", label: "Integration Re-Auth", seite: "seite.einstellungen.integrationen", gruppe: "Einstellungen" },
  { id: "aktion.einstellungen.rollen.bearbeiten", label: "Rollen-Rechte speichern", seite: "seite.einstellungen.rollen", gruppe: "Einstellungen" },
  { id: "aktion.einstellungen.rollen.anlegen", label: "Neue Rolle anlegen", seite: "seite.einstellungen.rollen", gruppe: "Einstellungen" },
] as const;

export type SeitenBerechtigungId = (typeof SEITEN_BERECHTIGUNGEN)[number]["id"];
export type AktionsBerechtigungId = (typeof AKTIONS_BERECHTIGUNGEN)[number]["id"];
export type BerechtigungId = SeitenBerechtigungId | AktionsBerechtigungId;

export type SeitenBerechtigung = (typeof SEITEN_BERECHTIGUNGEN)[number];
export type AktionsBerechtigung = (typeof AKTIONS_BERECHTIGUNGEN)[number];

/** Eingebaute System-Rollen in der Matrix (op_admin ist systemseitig). */
export const SYSTEM_KONFIGURIERBARE_ROLLEN = [
  "administrator",
  "manager",
  "mitarbeiter",
  "leser",
] as const;

/** @deprecated Alias — nutze SYSTEM_KONFIGURIERBARE_ROLLEN für Code-Defaults. */
export const KONFIGURIERBARE_ROLLEN = SYSTEM_KONFIGURIERBARE_ROLLEN;

export type SystemKonfigurierbareRolle = (typeof SYSTEM_KONFIGURIERBARE_ROLLEN)[number];

/** Konfigurierbare Rolle (System oder benutzerdefiniert). */
export type KonfigurierbareRolle = string;

export type RolleBerechtigungenMap = Record<string, Record<BerechtigungId, boolean>>;

const pfadZuSeite = new Map<string, SeitenBerechtigungId>(
  SEITEN_BERECHTIGUNGEN.map((s) => [s.pfad, s.id]),
);

/** Liefert die Seiten-Berechtigung für einen Router-Pfad (exakt oder Präfix). */
export function seitenBerechtigungFuerPfad(pfad: string): SeitenBerechtigungId | null {
  const exakt = pfadZuSeite.get(pfad);
  if (exakt) return exakt;

  for (const seite of SEITEN_BERECHTIGUNGEN) {
    if (seite.pfad !== "/" && pfad.startsWith(seite.pfad + "/")) {
      return seite.id;
    }
  }

  return null;
}

export function istSeitenBerechtigung(id: BerechtigungId): id is SeitenBerechtigungId {
  return id.startsWith("seite.");
}

export function istAktionsBerechtigung(id: BerechtigungId): id is AktionsBerechtigungId {
  return id.startsWith("aktion.");
}

export function alleBerechtigungsIds(): BerechtigungId[] {
  return [
    ...SEITEN_BERECHTIGUNGEN.map((s) => s.id),
    ...AKTIONS_BERECHTIGUNGEN.map((a) => a.id),
  ];
}
