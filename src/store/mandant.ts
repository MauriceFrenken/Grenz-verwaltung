import { create } from "zustand";
import type { Mandant, MandantId } from "@/types";

interface MandantState {
  mandanten: Mandant[];
  aktiveMandantId: MandantId | null;
  setMandanten: (g: Mandant[]) => void;
  waehleMandant: (id: MandantId | null) => void;
}

export const useMandantStore = create<MandantState>((set) => ({
  mandanten: [],
  aktiveMandantId: null,
  setMandanten: (mandanten) =>
    set((prev) => ({
      mandanten,
      aktiveMandantId:
        prev.aktiveMandantId && mandanten.some((g) => g.id === prev.aktiveMandantId)
          ? prev.aktiveMandantId
          : (mandanten[0]?.id ?? null),
    })),
  waehleMandant: (id) => set({ aktiveMandantId: id }),
}));