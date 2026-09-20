import { useAuthStore } from "@/store/auth";
import { sessionServerseitigPruefen } from "@/lib/session-pruefen";
import { supabase } from "@/lib/supabase";
import type { RolleName } from "@/types";

export function useAuth() {
  const benutzer = useAuthStore((s) => s.benutzer);
  const session = useAuthStore((s) => s.session);
  const status = useAuthStore((s) => s.status);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hatRolle = useAuthStore((s) => s.hatRolle);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const setAnonymous = useAuthStore((s) => s.setAnonymous);

  return {
    benutzer,
    session,
    status,
    isLoading,
    istAngemeldet: status === "authenticated" && benutzer !== null && session !== null,
    hatRolle,
    anmelden: async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const ergebnis = await sessionServerseitigPruefen(data.session);
      if (!ergebnis.ok) {
        setAnonymous();
        throw new Error("Sitzung konnte nicht bestätigt werden.");
      }
      setAuthenticated(ergebnis.session, ergebnis.benutzer);
    },
    passwortVergessen: async (email: string) => {
      const redirectTo = `${window.location.origin}/passwort-zuruecksetzen`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },
    abmelden: async () => {
      const { error } = await supabase.auth.signOut();
      setAnonymous();
      if (error) throw error;
    },
  };
}

export type { RolleName };
