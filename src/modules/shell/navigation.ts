import {
  Building2,
  DatabaseZap,
  FileText,
  Inbox,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavEintrag {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Managementfrage, die die Seite beantwortet (Strategie-Brief) */
  frage: string;
}

export interface NavBereich {
  label: string;
  eintraege: NavEintrag[];
}

/**
 * Steuerungs-Bereiche in Bens Seitenleiste (src/components/layout/Sidebar.tsx).
 * Verwaltung, Buchhaltung, Dokumente und Einstellungen pflegt die Seitenleiste selbst.
 */
export const STEUERUNG: NavBereich[] = [
  {
    label: "Steuerung",
    eintraege: [
      {
        to: "/",
        label: "Cockpit",
        icon: LayoutDashboard,
        frage: "Was ist heute wichtig?",
      },
      {
        to: "/board/liquiditaet",
        label: "Liquidität",
        icon: Wallet,
        frage: "Wie viel Geld ist wo frei?",
      },
      {
        to: "/board/darlehen",
        label: "Darlehen",
        icon: Landmark,
        frage: "Was wird fällig, was ist offen?",
      },
      {
        to: "/board/pruefliste",
        label: "Prüfliste",
        icon: ListChecks,
        frage: "Was muss ich bestätigen?",
      },
      {
        to: "/board/daten",
        label: "Datenqualität",
        icon: DatabaseZap,
        frage: "Stimmen die Zahlen, was fehlt?",
      },
    ],
  },
  {
    label: "Immobilien",
    eintraege: [
      {
        to: "/board/immobilien",
        label: "Portfolio",
        icon: Building2,
        frage: "Welches Objekt bleibt hinter Plan?",
      },
      {
        to: "/board/transaktionen",
        label: "Transaktionen",
        icon: KanbanSquare,
        frage: "Was kaufen und verkaufen wir?",
      },
      {
        to: "/transaktionen/liste",
        label: "Offene Exposés",
        icon: Inbox,
        frage: "Welche Exposés sind noch offen?",
      },
      {
        to: "/transaktionen/expose-import",
        label: "Exposé-Import",
        icon: FileText,
        frage: "Exposé analysieren und nach Salesforce übertragen",
      },
    ],
  },
  {
    label: "Baumaschinen",
    eintraege: [
      {
        to: "/board/baumaschinen",
        label: "Handel & Plattform",
        icon: Truck,
        frage: "Was steht im Lager, wie lange reicht das Geld?",
      },
    ],
  },
];

/** Alle Steuerungsseiten flach, z. B. für die Befehlspalette. */
export const NAVIGATION: NavEintrag[] = STEUERUNG.flatMap((b) => b.eintraege);

/**
 * Labor: Ablage v2 ist nur sichtbar, wenn VITE_BOARD_LABOR=1 gesetzt ist.
 * Die Seite bleibt unter /board/ablage erreichbar.
 */
export function laborAktiv(): boolean {
  return import.meta.env?.VITE_BOARD_LABOR === "1";
}
