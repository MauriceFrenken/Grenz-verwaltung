import {
  Briefcase,
  ChartColumn,
  Inbox,
  LayoutDashboard,
  MapPin,
  Settings,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const COCKPIT: NavItem = {
  to: "/",
  label: "Cockpit",
  icon: LayoutDashboard,
};

/**
 * Bereiche der Seitenleiste entlang des Maklerkreislaufs:
 * eigenes Geschäft (Vermarktung), fremdes Angebot (Markt), Zahlen und Geld (Unternehmen).
 */
export const NAVIGATION: NavSection[] = [
  {
    label: "Vermarktung",
    items: [{ to: "/mandate", label: "Mandate", icon: Briefcase }],
  },
  {
    label: "Markt",
    items: [
      { to: "/exposes", label: "Angebotseingang", icon: Inbox },
      { to: "/exposes/karte", label: "Marktkarte", icon: MapPin },
      { to: "/exposes/auswertung", label: "Marktanalyse", icon: ChartColumn },
    ],
  },
  {
    label: "Unternehmen",
    items: [
      { to: "/geschaeftszahlen", label: "Geschäftszahlen", icon: TrendingUp },
      { to: "/finanzen", label: "Finanzen", icon: Wallet },
    ],
  },
];

/** Steht am Fuß der Seitenleiste, getrennt vom Tagesgeschäft. */
export const EINSTELLUNGEN: NavItem = {
  to: "/einstellungen",
  label: "Einstellungen",
  icon: Settings,
};
