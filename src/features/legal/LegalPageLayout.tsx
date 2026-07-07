import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/** Monogram: light tile on dark panels so the F stays legible. */
function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" fill="#fff" />
      <rect x="8" y="7" width="5" height="18" fill="#0A0A0A" />
      <rect x="8" y="7" width="16" height="5" fill="#0A0A0A" />
      <rect x="8" y="14" width="12" height="5" fill="#0A0A0A" />
    </svg>
  );
}

interface LegalPageLayoutProps {
  titel: string;
  untertitel: string;
  children: ReactNode;
}

export function LegalPageLayout({
  titel,
  untertitel,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-hairline bg-heading px-6 py-4 text-primary-foreground">
        <BrandMark className="size-8" />
        <div>
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/50">
            FRENKEN
          </p>
          <p className="text-sm font-semibold tracking-tight text-white">
            Verwaltung
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10 sm:px-10 sm:py-14">
        <Link
          to="/anmelden"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-text-muted underline-offset-2 transition-colors hover:text-heading hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Zur Anmeldung
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight text-heading">
          {titel}
        </h1>
        <p className="mt-2 text-sm text-text-muted">{untertitel}</p>

        <div className="mt-10">{children}</div>
      </main>
    </div>
  );
}
