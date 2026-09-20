import { useEffect, type ReactNode } from "react";
import { benutzerAusUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      setSession(session, session?.user ? benutzerAusUser(session.user) : null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session, session?.user ? benutzerAusUser(session.user) : null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setSession, setLoading]);

  return children;
}
