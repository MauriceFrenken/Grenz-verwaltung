import {
  ChartColumn,
  ClipboardCheck,
  Columns3,
  FileText,
  FolderOpen,
  Inbox,
  Landmark,
  Plug,
  ScrollText,
  UserCog,
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

/** Bereiche der Seitenleiste — auch Grundlage der Übersichtsseite. */
export const NAVIGATION: NavSection[] = [
  {
    label: "Steuerung",
    items: [{ to: "/kennzahlen", label: "Kennzahlen", icon: ChartColumn }],
  },
  {
    label: "Exposés",
    items: [
      { to: "/exposes", label: "Offene Exposés", icon: Inbox },
      { to: "/exposes/import", label: "Exposé-Import", icon: FileText },
      { to: "/exposes/auswertung", label: "Exposé-Auswertung", icon: ChartColumn },
    ],
  },
  {
    label: "Dokumente",
    items: [
      { to: "/dokumente/pruefordner", label: "Postfach", icon: ClipboardCheck },
      { to: "/dokumente/ablage", label: "Dokumentenablage", icon: FolderOpen },
      {
        to: "/dokumente/rechnungsfreigabe",
        label: "Rechnungsfreigabe",
        icon: Columns3,
      },
    ],
  },
  {
    label: "Bank",
    items: [{ to: "/ebics", label: "EBICS", icon: Landmark }],
  },
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
