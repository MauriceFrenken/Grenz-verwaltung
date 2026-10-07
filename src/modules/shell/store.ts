import { create } from "zustand";

export type Thema = "hell" | "dunkel" | "system";

interface BoardUiState {
  /** "alle" oder Gesellschafts-ID */
  gesellschaft: string;
  seitenleisteZu: boolean;
  thema: Thema;
  paletteOffen: boolean;
  setGesellschaft: (id: string) => void;
  toggleSeitenleiste: () => void;
  setThema: (t: Thema) => void;
  setPaletteOffen: (o: boolean) => void;
}

export const useBoardUi = create<BoardUiState>((set) => ({
  gesellschaft: "alle",
  seitenleisteZu: false,
  thema: "system",
  paletteOffen: false,
  setGesellschaft: (gesellschaft) => set({ gesellschaft }),
  toggleSeitenleiste: () => set((s) => ({ seitenleisteZu: !s.seitenleisteZu })),
  setThema: (thema) => set({ thema }),
  setPaletteOffen: (paletteOffen) => set({ paletteOffen }),
}));

const SPEICHER_SCHLUESSEL = "frenken-board-ui";

/** Persistiert Thema, Seitenleiste und Gesellschaftsfilter im Browser (nach dem Mount). */
export function uiAusSpeicherLaden() {
  try {
    const roh = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return;
    const w = JSON.parse(roh) as Partial<
      Pick<BoardUiState, "gesellschaft" | "seitenleisteZu" | "thema">
    >;
    useBoardUi.setState({
      gesellschaft:
        typeof w.gesellschaft === "string" ? w.gesellschaft : "alle",
      seitenleisteZu: Boolean(w.seitenleisteZu),
      thema: w.thema === "hell" || w.thema === "dunkel" ? w.thema : "system",
    });
  } catch {
    // Speicher nicht verfügbar: Standardwerte bleiben
  }
}

export function uiSpeichern() {
  return useBoardUi.subscribe((s) => {
    try {
      window.localStorage.setItem(
        SPEICHER_SCHLUESSEL,
        JSON.stringify({
          gesellschaft: s.gesellschaft,
          seitenleisteZu: s.seitenleisteZu,
          thema: s.thema,
        }),
      );
    } catch {
      // ignorieren
    }
  });
}
