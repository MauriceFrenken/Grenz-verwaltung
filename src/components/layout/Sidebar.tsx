import { Link, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronsLeft, ChevronsRight, LayoutDashboard } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { prefetchGraphRoute } from "@/lib/graph-cache";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

import { NAVIGATION, type NavSection } from "./navigation";

const GRAPH_PREFETCH_PFADE = new Set([
  "/dokumente/ablage",
  "/dokumente/pruefordner",
  "/dokumente/rechnungsfreigabe",
  "/exposes",
]);

const sections: NavSection[] = [
  {
    label: "Start",
    items: [{ to: "/", label: "Übersicht", icon: LayoutDashboard }],
  },
  ...NAVIGATION,
];

/** Aktiver Eintrag: exakter Pfad oder Unterseite — ohne Geschwister zu treffen. */
function istAktiv(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  if (pathname === to || pathname === `${to}/`) return true;
  if (!pathname.startsWith(`${to}/`)) return false;
  // „/exposes“ darf nicht bei „/exposes/import“ leuchten.
  return !NAVIGATION.some((s) =>
    s.items.some(
      (i) =>
        i.to !== to && i.to.startsWith(`${to}/`) && pathname.startsWith(i.to),
    ),
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const { session, benutzer } = useAuth();
  const token = session?.access_token ?? "";
  const userId = benutzer?.id ?? "";

  function prefetchWennGraph(to: string) {
    if (!GRAPH_PREFETCH_PFADE.has(to) || !token || !userId) return;
    prefetchGraphRoute(queryClient, token, userId, to);
  }

  return (
    <aside
      className={cn(
        "hairline-r sticky top-16 flex h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <nav className="flex-1 overflow-y-auto px-2">
        {sections.map((section) => (
          <div key={section.label} className="py-2.5">
            {!collapsed ? (
              <div className="px-2.5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                {section.label}
              </div>
            ) : (
              <div className="mx-3 my-2 h-px bg-sidebar-border" />
            )}
            <ul className="space-y-px">
              {section.items.map((item) => {
                const aktiv = istAktiv(pathname, item.to);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onMouseEnter={() => prefetchWennGraph(item.to)}
                      onFocus={() => prefetchWennGraph(item.to)}
                      className={cn(
                        "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        aktiv &&
                          "bg-sidebar-accent font-medium text-sidebar-foreground [&>svg]:text-sidebar-foreground",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      {aktiv ? (
                        <span
                          className="absolute -left-2 inset-y-1.5 w-[3px] rounded-r-full bg-sidebar-foreground"
                          aria-hidden
                        />
                      ) : null}
                      <item.icon
                        className="h-4 w-4 shrink-0"
                        strokeWidth={1.5}
                      />
                      {!collapsed ? (
                        <span className="truncate">{item.label}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <button
        type="button"
        onClick={toggle}
        className="flex h-10 items-center justify-center border-t border-sidebar-border text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
      >
        {collapsed ? (
          <ChevronsRight className="h-4 w-4" />
        ) : (
          <ChevronsLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
