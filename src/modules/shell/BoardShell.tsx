import * as Menu from "@radix-ui/react-dropdown-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Moon,
  Palette,
  Search,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Knopf, Taste } from "@/components/board/Knopf";
import { useAuth } from "@/hooks/useAuth";
import { boardRepository } from "@/lib/db/config";
import { cn } from "@/lib/utils";
import { Befehlspalette } from "./Befehlspalette";
import { useBoardDaten } from "./daten";
import { GesellschaftsAuswahl } from "./GesellschaftsAuswahl";
import { NAVIGATION } from "./navigation";
import { useBoardUi, uiAusSpeicherLaden, uiSpeichern } from "./store";

function useSystemDunkel() {
  const [dunkel, setDunkel] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDunkel(mq.matches);
    const h = (e: MediaQueryListEvent) => setDunkel(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return dunkel;
}

/** Setzt das Board-Thema an <html>, solange das Board geöffnet ist. */
function useBoardThema() {
  const thema = useBoardUi((s) => s.thema);
  const systemDunkel = useSystemDunkel();
  const dunkel = thema === "dunkel" || (thema === "system" && systemDunkel);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("board-theme");
    html.classList.toggle("dark", dunkel);
    return () => {
      html.classList.remove("board-theme", "dark");
    };
  }, [dunkel]);
  return dunkel;
}

function useTastenkuerzel() {
  const setPaletteOffen = useBoardUi((s) => s.setPaletteOffen);
  const toggleSeitenleiste = useBoardUi((s) => s.toggleSeitenleiste);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setPaletteOffen(!useBoardUi.getState().paletteOffen);
      } else if (k === "\\") {
        e.preventDefault();
        toggleSeitenleiste();
      } else if (k === "j") {
        e.preventDefault();
        const { thema, setThema } = useBoardUi.getState();
        const istDunkel =
          thema === "dunkel" ||
          (thema === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        setThema(istDunkel ? "hell" : "dunkel");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setPaletteOffen, toggleSeitenleiste]);
}

export function BoardShell({ children }: { children: ReactNode }) {
  const { data } = useBoardDaten();
  const zu = useBoardUi((s) => s.seitenleisteZu);
  const toggle = useBoardUi((s) => s.toggleSeitenleiste);
  const setPaletteOffen = useBoardUi((s) => s.setPaletteOffen);
  const thema = useBoardUi((s) => s.thema);
  const setThema = useBoardUi((s) => s.setThema);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const dunkel = useBoardThema();
  useTastenkuerzel();

  useEffect(() => {
    uiAusSpeicherLaden();
    return uiSpeichern();
  }, []);

  const istAktiv = (to: string) =>
    to === "/board"
      ? pathname === "/board" || pathname === "/board/"
      : pathname.startsWith(to);

  return (
    <div className="board-theme flex min-h-screen bg-background text-foreground">
      <a
        href="#board-inhalt"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-surface focus:px-3 focus:py-2"
      >
        Zum Inhalt springen
      </a>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width] duration-200 md:flex",
          zu ? "w-[60px]" : "w-[232px]",
        )}
        aria-label="Hauptnavigation"
      >
        <div
          className={cn(
            "flex h-14 items-center gap-2.5 px-4",
            zu && "justify-center px-0",
          )}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-primary text-[13px] font-bold text-primary-foreground"
            aria-hidden
          >
            F
          </span>
          {!zu ? (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold tracking-[-0.01em] text-heading">
                FRENKEN
              </span>
              <span className="block truncate text-[11px] text-text-subtle">
                Management Board
              </span>
            </span>
          ) : null}
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="space-y-0.5">
            {NAVIGATION.map((n) => {
              const aktiv = istAktiv(n.to);
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    title={zu ? n.label : undefined}
                    aria-current={aktiv ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] text-text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-foreground",
                      aktiv &&
                        "bg-surface text-heading shadow-[0_1px_2px_0_rgb(0_0_0/0.06)] ring-1 ring-hairline hover:bg-surface",
                      zu && "justify-center px-0",
                    )}
                  >
                    <n.icon
                      className={cn("size-4 shrink-0", aktiv && "text-primary")}
                      strokeWidth={1.75}
                    />
                    {!zu ? <span className="truncate">{n.label}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="space-y-0.5 border-t border-hairline px-2 py-2">
          <Link
            to="/board/design"
            title={zu ? "Designsystem" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] text-text-muted hover:bg-surface-muted hover:text-foreground",
              istAktiv("/board/design") && "text-heading",
              zu && "justify-center px-0",
            )}
          >
            <Palette className="size-4 shrink-0" strokeWidth={1.75} />
            {!zu ? "Designsystem" : null}
          </Link>
          <a
            href="/"
            title={zu ? "Zur Verwaltung" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] text-text-muted hover:bg-surface-muted hover:text-foreground",
              zu && "justify-center px-0",
            )}
          >
            <ArrowLeft className="size-4 shrink-0" strokeWidth={1.75} />
            {!zu ? "Zur Verwaltung" : null}
          </a>
          <button
            onClick={toggle}
            className={cn(
              "flex h-8 w-full cursor-pointer items-center gap-2.5 px-2.5 text-[13px] text-text-muted hover:bg-surface-muted hover:text-foreground",
              zu && "justify-center px-0",
            )}
            aria-label={
              zu ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"
            }
          >
            {zu ? (
              <ChevronsRight className="size-4" />
            ) : (
              <>
                <ChevronsLeft className="size-4" />
                Einklappen
                <Taste className="ml-auto">⌘\</Taste>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-background/85 px-4 backdrop-blur-md md:px-6">
          <MobilNavigation istAktiv={istAktiv} />
          <GesellschaftsAuswahl companies={data?.companies ?? []} />
          <button
            onClick={() => setPaletteOffen(true)}
            className="ml-auto flex h-8 w-full max-w-[320px] cursor-pointer items-center gap-2 border border-hairline bg-surface px-2.5 text-sm text-text-subtle transition-colors hover:bg-surface-muted md:ml-4 md:mr-auto"
          >
            <Search className="size-3.5" />
            <span className="truncate">Suchen oder springen…</span>
            <Taste className="ml-auto">⌘K</Taste>
          </button>
          {boardRepository().quelle === "mock" ? (
            <span
              className="hidden h-6 items-center rounded-full border border-warn/30 bg-warn-soft px-2.5 text-xs font-medium text-warn lg:inline-flex"
              title="Alle Zahlen sind fiktiv"
            >
              Demodaten
            </span>
          ) : null}
          <Knopf
            variante="geist"
            groesse="icon"
            onClick={() => setThema(dunkel ? "hell" : "dunkel")}
            aria-label={dunkel ? "Hellmodus" : "Dunkelmodus"}
            title={`${dunkel ? "Hellmodus" : "Dunkelmodus"} (⌘J)`}
          >
            {dunkel ? <Sun /> : <Moon />}
          </Knopf>
          <Benutzermenue thema={thema} />
        </header>
        <main
          id="board-inhalt"
          className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-8 md:px-8"
        >
          {children}
        </main>
      </div>
      <Befehlspalette daten={data} />
    </div>
  );
}

