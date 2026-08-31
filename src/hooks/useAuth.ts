import { useAuthStore } from "@/store/auth";
import { usePermissionsStore } from "@/store/permissions";
import { supabase } from "@/lib/supabase";
import {
  bearbeitbareRollen,
  darfBenutzerVerwalten,
  darfRollenSeite,
  darfRolleBearbeiten,
  hatBerechtigung,
  hatOpAdminVollzugriff,
  platzierbareBezugsRollen,
  primaereRolle,
  vergebareBerechtigungen,
  zuweisbareRollen,
  type AktionsBerechtigungId,
  type KonfigurierbareRolle,
  type SeitenBerechtigungId,
} from "@/lib/permissions";
import type { RolleName } from "@/types";

export function useAuth() {
  const benutzer = useAuthStore((s) => s.benutzer);
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hatRolle = useAuthStore((s) => s.hatRolle);

  return {
    benutzer,
    session,
    isLoading,
    istAngemeldet: benutzer !== null && session !== null,
    hatRolle,
    anmelden: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    passwortVergessen: async (email: string) => {
      const redirectTo = `${window.location.origin}/passwort-zuruecksetzen`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },
    abmelden: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };
}

export function usePermissions() {
  const { benutzer, session } = useAuth();
  const matrix = usePermissionsStore((s) => s.matrix);
  const rollen = usePermissionsStore((s) => s.rollen);
  const permissionsLoading = usePermissionsStore((s) => s.isLoading);
  const konfigurierbareRollenIds = usePermissionsStore((s) => s.konfigurierbareRollenIds);
  const rangMap = usePermissionsStore((s) => s.rangMap);

  const eigeneRolle = (() => {
    const ausMeta = session?.user?.app_metadata?.rolle;
    if (typeof ausMeta === "string" && ausMeta.length > 0) return ausMeta;
    if (benutzer) return primaereRolle(benutzer.rollen, rangMap());
    return null;
  })();
  const alleRollenIds = konfigurierbareRollenIds();

  const hatOpAdmin =
    hatOpAdminVollzugriff(eigeneRolle) ||
    (benutzer?.rollen.some((r) => r.rolle === "op_admin") ?? false);

  const pruefe = (berechtigungId: SeitenBerechtigungId | AktionsBerechtigungId): boolean => {
    if (hatOpAdmin) return true;
    return hatBerechtigung(eigeneRolle, berechtigungId, matrix);
  };

  return {
    matrix,
    rollen,
    permissionsLoading,
    eigeneRolle,
    istOpAdmin: (): boolean => hatOpAdmin,
    darfSeite: (seitenId: SeitenBerechtigungId): boolean => pruefe(seitenId),
    darfAktion: (aktionsId: AktionsBerechtigungId): boolean => pruefe(aktionsId),
    darfRollenSeite: (): boolean => darfRollenSeite(eigeneRolle),
    darfRolleBearbeiten: (rolle: KonfigurierbareRolle): boolean =>
      darfRolleBearbeiten(eigeneRolle, rolle, rangMap()),
    bearbeitbareRollen: (): KonfigurierbareRolle[] =>
      bearbeitbareRollen(eigeneRolle, alleRollenIds, rangMap()),
    zuweisbareRollen: (): KonfigurierbareRolle[] =>
      zuweisbareRollen(eigeneRolle, alleRollenIds, rangMap()),
    darfBenutzerVerwalten: (zielRolle: string): boolean =>
      darfBenutzerVerwalten(eigeneRolle, zielRolle, rangMap()),
    platzierbareBezugsRollen: () => platzierbareBezugsRollen(eigeneRolle, rollen, rangMap()),
    vergebareBerechtigungen: (): Set<SeitenBerechtigungId | AktionsBerechtigungId> =>
      vergebareBerechtigungen(eigeneRolle, matrix),
    /** @deprecated Nutze darfAktion() mit Registry-ID */
    darfBearbeiten: (): boolean =>
      pruefe("aktion.verwaltung.objekte.anlegen") || pruefe("aktion.verwaltung.mietverhaeltnisse.anlegen"),
    /** @deprecated Nutze darfAktion() mit Registry-ID */
    darfBuchen: (): boolean => pruefe("aktion.buchhaltung.sollstellung.erzeugen"),
    /** @deprecated Nutze darfAktion() mit Registry-ID */
    darfAnkauf: (): boolean => pruefe("aktion.transaktionen.expose_import.uebernehmen"),
    /** @deprecated Nutze darfSeite() / darfAktion() */
    istAdmin: (): boolean =>
      eigeneRolle === "op_admin" || eigeneRolle === "administrator" || eigeneRolle === "manager",
    /** @deprecated Nutze darfSeite() */
    kannModul: (
      modul: "verwaltung" | "dokumente" | "transaktionen" | "einstellungen",
    ): boolean => {
      const seitenMap: Record<string, SeitenBerechtigungId[]> = {
        verwaltung: [
          "seite.verwaltung.gesellschaften",
          "seite.verwaltung.objekte",
          "seite.verwaltung.einheiten",
          "seite.verwaltung.mietverhaeltnisse",
          "seite.verwaltung.sollstellung",
          "seite.verwaltung.zahlungen",
          "seite.verwaltung.nebenkosten",
        ],
        dokumente: [
          "seite.dokumente.ablage",
          "seite.dokumente.pruefordner",
          "seite.dokumente.pruefung",
        ],
        transaktionen: ["seite.transaktionen.liste", "seite.transaktionen.expose_import"],
        einstellungen: [
          "seite.einstellungen.benutzer",
          "seite.einstellungen.rollen",
          "seite.einstellungen.integrationen",
          "seite.einstellungen.audit",
        ],
      };
      return (seitenMap[modul] ?? []).some((id) => pruefe(id));
    },
  };
}

export type { RolleName };
