import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { GrenzCoLogo } from "@/components/marke/GrenzCoLogo";

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
      <header
        data-op-zensur-ziel=""
        className="flex items-center gap-4 border-b border-sidebar-border bg-sidebar px-6 py-4 text-sidebar-foreground"
      >
        <GrenzCoLogo className="h-8" />
        <div className="h-8 w-px bg-sidebar-foreground/20" aria-hidden />
        <p className="text-sm font-medium tracking-tight text-sidebar-foreground/80">
          Verwaltung
        </p>
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

        <div data-op-zensur-daten="" className="mt-10">
          {children}
        </div>
      </main>
    </div>
  );
}
