import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { prefetchGraphRoute } from "@/lib/graph-cache";
import type { NavZaehler } from "@/lib/navigation/server-fn";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

import { NAVIGATION, type BadgeTon, type NavItem } from "./navigation";

const GRAPH_PREFETCH_PFADE = new Set(["/exposes"]);

const BADGE_TON: Record<BadgeTon, string> = {
  emerald: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
  amber: "bg-amber-400/15 text-amber-200 border-amber-300/30",
  violet: "bg-violet-400/15 text-violet-200 border-violet-300/30",
};

/** Aktiver Eintrag: exakter Pfad oder Unterseite — ohne Geschwister zu treffen. */
function istAktiv(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  if (pathname === to || pathname === `${to}/`) return true;
  if (!pathname.startsWith(`${to}/`)) return false;
  // „/exposes“ darf nicht bei „/exposes/karte“ leuchten.
  return !NAVIGATION.some((s) =>
    s.items.some(
      (i) =>
        i.to !== to && i.to.startsWith(`${to}/`) && pathname.startsWith(i.to),
    ),
  );
}

function NavLink({
  item,
  aktiv,
  collapsed,
  zahl,
  onPrefetch,
}: {
  item: NavItem;
  aktiv: boolean;
  collapsed: boolean;
  zahl: number;
  onPrefetch: (to: string) => void;
}) {
  return (
    <Link
      to={item.to}
      onMouseEnter={() => onPrefetch(item.to)}
      onFocus={() => onPrefetch(item.to)}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
        item.umbruch && !collapsed && "h-auto min-h-9 py-1.5",
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
      <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      {!collapsed ? (
        <span
          className={cn("flex-1", item.umbruch ? "leading-snug" : "truncate")}
        >
          {item.label}
        </span>
      ) : null}
      {zahl > 0 && item.badgeTon ? (
        collapsed ? (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border",
              BADGE_TON[item.badgeTon],
            )}
            aria-label={`${zahl} offen`}
          />
        ) : (
          <span
            className={cn(
              "inline-flex h-5 min-w-[22px] items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold tabular-nums",
              BADGE_TON[item.badgeTon],
            )}
          >
            {zahl}
          </span>
        )
      ) : null}
    </Link>
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

  const { data: zaehler } = useQuery({
    queryKey: ["nav-zaehler", userId],
    enabled: Boolean(token),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<NavZaehler> => {
      const { navZaehlerFn } = await import("@/lib/navigation/server-fn");
      return navZaehlerFn({ data: { supabaseAccessToken: token } });
    },
  });

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
        {NAVIGATION.map((section) => (
          <div key={section.label} className="py-2.5">
            {!collapsed ? (
              <div className="px-2.5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                {section.label}
              </div>
            ) : (
              <div className="mx-3 my-2 h-px bg-sidebar-border" />
            )}
            <ul className="space-y-px">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    item={item}
                    aktiv={istAktiv(pathname, item.to)}
                    collapsed={collapsed}
                    zahl={item.badge ? (zaehler?.[item.badge] ?? 0) : 0}
                    onPrefetch={prefetchWennGraph}
                  />
                </li>
              ))}
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
