import {
  Briefcase,
  CalendarCheck,
  ChartColumn,
  Cloud,
  Inbox,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Plug,
  Radar,
  ScrollText,
  UserCog,
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
 * Hauptmenü, dann die Käuferseite (Vermarktung) und die Verkäuferseite (Akquise), dann die
 * KI-Dokumentenerstellung und Tools (Register der KI-Tools in src/lib/ki-tools/tools.ts), Personal und System.
 */
export const NAVIGATION: NavSection[] = [
  {
    label: "Hauptmenü",
    items: [
      { to: "/", label: "Übersicht", icon: LayoutDashboard },
      { to: "/kennzahlen", label: "Kennzahlen", icon: ChartColumn },
      {
        to: "/gesellschafterbericht",
        label: "Gesellschafterbericht",
        icon: Landmark,
        umbruch: true,
      },
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
        to: "/verkaeufer",
        label: "Verkäufer",
        icon: Radar,
        badge: "verkaeufer",
        badgeTon: "violet",
      },
      { to: "/akquise/salesforce", label: "Salesforce", icon: Cloud },
      { to: "/akquise/massnahmen", label: "Maßnahmen", icon: ListChecks },
    ],
  },
  {
    label: "KI-Dokumentenerstellung",
    items: KI_TOOLS.filter((t) => t.bereich === "dokumente").map((t) => ({
      to: t.pfad,
      label: t.label,
      icon: t.icon,
      umbruch: true,
    })),
  },
  {
    label: "Tools",
    items: [
      {
        to: "/exposes",
        label: "Exposéanalyse",
        icon: Inbox,
        badge: "angebotseingang",
        badgeTon: "amber",
      },
      { to: "/exposes/karte", label: "Marktkarte", icon: MapPin },
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
        label: "Team & Urlaub",
        icon: CalendarCheck,
        badge: "urlaubsantraege",
        badgeTon: "amber",
      },
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
      { to: "/einstellungen/audit", label: "Audit-Trail", icon: ScrollText },
    ],
  },
];
