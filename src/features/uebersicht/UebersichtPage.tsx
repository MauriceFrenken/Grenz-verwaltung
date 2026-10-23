import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { NAVIGATION } from "@/components/layout/navigation";
import { PageWrapper, ContentSection } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/hooks/useAuth";

/** Startseite: alle Bereiche der App als Kacheln. */
export function UebersichtPage() {
  const { benutzer } = useAuth();
  const vorname = benutzer?.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader titel={vorname ? `Willkommen, ${vorname}` : "Übersicht"} />
      <PageWrapper>
        {NAVIGATION.map((bereich) => (
          <ContentSection key={bereich.label} titel={bereich.label}>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {bereich.items.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="group flex h-full items-center gap-4 rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-brand hover:bg-surface-muted"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-text">
                      <item.icon className="size-4" strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
                      {item.label}
                    </span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-text-subtle transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </ContentSection>
        ))}
      </PageWrapper>
    </>
  );
}
