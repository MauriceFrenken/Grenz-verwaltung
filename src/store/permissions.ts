import { create } from "zustand";
import {
  defaultMatrix,
  matrixMitRollen,
  rangMapAusRollen,
  SYSTEM_KONFIGURIERBARE_ROLLEN,
  type RollenDefinition,
  type RolleBerechtigungenMap,
} from "@/lib/permissions";

interface PermissionsState {
  matrix: RolleBerechtigungenMap;
  rollen: RollenDefinition[];
  isLoading: boolean;
  setMatrix: (matrix: RolleBerechtigungenMap) => void;
  setRollen: (rollen: RollenDefinition[]) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
  konfigurierbareRollenIds: () => string[];
  rangMap: () => Record<string, number>;
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  matrix: defaultMatrix(),
  rollen: [],
  isLoading: true,
  setMatrix: (matrix) => set({ matrix }),
  setRollen: (rollen) =>
    set((state) => ({
      rollen,
      matrix: matrixMitRollen(
        state.matrix,
        rollen.map((r) => r.id),
      ),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ matrix: defaultMatrix(), rollen: [], isLoading: false }),
  konfigurierbareRollenIds: () => {
    const ids = get().rollen.map((r) => r.id);
    return ids.length > 0 ? ids : [...SYSTEM_KONFIGURIERBARE_ROLLEN];
  },
  rangMap: () => rangMapAusRollen(get().rollen),
}));
