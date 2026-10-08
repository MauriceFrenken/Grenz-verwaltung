import { Search } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Taste } from "@/components/board/Knopf";
import { useAuth } from "@/hooks/useAuth";
import { boardRepository } from "@/lib/db/config";
import { cn } from "@/lib/utils";
import { Befehlspalette } from "./Befehlspalette";
import { useBoardDaten } from "./daten";
import { GesellschaftsAuswahl } from "./GesellschaftsAuswahl";
import { useBoardUi, uiAusSpeicherLaden, uiSpeichern } from "./store";

/** ⌘K / Strg+K öffnet die Befehlspalette. */
function useTastenkuerzel() {
  const setPaletteOffen = useBoardUi((s) => s.setPaletteOffen);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      setPaletteOffen(!useBoardUi.getState().paletteOffen);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setPaletteOffen]);
}

/**
 * Rahmen der Steuerungsseiten innerhalb von Bens AppShell (Kopfzeile und
 * Seitenleiste kommen von dort): Gesellschaftsfilter, Suche, Inhalt.
 */
export function BoardRahmen({ children }: { children: ReactNode }) {
  const { data } = useBoardDaten();
  const setPaletteOffen = useBoardUi((s) => s.setPaletteOffen);
  // Bens Kopfzeile (h-16) fehlt nur ohne Anmeldung im Demo-Modus
  const { benutzer } = useAuth();
  useTastenkuerzel();

  useEffect(() => {
    uiAusSpeicherLaden();
    return uiSpeichern();
  }, []);

  return (
    <>
      <div
        className={cn(
          "sticky z-30 flex h-12 items-center gap-3 border-b border-hairline bg-background/90 px-4 backdrop-blur-md md:px-8",
          benutzer ? "top-16" : "top-0",
        )}
      >
        <GesellschaftsAuswahl companies={data?.companies ?? []} />
        <button
          onClick={() => setPaletteOffen(true)}
          className="ml-auto flex h-8 w-full min-w-0 max-w-[320px] cursor-pointer items-center gap-2 border border-hairline bg-surface px-2.5 text-sm text-text-subtle transition-colors hover:bg-surface-muted md:ml-4 md:mr-auto"
        >
          <Search className="size-3.5" />
          <span className="truncate">Suchen oder springen…</span>
          <Taste className="ml-auto">⌘K</Taste>
        </button>
        {boardRepository().quelle === "mock" ? (
          <span
            className="hidden h-6 items-center border border-warn/30 bg-warn-soft px-2.5 text-xs font-medium text-warn lg:inline-flex"
            title="Alle Zahlen sind fiktiv"
          >
            Demodaten
          </span>
        ) : null}
      </div>
      <div
        id="board-inhalt"
        className="mx-auto w-full min-w-0 max-w-[1320px] px-4 py-8 md:px-8"
      >
        {children}
      </div>
      <Befehlspalette daten={data} />
    </>
  );
}
