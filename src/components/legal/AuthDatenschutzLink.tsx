import { Link } from "@tanstack/react-router";

interface AuthDatenschutzLinkProps {
  variant?: "link" | "hinweis";
}

export function AuthDatenschutzLink({ variant = "link" }: AuthDatenschutzLinkProps) {
  if (variant === "hinweis") {
    return (
      <p className="mt-8 text-center text-xs leading-relaxed text-text-muted">
        Informationen zur Datenverarbeitung in dieser internen Anwendung finden Sie in unserer{" "}
        <Link
          to="/datenschutz"
          className="underline underline-offset-2 transition-colors hover:text-heading"
        >
          Datenschutzerklärung
        </Link>
        .
      </p>
    );
  }

  return (
    <p className="mt-6 text-center text-xs text-text-muted">
      <Link
        to="/datenschutz"
        className="underline underline-offset-2 transition-colors hover:text-heading"
      >
        Datenschutzerklärung
      </Link>
    </p>
  );
}
