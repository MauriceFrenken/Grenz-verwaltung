import { Link, useMatches, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  "/": "Übersicht",
  "/exposes": "Offene Exposés",
  "/exposes/import": "Exposé-Import",
  "/exposes/import/salesforce": "Salesforce-Export",
  "/exposes/auswertung": "Exposé-Auswertung",
  "/dokumente": "Dokumente",
  "/dokumente/ablage": "Dokumentenablage",
  "/dokumente/pruefordner": "Postfach",
  "/dokumente/pruefung": "Dokument prüfen",
  "/dokumente/rechnungsfreigabe": "Rechnungsfreigabe",
  "/ebics": "EBICS",
  "/einstellungen": "Einstellungen",
  "/einstellungen/benutzer": "Benutzer",
  "/einstellungen/integrationen": "Integrationen",
  "/einstellungen/audit": "Audit-Trail",
};

const POSTFACH_PFAD = "/dokumente/pruefordner";
const PRUEFUNG_PFAD = "/dokumente/pruefung";

export function Breadcrumb() {
  const matches = useMatches();
  const pathname = useRouterState({
    select: (s) => s.location.pathname.replace(/\/$/, ""),
  });

  let segmente = matches
    .map((m) => m.pathname.replace(/\/$/, "") || "/")
    .filter((path, idx, arr) => arr.indexOf(path) === idx);

  if (pathname === PRUEFUNG_PFAD && !segmente.includes(POSTFACH_PFAD)) {
    const idx = segmente.indexOf(PRUEFUNG_PFAD);
    if (idx !== -1) {
      segmente = [
        ...segmente.slice(0, idx),
        POSTFACH_PFAD,
        ...segmente.slice(idx),
      ];
    }
  }

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
