import { useEffect, type ReactNode } from "react";
import { sessionServerseitigPruefen } from "@/lib/session-pruefen";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const setAnonymous = useAuthStore((s) => s.setAnonymous);

  useEffect(() => {
    let active = true;
    let lauf = 0;

    async function uebernehmeSession(
      sessionFromEvent: Parameters<typeof sessionServerseitigPruefen>[0],
    ) {
      const id = ++lauf;
      const ergebnis = await sessionServerseitigPruefen(sessionFromEvent);
      if (!active || id !== lauf) return;

      if (ergebnis.ok) {
        setAuthenticated(ergebnis.session, ergebnis.benutzer);
      } else {
        setAnonymous();
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        lauf += 1;
        setAnonymous();
        return;
      }
      // INITIAL_SESSION inkl. detectSessionInUrl (Einladung / Passwort-Reset)
      void uebernehmeSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setAuthenticated, setAnonymous]);

  return children;
}
