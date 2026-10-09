import { Link, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
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
  Plug,
  Landmark,
  UserCog,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { prefetchGraphRoute } from "@/lib/graph-cache";
import { cn } from "@/lib/utils";
import { laborAktiv, STEUERUNG } from "@/modules/shell/navigation";
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

const steuerung: NavSection[] = STEUERUNG.map((b) => ({
  label: b.label,
  items: b.eintraege.map(({ to, label, icon }) => ({ to, label, icon })),
}));

const sections: NavSection[] = [
  ...steuerung,
  {
    label: "Verwaltung",
    items: [
      {
        to: "/verwaltung/gesellschaften",
        label: "Gesellschaften",
        icon: Landmark,
      },
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
      {
        to: "/verwaltung/zahlungen",
        label: "Zahlungen & Rückstände",
        icon: Wallet,
      },
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
      {
        to: "/dokumente/rechnungsfreigabe",
        label: "Rechnungsfreigabe",
        icon: Columns3,
      },
    ],
  },
  ...(laborAktiv()
    ? [
        {
          label: "Labor",
          items: [
            { to: "/board/ablage", label: "Ablage v2", icon: FlaskConical },
          ],
        },
      ]
    : []),
  {
    label: "Einstellungen",
    items: [
      { to: "/einstellungen/benutzer", label: "Benutzer", icon: UserCog },
      {
        to: "/einstellungen/integrationen",
        label: "Integrationen",
        icon: Plug,
      },
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
        "hairline-r sticky flex shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width]",
        // ohne Anmeldung (Demo-Modus) fehlt die Kopfzeile: Marke in der Seitenleiste
        benutzer ? "top-16 h-[calc(100vh-4rem)]" : "top-0 h-screen",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {!benutzer ? (
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-4">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-heading text-[11px] font-bold text-white"
            aria-hidden
          >
            F
          </span>
          {!collapsed ? (
            <span className="text-sm font-semibold tracking-[-0.01em] text-heading">
              FRENKEN
            </span>
          ) : null}
        </div>
      ) : null}
      <nav className="flex-1 overflow-y-auto px-2">
        {sections.map((section) => (
          <div key={section.label} className="py-2.5">
            {!collapsed ? (
              <div className="px-2.5 pb-1.5 text-xs font-medium text-text-subtle">
                {section.label}
              </div>
            ) : (
              <div className="mx-3 my-2 h-px bg-hairline" />
            )}
            <ul className="space-y-px">
              {section.items.map((item) => {
                const aktiv =
                  item.to === "/"
                    ? pathname === "/"
                    : pathname === item.to ||
                      pathname.startsWith(item.to + "/");
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onMouseEnter={() => prefetchWennGraph(item.to)}
                      onFocus={() => prefetchWennGraph(item.to)}
                      className={cn(
                        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-text-muted transition-colors hover:bg-surface-muted hover:text-heading",
                        aktiv && "bg-surface-muted font-medium text-heading",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
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
        className="hairline-t flex h-10 items-center justify-center border-t border-hairline text-text-muted hover:bg-surface-muted"
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
