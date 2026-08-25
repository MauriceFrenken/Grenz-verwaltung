import { create } from "zustand";
import type { Gesellschaft, GesellschaftId } from "@/types";

interface GesellschaftState {
  gesellschaften: Gesellschaft[];
  aktiveGesellschaftId: GesellschaftId | null;
  setGesellschaften: (g: Gesellschaft[]) => void;
  waehleGesellschaft: (id: GesellschaftId | null) => void;
}

export const useGesellschaftStore = create<GesellschaftState>((set) => ({
  gesellschaften: [],
  aktiveGesellschaftId: null,
  setGesellschaften: (gesellschaften) =>
    set((prev) => ({
      gesellschaften,
      aktiveGesellschaftId:
        prev.aktiveGesellschaftId && gesellschaften.some((g) => g.id === prev.aktiveGesellschaftId)
          ? prev.aktiveGesellschaftId
          : (gesellschaften[0]?.id ?? null),
    })),
  waehleGesellschaft: (id) => set({ aktiveGesellschaftId: id }),
}));