function Benutzermenue({ thema }: { thema: string }) {
  const { benutzer, istAngemeldet, abmelden } = useAuth();
  const name = benutzer?.name ?? "Demo-Benutzer";
  const initialen =
    benutzer?.initialen ??
    name
      .split(" ")
      .map((t) => t[0])
      .join("")
      .slice(0, 2);
  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-foreground [--board-r:9999px]"
        aria-label={`Benutzermenü ${name}`}
        data-thema={thema}
      >
        {initialen}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-56 border border-hairline bg-elevated p-1 text-sm shadow-[0_12px_32px_-8px_rgb(0_0_0/0.2)]"
        >
          <div className="px-2 py-1.5">
            <div className="truncate font-medium text-heading">{name}</div>
            <div className="truncate text-xs text-text-subtle">
              {benutzer?.email ?? "Ohne Anmeldung"}
            </div>
          </div>
          <Menu.Separator className="my-1 h-px bg-hairline" />
          <Menu.Item asChild>
            <a
              href="/"
              className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-foreground outline-none data-[highlighted]:bg-surface-muted"
            >
              <ArrowLeft className="size-4 text-text-muted" /> Zur Verwaltung
            </a>
          </Menu.Item>
          {istAngemeldet ? (
            <Menu.Item
              onSelect={() => void abmelden()}
              className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-foreground outline-none data-[highlighted]:bg-surface-muted"
            >
              <LogOut className="size-4 text-text-muted" /> Abmelden
            </Menu.Item>
          ) : null}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Navigation für schmale Bildschirme (Tablet hochkant): Menü statt Seitenleiste. */
function MobilNavigation({ istAktiv }: { istAktiv: (to: string) => boolean }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[7px] bg-primary text-[13px] font-bold text-primary-foreground md:hidden"
        aria-label="Navigation öffnen"
      >
        F
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-60 border border-hairline bg-elevated p-1 text-sm shadow-[0_12px_32px_-8px_rgb(0_0_0/0.2)]"
        >
          {NAVIGATION.map((n) => (
            <Menu.Item key={n.to} asChild>
              <Link
                to={n.to}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-foreground outline-none data-[highlighted]:bg-surface-muted",
                  istAktiv(n.to) && "font-medium text-primary",
                )}
              >
                <n.icon className="size-4" strokeWidth={1.75} />
                {n.label}
              </Link>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
