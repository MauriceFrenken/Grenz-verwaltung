/**
 * Register der KI-Tools unter „Tools“. Seitenleiste und Übersicht lesen diese Liste;
 * ein neues Tool braucht hier einen Eintrag und eine Route unter /tools/….
 */

import {
  Calculator,
  Coins,
  FileSpreadsheet,
  FileText,
  LineChart,
  Presentation,
  type LucideIcon,
} from "lucide-react";

export type KiToolId =
  | "expose"
  | "marktpreis"
  | "mieterliste"
  | "dcf"
  | "kaufpreis"
  | "marktbericht";

export interface KiToolDefinition {
  id: KiToolId;
  /** Pfad der Seite (Seitenleiste, Übersicht). */
  pfad: string;
  label: string;
  kurz: string;
  beschreibung: string;
  icon: LucideIcon;
  /** Ausgabeformat im Grenz-&-Co.-Design. */
  format: "PPTX" | "XLSX" | "PDF";
  /** Was als Grundlage am meisten hilft (Hinweis im Eingabefeld). */
  unterlagen: string;
  /** Platzhalter des Eingabefelds. */
  platzhalter: string;
  /** Abschnitt der Seitenleiste: KI-Dokumentenerstellung oder Tools (Berichte). */
  bereich: "dokumente" | "berichte";
}

export const KI_TOOLS: KiToolDefinition[] = [
  {
    id: "marktpreis",
    pfad: "/tools/marktpreis",
    label: "Marktpreisanalyse",
    kurz: "Marktpreisanalyse",
    beschreibung:
      "Erstellt die Vermarktungseinschätzung als PowerPoint: Key Facts, Vergleichstransaktionen aus Grenz-Daten und Websuche, Preisfindung mit Faktor und Preis pro m².",
    icon: LineChart,
    format: "PPTX",
    unterlagen: "Mieterliste, Flächen, Fotos, Preisvorstellung des Eigentümers",
    platzhalter:
      "z. B. Vermarktungseinschätzung für Herrn Rentmeister, Preisvorstellung 2,3 Mio. €",
    bereich: "dokumente",
  },
  {
    id: "expose",
    pfad: "/tools/expose",
    label: "Exposé-Erstellung",
    kurz: "Exposé",
    beschreibung:
      "Erstellt das Verkaufsexposé als PowerPoint in der Grenz-&-Co.-Vorlage: Investment, Objektdaten, Mieterübersicht, Lage, Fotos und Rechtstexte.",
    icon: Presentation,
    format: "PPTX",
    unterlagen:
      "Mieterliste, Flächenaufstellung, Energieausweis, Grundbuch, alte Exposés, Fotos und Grundrisse",
    platzhalter:
      "z. B. Exposé für das Wohn- und Geschäftshaus, Kaufpreis 2,56 Mio. €, Käuferprovision 5,95 %",
    bereich: "dokumente",
  },
  {
    id: "mieterliste",
    pfad: "/tools/mieterliste",
    label: "Mieterlistenerstellung",
    kurz: "Mieterliste",
    beschreibung:
      "Überführt Mietverträge, Mieterlisten oder Sollstellungen in die Grenz-Mietaufstellung (Excel) mit IST/SOLL, Auswertung und Rendite.",
    icon: FileSpreadsheet,
    format: "XLSX",
    unterlagen:
      "Mieterliste des Eigentümers, Mietverträge, Sollstellung, Hausverwaltungs-Export",
    platzhalter:
      "z. B. Mieterliste für Alter Grenzweg 39-41, Kaufpreis 1,975 Mio. €",
    bereich: "dokumente",
  },
  {
    id: "dcf",
    pfad: "/tools/dcf",
    label: "DCF-Kalkulation",
    kurz: "DCF-Kalkulation",
    beschreibung:
      "Rechnet einen Discounted Cashflow über 10 Jahre (Excel mit Formeln): Mieten, Bewirtschaftung, Exit, Barwert und IRR.",
    icon: Calculator,
    format: "XLSX",
    unterlagen: "Mieterliste, Kaufpreis, Bewirtschaftungskosten, Marktmiete",
    platzhalter:
      "z. B. DCF bei 4,0 Mio. € Kaufpreis, Diskontierungszins 5 %, Exit zum Einstiegsfaktor",
    bereich: "dokumente",
  },
  {
    id: "kaufpreis",
    pfad: "/tools/kaufpreis",
    label: "Kaufpreistool",
    kurz: "Kaufpreistool",
    beschreibung:
      "Füllt das Grenz-Kaufpreistool (Excel): Flächen, Mieten IST/SOLL, Marktmiete und Kaufpreisstaffel mit Faktor und Preis pro m².",
    icon: Coins,
    format: "XLSX",
    unterlagen: "Mieterliste, Flächenaufstellung, Mietspiegel oder Marktmieten",
    platzhalter:
      "z. B. Kaufpreisstaffel ab 4 Mio. € in 200.000-€-Schritten, Marktmiete Wohnen 25 €/m²",
    bereich: "dokumente",
  },
  {
    id: "marktbericht",
    pfad: "/tools/marktbericht",
    label: "Marktberichte",
    kurz: "Marktberichte",
    beschreibung:
      "Erstellt den Marktbericht Zinshäuser Rheinland zum Halbjahr und Jahresende: Angebotsfaktoren aus dem Exposé-Eingang, Käuferindex, Zinsen der Bundesbank und zitierte Werte großer Häuser.",
    icon: FileText,
    format: "PDF",
    unterlagen:
      "Marktberichte von BNP Paribas RE, JLL, CBRE, Cushman & Wakefield, Savills, Colliers als PDF",
    platzhalter: "z. B. Marktbericht 1. Halbjahr 2027",
    bereich: "berichte",
  },
];

export function kiTool(id: string): KiToolDefinition | undefined {
  return KI_TOOLS.find((t) => t.id === id);
}
