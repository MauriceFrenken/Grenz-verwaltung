import type { User } from "@supabase/supabase-js";
import type { Benutzer, GesellschaftId, GesellschaftZugriff, RolleName } from "@/types";

export function gesellschaftZugriffAusWert(wert: unknown): GesellschaftZugriff {
  if (wert === "*" || wert === undefined || wert === null) return "*";
  if (!Array.isArray(wert)) return "*";
  const ids = wert.filter((id): id is GesellschaftId => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : "*";
}

export function gesellschaftIdsAusBenutzer(benutzer: Benutzer): GesellschaftZugriff {
  const ids = benutzer.rollen.map((r) => r.gesellschaftId);
  if (ids.some((id) => id === "*")) return "*";
  return [...new Set(ids.filter((id): id is GesellschaftId => id !== "*"))];
}

export function rollenMitGesellschaftZugriff(rolle: RolleName, gesellschaftZugriff: GesellschaftZugriff) {
  if (gesellschaftZugriff === "*") {
    return [{ rolle, gesellschaftId: "*" as const }];
  }
  return gesellschaftZugriff.map((gesellschaftId) => ({ rolle, gesellschaftId }));
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
  const gesellschaftZugriff = gesellschaftZugriffAusWert(appMeta.gesellschaften);

  return {
    id: user.id,
    name,
    email: user.email ?? "",
    initialen,
    stellenbezeichnung,
    rollen: rollenMitGesellschaftZugriff(rolle, gesellschaftZugriff),
  };
}
