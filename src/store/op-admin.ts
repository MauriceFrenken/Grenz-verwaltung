import { create } from "zustand";

const STORAGE_KEY = "op-admin-zensur";

function ausLocalStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function inLocalStorage(aktiv: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, aktiv ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

interface OpAdminState {
  zensurAktiv: boolean;
  hydriert: boolean;
  hydrate: () => void;
  setZensurAktiv: (aktiv: boolean) => void;
}

export const useOpAdminStore = create<OpAdminState>((set) => ({
  zensurAktiv: false,
  hydriert: false,
  hydrate: () => {
    set({ zensurAktiv: ausLocalStorage(), hydriert: true });
  },
  setZensurAktiv: (zensurAktiv) => {
    inLocalStorage(zensurAktiv);
    set({ zensurAktiv });
  },
}));
