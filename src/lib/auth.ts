import type { User } from "@supabase/supabase-js";
import type { Benutzer, MandantId, MandantZugriff, RolleName } from "@/types";

export function mandantZugriffAusWert(wert: unknown): MandantZugriff {
  if (wert === "*" || wert === undefined || wert === null) return "*";
  if (!Array.isArray(wert)) return "*";
  const ids = wert.filter((id): id is MandantId => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : "*";
}

export function mandantIdsAusBenutzer(benutzer: Benutzer): MandantZugriff {
  const ids = benutzer.rollen.map((r) => r.mandantId);
  if (ids.some((id) => id === "*")) return "*";
  return [...new Set(ids.filter((id): id is MandantId => id !== "*"))];
}

export function rollenMitMandantZugriff(rolle: RolleName, mandantZugriff: MandantZugriff) {
  if (mandantZugriff === "*") {
    return [{ rolle, mandantId: "*" as const }];
  }
  return mandantZugriff.map((mandantId) => ({ rolle, mandantId }));
}

export function initialenAusName(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return "–";
  if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
  return `${teile[0][0] ?? ""}${teile[teile.length - 1][0] ?? ""}`.toUpperCase();
}

export function benutzerAusUser(user: User): Benutzer {
  const meta = user.user_metadata ?? {};
  const appMeta = user.app_metadata ?? {};
  const name =
    (typeof meta.name === "string" && meta.name) ||
    user.email?.split("@")[0] ||
    "Benutzer";
  const initialen =
    (typeof meta.initialen === "string" && meta.initialen) || initialenAusName(name);
  const stellenbezeichnung =
    typeof meta.stellenbezeichnung === "string" ? meta.stellenbezeichnung : "";
  const rolleRaw = appMeta.rolle;
  const rolle =
    typeof rolleRaw === "string" && rolleRaw.length > 0 ? (rolleRaw as RolleName) : "leser";
  const mandantZugriff = mandantZugriffAusWert(appMeta.mandanten);

  return {
    id: user.id,
    name,
    email: user.email ?? "",
    initialen,
    stellenbezeichnung,
    rollen: rollenMitMandantZugriff(rolle, mandantZugriff),
  };
}
