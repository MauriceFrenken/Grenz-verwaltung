import { Link, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  Home,
  Users,
  Receipt,
  Wallet,
  Calculator,
  FolderOpen,
  ClipboardCheck,
  Columns3,
  ScrollText,
  Inbox,
  FileText,
  Plug,
  Landmark,
  UserCog,
  ChevronsLeft,
  ChevronsRight,
  Gauge,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { prefetchGraphRoute } from "@/lib/graph-cache";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

const GRAPH_PREFETCH_PFADE = new Set([
  "/dokumente/ablage",
  "/dokumente/pruefordner",
  "/dokumente/rechnungsfreigabe",
  "/transaktionen/liste",
]);

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "Übersicht",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/board", label: "Management Board", icon: Gauge },
    ],
  },
  {
    label: "Verwaltung",
    items: [
      { to: "/verwaltung/gesellschaften", label: "Gesellschaften", icon: Landmark },
      { to: "/verwaltung/objekte", label: "Objekte", icon: Building2 },
      { to: "/verwaltung/einheiten", label: "Einheiten", icon: Home },
      { to: "/verwaltung/mieter", label: "Mieter", icon: Users },
      {
        to: "/verwaltung/mietverhaeltnisse",
        label: "Mietverhältnisse",
        icon: ScrollText,
      },
    ],
  },
  {
    label: "Buchhaltung",
    items: [
      { to: "/verwaltung/sollstellung", label: "Sollstellung", icon: Receipt },
      { to: "/verwaltung/zahlungen", label: "Zahlungen & Rückstände", icon: Wallet },
      {
        to: "/verwaltung/nebenkosten",
        label: "Nebenkostenabrechnung",
        icon: Calculator,
      },
    ],
  },
  {
    label: "Dokumente",
    items: [
      { to: "/dokumente/ablage", label: "Dokumentenablage", icon: FolderOpen },
      { to: "/dokumente/pruefordner", label: "Postfach", icon: ClipboardCheck },
      { to: "/dokumente/rechnungsfreigabe", label: "Rechnungsfreigabe", icon: Columns3 },
    ],
  },
  {
    label: "Transaktionen",
    items: [
      { to: "/transaktionen/liste", label: "Offene Exposés", icon: Inbox },
      {
        to: "/transaktionen/expose-import",
        label: "Exposé-Import",
        icon: FileText,
      },
    ],
  },
  {
    label: "Einstellungen",
    items: [
      { to: "/einstellungen/benutzer", label: "Benutzer", icon: UserCog },
      { to: "/einstellungen/integrationen", label: "Integrationen", icon: Plug },
      { to: "/einstellungen/audit", label: "Audit-Trail", icon: ScrollText },
    ],
  },
];

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
        "hairline-r sticky top-16 flex h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <nav className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label} className="py-3">
            {!collapsed ? (
              <div className="label-caps px-4 pb-2 text-text-subtle">{section.label}</div>
            ) : (
              <div className="mx-3 my-2 h-px bg-hairline" />
            )}
            <ul>
              {section.items.map((item) => {
                const aktiv =
                  item.to === "/"
                    ? pathname === "/"
                    : pathname === item.to || pathname.startsWith(item.to + "/");
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onMouseEnter={() => prefetchWennGraph(item.to)}
                      onFocus={() => prefetchWennGraph(item.to)}
                      className={cn(
                        "relative flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-surface-muted",
                        aktiv && "bg-surface-muted font-semibold text-heading",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      {aktiv ? (
                        <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden />
                      ) : null}
                      <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
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
        className="hairline-t flex h-10 items-center justify-center border-t border-hairline text-text-muted hover:bg-surface-muted"
        aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
