import {
  Briefcase,
  CalendarCheck,
  ChartColumn,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Radar,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { KI_TOOLS } from "@/lib/ki-tools/tools";
import type { NavZaehler } from "@/lib/navigation/server-fn";

export type BadgeTon = "emerald" | "amber" | "violet";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Zähler aus navZaehlerFn, der als Badge erscheint. */
  badge?: keyof NavZaehler;
  badgeTon?: BadgeTon;
  /** Lange Bezeichnung zweizeilig statt abgeschnitten. */
  umbruch?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Seitenleiste nach dem Vorbild von admin.buyanymachine.com:
 * Hauptmenü, dann die Käuferseite (Vermarktung) und die Verkäuferseite (Akquise), dann Tools
 * (KI-Dokumente als Kachelseite, Register in src/lib/ki-tools/tools.ts), Personal und System.
 * Ein Eintrag je Bereich; Unterseiten sind Reiter auf der Seite selbst.
 */
export const NAVIGATION: NavSection[] = [
  {
    label: "Hauptmenü",
    items: [
      { to: "/", label: "Übersicht", icon: LayoutDashboard },
      { to: "/kennzahlen", label: "Kennzahlen", icon: ChartColumn },
      {
        to: "/aufgaben",
        label: "Aufgaben",
        icon: KanbanSquare,
        badge: "aufgaben",
        badgeTon: "amber",
      },
    ],
  },
  {
    label: "Vermarktung",
    items: [
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
        to: "/akquise",
        label: "Verkäufer-Akquise",
        icon: Radar,
        badge: "verkaeufer",
        badgeTon: "violet",
      },
      {
        to: "/mandate",
        label: "Mandate & Pipeline",
        icon: Briefcase,
        badge: "mandate",
        badgeTon: "emerald",
      },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/tools", label: "KI-Dokumente", icon: Sparkles },
      {
        to: "/exposes",
        label: "Exposéanalyse",
        icon: Inbox,
        badge: "angebotseingang",
        badgeTon: "amber",
      },
      ...KI_TOOLS.filter((t) => t.bereich === "berichte").map((t) => ({
        to: t.pfad,
        label: t.label,
        icon: t.icon,
        umbruch: true,
      })),
    ],
  },
  {
    label: "Personal",
    items: [
      {
        to: "/personal",
        label: "Personal",
        icon: CalendarCheck,
        badge: "urlaubsantraege",
        badgeTon: "amber",
      },
    ],
  },
  {
    label: "System",
    items: [{ to: "/einstellungen", label: "Einstellungen", icon: Settings }],
  },
];
