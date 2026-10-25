import {
  Briefcase,
  ChartColumn,
  Inbox,
  LayoutDashboard,
  MapPin,
  Palette,
  Plug,
  Radar,
  ScrollText,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavZaehler } from "@/lib/navigation/server-fn";

export type BadgeTon = "emerald" | "amber" | "violet";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Zähler aus navZaehlerFn, der als Badge erscheint. */
  badge?: keyof NavZaehler;
  badgeTon?: BadgeTon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Seitenleiste nach dem Vorbild von admin.buyanymachine.com:
 * Hauptmenü, dann die Käuferseite (Vermarktung) und die Verkäuferseite (Akquise), dann System.
 */
export const NAVIGATION: NavSection[] = [
  {
    label: "Hauptmenü",
    items: [
      { to: "/", label: "Übersicht", icon: LayoutDashboard },
      { to: "/kennzahlen", label: "Kennzahlen", icon: ChartColumn },
    ],
  },
  {
    label: "Vermarktung",
    items: [
      {
        to: "/mandate",
        label: "Mandate",
        icon: Briefcase,
        badge: "mandate",
        badgeTon: "emerald",
      },
      {
        to: "/investoren",
        label: "Investoren",
        icon: Users,
        badge: "investoren",
        badgeTon: "violet",
      },
    ],
  },
  {
    label: "Akquise",
    items: [
      {
        to: "/exposes",
        label: "Exposéanalyse",
        icon: Inbox,
        badge: "angebotseingang",
        badgeTon: "amber",
      },
      {
        to: "/verkaeufer",
        label: "Verkäufer",
        icon: Radar,
        badge: "verkaeufer",
        badgeTon: "violet",
      },
      { to: "/exposes/karte", label: "Marktkarte", icon: MapPin },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/einstellungen/benutzer", label: "Benutzer", icon: UserCog },
      {
        to: "/einstellungen/integrationen",
        label: "Integrationen",
        icon: Plug,
      },
      {
        to: "/einstellungen/vorlagen",
        label: "Design-Vorlagen",
        icon: Palette,
      },
      { to: "/einstellungen/audit", label: "Audit-Trail", icon: ScrollText },
    ],
  },
];
