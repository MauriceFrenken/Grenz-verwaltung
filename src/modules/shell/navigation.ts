import {
  Building2,
  Inbox,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavEintrag {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Managementfrage, die die Seite beantwortet (Strategie-Brief) */
  frage: string;
  kuerzel: string;
}

export const NAVIGATION: NavEintrag[] = [
  {
    to: "/board",
    label: "Cockpit",
    icon: LayoutDashboard,
    frage: "Was ist heute wichtig?",
    kuerzel: "C",
  },
  {
    to: "/board/liquiditaet",
    label: "Liquidität",
    icon: Wallet,
    frage: "Wie viel Geld ist wo frei?",
    kuerzel: "L",
  },
  {
    to: "/board/darlehen",
    label: "Darlehen",
    icon: Landmark,
    frage: "Was wird fällig, was ist offen?",
    kuerzel: "D",
  },
  {
    to: "/board/immobilien",
    label: "Immobilien",
    icon: Building2,
    frage: "Welches Objekt bleibt hinter Plan?",
    kuerzel: "I",
  },
  {
    to: "/board/pipeline",
    label: "Ankaufspipeline",
    icon: KanbanSquare,
    frage: "Was kaufen wir als Nächstes?",
    kuerzel: "A",
  },
  {
    to: "/board/ablage",
    label: "Ablage v2",
    icon: Inbox,
    frage: "Welche Dokumente muss ich prüfen?",
    kuerzel: "B",
  },
  {
    to: "/board/pruefliste",
    label: "Prüfliste",
    icon: ListChecks,
    frage: "Was muss ich bestätigen?",
    kuerzel: "P",
  },
];
