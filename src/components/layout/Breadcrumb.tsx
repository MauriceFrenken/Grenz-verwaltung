import { Link, useMatches } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  "/": "Start",
  "/verwaltung": "Verwaltung",
  "/verwaltung/mandanten": "Mandanten",
  "/verwaltung/objekte": "Objekte",
  "/verwaltung/einheiten": "Einheiten",
  "/verwaltung/mietverhaeltnisse": "Mietverhältnisse",
  "/verwaltung/sollstellung": "Sollstellung",
  "/verwaltung/zahlungen": "Zahlungen & Rückstände",
  "/verwaltung/nebenkosten": "Nebenkostenabrechnung",

  "/dokumente": "Dokumente",
  "/dokumente/ablage": "Dokumentenablage",
  "/dokumente/pruefordner": "Prüf-Ordner",
  "/transaktionen": "Transaktionen",
  "/transaktionen/liste": "Transaktionsliste",
  "/transaktionen/expose-import": "Exposé-Import",
  "/transaktionen/expose-import/salesforce": "Salesforce-Export",
  "/einstellungen": "Einstellungen",
  "/einstellungen/benutzer": "Benutzer",
  "/einstellungen/integrationen": "Integrationen",
  "/einstellungen/rollen": "Rollen & Rechte",
  "/einstellungen/audit": "Audit-Trail",
};

export function Breadcrumb() {
  const matches = useMatches();
  const segmente = matches
    .map((m) => m.pathname.replace(/\/$/, "") || "/")
    .filter((path, idx, arr) => arr.indexOf(path) === idx);

  return (
    <nav aria-label="Brotkrumen" className="flex items-center gap-1 text-xs text-text-muted">
      {segmente.map((path, idx) => {
        const label = LABELS[path] ?? "…";
        const istLetztes = idx === segmente.length - 1;
        return (
          <span key={path} className="flex items-center gap-1">
            {idx > 0 ? <ChevronRight className="h-3 w-3 text-text-subtle" /> : null}
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