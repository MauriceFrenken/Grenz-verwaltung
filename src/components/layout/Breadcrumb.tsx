import { Link, useMatches } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  "/": "Übersicht",
  "/kennzahlen": "Kennzahlen",
  "/mandate": "Mandate",
  "/investoren": "Investoren",
  "/verkaeufer": "Verkäufer",
  "/exposes": "Exposéanalyse",
  "/exposes/import": "Exposé-Import",
  "/exposes/import/salesforce": "Salesforce-Export",
  "/exposes/karte": "Marktkarte",
  "/tools": "Tools",
  "/tools/expose": "Exposé-Erstellung",
  "/tools/marktpreis": "Marktpreisanalyse",
  "/tools/mieterliste": "Mieterliste",
  "/tools/dcf": "DCF-Kalkulation",
  "/tools/kaufpreis": "Kaufpreistool",
  "/tools/marktbericht": "Marktbericht",
  "/einstellungen": "System",
  "/einstellungen/benutzer": "Benutzer",
  "/einstellungen/integrationen": "Integrationen",
  "/einstellungen/audit": "Audit-Trail",
};

export function Breadcrumb() {
  const matches = useMatches();
  const segmente = matches
    .map((m) => m.pathname.replace(/\/$/, "") || "/")
    .filter((path, idx, arr) => arr.indexOf(path) === idx);

  return (
    <nav
      aria-label="Brotkrumen"
      className="flex items-center gap-1 text-xs text-text-muted"
    >
      {segmente.map((path, idx) => {
        const label = LABELS[path] ?? "…";
        const istLetztes = idx === segmente.length - 1;
        return (
          <span key={path} className="flex items-center gap-1">
            {idx > 0 ? (
              <ChevronRight className="h-3 w-3 text-text-subtle" />
            ) : null}
            {istLetztes ? (
              <span className="text-heading">{label}</span>
            ) : (
              <Link to={path} className="hover:text-heading">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
