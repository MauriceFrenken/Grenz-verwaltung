import { useEffect, type ReactNode } from "react";
import { benutzerAusUser } from "@/lib/auth";
import { defaultMatrix, matrixMitRollen } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { einstellungenApi } from "@/api/einstellungen";
import { useAuthStore } from "@/store/auth";
import { usePermissionsStore } from "@/store/permissions";

async function berechtigungenLaden() {
  const { setMatrix, setRollen, setLoading } = usePermissionsStore.getState();
  setLoading(true);
  try {
    const rollen = await einstellungenApi.listRollen();
    setRollen(rollen);
    const matrix = await einstellungenApi.listRollenBerechtigungen(rollen.map((r) => r.id));
    setMatrix(matrixMitRollen(matrix, rollen.map((r) => r.id)));
  } catch {
    const rollen = await einstellungenApi.listRollen().catch(() => []);
    if (rollen.length > 0) {
      usePermissionsStore.getState().setRollen(rollen);
    }
    setMatrix(defaultMatrix(rollen.map((r) => r.id)));
  } finally {
    setLoading(false);
  }
}

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
      if (session) {
        void berechtigungenLaden();
      } else {
        usePermissionsStore.getState().reset();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session, session?.user ? benutzerAusUser(session.user) : null);
      setLoading(false);
      if (session) {
        void berechtigungenLaden();
      } else {
        usePermissionsStore.getState().reset();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setSession, setLoading]);

  return children;
}
