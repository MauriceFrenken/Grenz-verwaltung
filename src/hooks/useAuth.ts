import { useAuthStore } from "@/store/auth";
import { supabase } from "@/lib/supabase";
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

export type { RolleName };
