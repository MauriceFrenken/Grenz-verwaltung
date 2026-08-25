import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Benutzer, GesellschaftId, RolleName } from "@/types";

interface AuthState {
  benutzer: Benutzer | null;
  session: Session | null;
  isLoading: boolean;
  setSession: (session: Session | null, benutzer: Benutzer | null) => void;
  setLoading: (isLoading: boolean) => void;
  hatRolle: (rolle: RolleName, gesellschaftId?: GesellschaftId) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  benutzer: null,
  session: null,
  isLoading: true,
  setSession: (session, benutzer) => set({ session, benutzer }),
  setLoading: (isLoading) => set({ isLoading }),
  hatRolle: (rolle, gesellschaftId) => {
    const b = get().benutzer;
    if (!b) return false;
    return b.rollen.some(
      (r) => r.rolle === rolle && (r.gesellschaftId === "*" || r.gesellschaftId === gesellschaftId),
    );
  },
}));
