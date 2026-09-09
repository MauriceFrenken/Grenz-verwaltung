import { Link, useRouterState } from "@tanstack/react-router";
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
  Shield,
  UserCog,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/useAuth";
import type { SeitenBerechtigungId } from "@/lib/permissions";
import { useUiStore } from "@/store/ui";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  berechtigung: SeitenBerechtigungId;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "Übersicht",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, berechtigung: "seite.dashboard" }],
  },
  {
    label: "Verwaltung",
    items: [
      { to: "/verwaltung/gesellschaften", label: "Gesellschaften", icon: Landmark, berechtigung: "seite.verwaltung.gesellschaften" },
      { to: "/verwaltung/objekte", label: "Objekte", icon: Building2, berechtigung: "seite.verwaltung.objekte" },
      { to: "/verwaltung/einheiten", label: "Einheiten", icon: Home, berechtigung: "seite.verwaltung.einheiten" },
      {
        to: "/verwaltung/mietverhaeltnisse",
        label: "Mietverhältnisse",
        icon: Users,
        berechtigung: "seite.verwaltung.mietverhaeltnisse",
      },
    ],
  },
  {
    label: "Buchhaltung",
    items: [
      { to: "/verwaltung/sollstellung", label: "Sollstellung", icon: Receipt, berechtigung: "seite.verwaltung.sollstellung" },
      { to: "/verwaltung/zahlungen", label: "Zahlungen & Rückstände", icon: Wallet, berechtigung: "seite.verwaltung.zahlungen" },
      {
        to: "/verwaltung/nebenkosten",
        label: "Nebenkostenabrechnung",
        icon: Calculator,
        berechtigung: "seite.verwaltung.nebenkosten",
      },
    ],
  },
  {
    label: "Dokumente",
    items: [
      { to: "/dokumente/ablage", label: "Dokumentenablage", icon: FolderOpen, berechtigung: "seite.dokumente.ablage" },
      { to: "/dokumente/pruefordner", label: "Postfach", icon: ClipboardCheck, berechtigung: "seite.dokumente.pruefordner" },
      { to: "/dokumente/rechnungsfreigabe", label: "Rechnungsfreigabe", icon: Columns3, berechtigung: "seite.dokumente.rechnungsfreigabe" },
    ],
  },
  {
    label: "Transaktionen",
    items: [
      { to: "/transaktionen/liste", label: "Offene Exposés", icon: Inbox, berechtigung: "seite.transaktionen.liste" },
      {
        to: "/transaktionen/expose-import",
        label: "Exposé-Import",
        icon: FileText,
        berechtigung: "seite.transaktionen.expose_import",
      },
    ],
  },
  {
    label: "Einstellungen",
    items: [
      { to: "/einstellungen/benutzer", label: "Benutzer", icon: UserCog, berechtigung: "seite.einstellungen.benutzer" },
      { to: "/einstellungen/rollen", label: "Rollen & Rechte", icon: Shield, berechtigung: "seite.einstellungen.rollen" },
      { to: "/einstellungen/integrationen", label: "Integrationen", icon: Plug, berechtigung: "seite.einstellungen.integrationen" },
      { to: "/einstellungen/audit", label: "Audit-Trail", icon: ScrollText, berechtigung: "seite.einstellungen.audit" },
    ],
  },
];

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { darfSeite, permissionsLoading } = usePermissions();

  return (
    <aside
      className={cn(
        "hairline-r sticky top-16 flex h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <nav className="flex-1 overflow-y-auto">
        {sections.map((section) => {
          const sichtbareItems = permissionsLoading
            ? section.items
            : section.items.filter((item) => darfSeite(item.berechtigung));

          if (sichtbareItems.length === 0) return null;

          return (
            <div key={section.label} className="py-3">
              {!collapsed ? (
                <div className="label-caps px-4 pb-2 text-text-subtle">{section.label}</div>
              ) : (
                <div className="mx-3 my-2 h-px bg-hairline" />
              )}
              <ul>
                {sichtbareItems.map((item) => {
                  const aktiv =
                    item.to === "/"
                      ? pathname === "/"
                      : pathname === item.to || pathname.startsWith(item.to + "/");
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
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
          );
        })}
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
