import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { KI_TOOLS } from "@/lib/ki-tools/tools";

export function ToolsUebersichtPage() {
  return (
    <>
      <PageHeader
        titel="KI-Dokumentenerstellung"
        beschreibung="Unterlagen hochladen oder den Objektordner verbinden, die KI erstellt daraus Dokumente im Grenz-&-Co.-Format."
      />
      <PageWrapper>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {KI_TOOLS.map((t) => (
            <Link
              key={t.id}
              to={t.pfad}
              className="group flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-heading/30"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <t.icon className="h-4.5 w-4.5" strokeWidth={1.5} />
                </span>
                <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold tracking-wide text-text-muted">
                  {t.format}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="font-semibold text-heading">{t.label}</h2>
                <p className="text-sm text-text-muted">{t.beschreibung}</p>
              </div>
              <span className="mt-auto flex items-center gap-1 text-sm font-medium text-heading">
                Öffnen
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </PageWrapper>
    </>
  );
}
