import type { MandantZuweisung, RollenDefinition } from "@/types";

export const MANDANT_ZUWEISUNG_OPTIONEN: Array<{
  wert: MandantZuweisung;
  label: string;
  beschreibung: string;
}> = [
  {
    wert: "alle",
    label: "Alle Mandanten",
    beschreibung: "Benutzer dieser Rolle können Zugriff auf alle Mandanten erhalten.",
  },
  {
    wert: "mehrere",
    label: "Mehrere Mandanten",
    beschreibung: "Nur ausgewählte Mandanten — aber mehrere gleichzeitig möglich.",
  },
  {
    wert: "einzeln",
    label: "Nur ein Mandant",
    beschreibung: "Benutzer werden immer genau einem Mandanten zugeordnet.",
  },
];

export function mandantZuweisungFuerRolle(
  rolleId: string,
  rollen: RollenDefinition[],
): MandantZuweisung {
  return rollen.find((r) => r.id === rolleId)?.mandantZuweisung ?? "alle";
}

export function mandantZuweisungLabel(zuweisung: MandantZuweisung): string {
  return MANDANT_ZUWEISUNG_OPTIONEN.find((o) => o.wert === zuweisung)?.label ?? zuweisung;
}
