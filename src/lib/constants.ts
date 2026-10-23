import type { RolleName, RollenDefinition } from "@/types";

export const APP_NAME = "Grenz & Co. Verwaltung";

export const ROLLEN: Record<RolleName, { bezeichnung: string; beschreibung: string }> = {
  op_admin: {
    bezeichnung: "OP-Admin",
    beschreibung: "Betriebs-Administrator: legt Benutzer an und verwaltet die Plattform.",
  },
  administrator: {
    bezeichnung: "Administrator",
    beschreibung: "Vollzugriff auf alle Gesellschaften und Konfiguration.",
  },
  manager: {
    bezeichnung: "Manager",
    beschreibung: "Führungsverantwortung mit Zugriff auf Verwaltung und operative Module.",
  },
  mitarbeiter: {
    bezeichnung: "Mitarbeiter",
    beschreibung: "Operativer Zugriff auf zugewiesene Aufgaben und Gesellschaften.",
  },
  leser: {
    bezeichnung: "Leser",
    beschreibung: "Nur-Lesen-Zugriff auf zugewiesene Gesellschaften.",
  },
};

export function rollenBezeichnung(id: string, rollen: RollenDefinition[]): string {
  const ausDb = rollen.find((r) => r.id === id);
  if (ausDb) return ausDb.bezeichnung;
  return ROLLEN[id as RolleName]?.bezeichnung ?? id;
}

export function rollenBeschreibung(id: string, rollen: RollenDefinition[]): string {
  const ausDb = rollen.find((r) => r.id === id);
  if (ausDb) return ausDb.beschreibung;
  return ROLLEN[id as RolleName]?.beschreibung ?? "";
}

/** Rollen, die beim Einladen neuer Benutzer wählbar sind. */
export const EINLADUNGS_ROLLEN = [
  "administrator",
  "manager",
  "mitarbeiter",
  "leser",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  neu: "Neu",
  in_analyse: "Analyse…",
  analysiert: "Analysiert",
  abgelegt: "Abgelegt",
  gebucht: "Gebucht",
  in_pruefung: "In Prüfung",
  freigegeben: "Freigegeben",
  abgelehnt: "Abgelehnt",
  archiviert: "Archiviert",
  nicht_initialisiert: "Nicht initialisiert",
  wartet_auf_bank: "Wartet auf Bank",
  bereit: "Bereit",
  verbunden: "Verbunden",
  getrennt: "Getrennt",
  fehler: "Fehler",
};
