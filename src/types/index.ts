// Zentrales Domain-Modell für Grenz & Co. Verwaltung.

export type GesellschaftId = string;
export type BenutzerId = string;

export interface Gesellschaft {
  id: GesellschaftId;
  name: string;
  kuerzel: string;
}

export type RolleName =
  | "op_admin"
  | "administrator"
  | "leser"
  | "manager"
  | "mitarbeiter"
  | (string & {});

export type GesellschaftZuweisung = "alle" | "mehrere" | "einzeln";

/** Rollen-Definition aus der Datenbank (System + benutzerdefiniert). */
export interface RollenDefinition {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  rang: number;
  istSystem: boolean;
  gesellschaftZuweisung: GesellschaftZuweisung;
}

/** Rollen, die beim Einladen neuer Benutzer wählbar sind (ohne OP-Admin). */
export type EinladungsRolle = string;

export interface Rolle {
  name: RolleName;
  bezeichnung: string;
  beschreibung: string;
  rang?: number;
  istSystem?: boolean;
}

export interface Benutzer {
  id: BenutzerId;
  name: string;
  email: string;
  initialen: string;
  stellenbezeichnung: string;
  rollen: Array<{ rolle: RolleName; gesellschaftId: GesellschaftId | "*" }>;
}

export type GesellschaftZugriff = GesellschaftId[] | "*";

export interface BenutzerEinladungInput {
  name: string;
  email: string;
  stellenbezeichnung: string;
  rolle: EinladungsRolle;
  gesellschaftZugriff: GesellschaftZugriff;
}

export interface BenutzerUpdateInput {
  id: string;
  name: string;
  stellenbezeichnung: string;
  rolle: EinladungsRolle;
  gesellschaftZugriff: GesellschaftZugriff;
}

export interface Paginated<T> {
  items: T[];
  gesamt: number;
}
