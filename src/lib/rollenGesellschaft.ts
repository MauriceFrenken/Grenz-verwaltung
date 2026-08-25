import type { GesellschaftZuweisung, RollenDefinition } from "@/types";

export const GESELLSCHAFT_ZUWEISUNG_OPTIONEN: Array<{
  wert: GesellschaftZuweisung;
  label: string;
  beschreibung: string;
}> = [
  {
    wert: "alle",
    label: "Alle Gesellschaften",
    beschreibung: "Benutzer dieser Rolle können Zugriff auf alle Gesellschaften erhalten.",
  },
  {
    wert: "mehrere",
    label: "Mehrere Gesellschaften",
    beschreibung: "Nur ausgewählte Gesellschaften — aber mehrere gleichzeitig möglich.",
  },
  {
    wert: "einzeln",
    label: "Nur eine Gesellschaft",
    beschreibung: "Benutzer werden immer genau einer Gesellschaft zugeordnet.",
  },
];

export function gesellschaftZuweisungFuerRolle(
  rolleId: string,
  rollen: RollenDefinition[],
): GesellschaftZuweisung {
  return rollen.find((r) => r.id === rolleId)?.gesellschaftZuweisung ?? "alle";
}

export function gesellschaftZuweisungLabel(zuweisung: GesellschaftZuweisung): string {
  return GESELLSCHAFT_ZUWEISUNG_OPTIONEN.find((o) => o.wert === zuweisung)?.label ?? zuweisung;
}
