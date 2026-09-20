import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Benutzer, GesellschaftId, RolleName } from "@/types";

export type AuthStatus = "pending" | "authenticated" | "anonymous";

interface AuthState {
  benutzer: Benutzer | null;
  session: Session | null;
  /** pending = Session wird noch geprüft — nie AppShell zeigen */
  status: AuthStatus;
  /** @deprecated Nutze status === "pending" */
  isLoading: boolean;
  setAuthenticated: (session: Session, benutzer: Benutzer) => void;
  setAnonymous: () => void;
  setPending: () => void;
  setSession: (session: Session | null, benutzer: Benutzer | null) => void;
  setLoading: (isLoading: boolean) => void;
  hatRolle: (rolle: RolleName, gesellschaftId?: GesellschaftId) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  benutzer: null,
  session: null,
  status: "pending",
  isLoading: true,
  setAuthenticated: (session, benutzer) =>
    set({ session, benutzer, status: "authenticated", isLoading: false }),
  setAnonymous: () =>
    set({ session: null, benutzer: null, status: "anonymous", isLoading: false }),
  setPending: () => set({ status: "pending", isLoading: true }),
  setSession: (session, benutzer) =>
    set(
      session && benutzer
        ? { session, benutzer, status: "authenticated", isLoading: false }
        : { session: null, benutzer: null, status: "anonymous", isLoading: false },
    ),
  setLoading: (isLoading) =>
    set({
      isLoading,
      status: isLoading ? "pending" : get().session ? "authenticated" : "anonymous",
    }),
  hatRolle: (rolle, gesellschaftId) => {
    const b = get().benutzer;
    if (!b) return false;
    return b.rollen.some(
      (r) => r.rolle === rolle && (r.gesellschaftId === "*" || r.gesellschaftId === gesellschaftId),
    );
  },
}));
