import type { RolleName, RollenDefinition } from "@/types";

export const APP_NAME = "FRENKEN Verwaltung";

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

export const DOKUMENTTYP_LABEL: Record<string, string> = {
  rechnung: "Rechnung",
  vertrag: "Vertrag",
  kontoauszug: "Kontoauszug",
  expose: "Exposé",
  nk_abrechnung: "NK-Abrechnung",
  korrespondenz: "Korrespondenz",
  sonstiges: "Sonstiges",
};

export const STATUS_LABEL: Record<string, string> = {
  aktiv: "Aktiv",
  inaktiv: "Inaktiv",
  in_ankauf: "In Ankauf",
  verkauft: "Verkauft",
  vermietet: "Vermietet",
  leerstand: "Leerstand",
  wartung: "Wartung",
  reserviert: "Reserviert",
  gekuendigt: "Gekündigt",
  beendet: "Beendet",
  geplant: "Geplant",
  offen: "Offen",
  gebucht: "Gebucht",
  storniert: "Storniert",
  fehlt: "Fehlt",
  teilweise: "Teilweise",
  ausgeglichen: "Ausgeglichen",
  ueberzahlung: "Überzahlung",
  ohne_iban: "Ohne IBAN",
  abgeschlossen: "Abgeschlossen",
  neu: "Neu",
  analysiert: "Analysiert",
  in_analyse: "Analyse…",
  abgelegt: "Abgelegt",
  nicht_initialisiert: "Nicht initialisiert",
  wartet_auf_bank: "Wartet auf Bank",
  bereit: "Bereit",
  in_pruefung: "In Prüfung",
  abgelehnt: "Abgelehnt",
  archiviert: "Archiviert",
  verbunden: "Verbunden",
  getrennt: "Getrennt",
  fehler: "Fehler",
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
  versendet: "Versendet",
};

export const VERTEILERSCHLUESSEL_LABEL = {
  flaeche: "Nach Fläche (m²)",
  einheiten: "Nach Einheiten",
  personen: "Nach Personen",
  verbrauch: "Nach Verbrauch",
  individuell: "Individuell",
} as const;
