import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ContentSection, PageWrapper } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { TeaserShell } from "./TeaserShell";

export function DashboardTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Übersicht"
        aktionen={
          <PermissionGate berechtigung="aktion.dashboard.zeitraum.aendern">
            <Button
              variant="outline"
              size="sm"
              className="border-foreground text-foreground"
            >
              <Calendar className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Zeitraum wählen
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Offene Rückstände" wert="–" />
          <KpiCard label="Fällige Sollstellungen" wert="–" />
          <KpiCard label="Dokumente zur Prüfung" wert="–" />
          <KpiCard label="Offene Exposé-Prüfungen" wert="–" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-[260px] flex-col border border-hairline bg-surface">
            <div className="hairline-b flex items-center justify-between border-b border-hairline px-4 py-3">
              <h3 className="label-caps text-text-muted">Mieteingänge</h3>
              <span className="text-xs text-text-subtle">letzte 12 Monate</span>
            </div>
            <EmptyState titel="Noch keine Auswertung" />
          </div>
          <div className="flex min-h-[260px] flex-col border border-hairline bg-surface">
            <div className="hairline-b flex items-center justify-between border-b border-hairline px-4 py-3">
              <h3 className="label-caps text-text-muted">
                Rückstände je Objekt
              </h3>
              <span className="text-xs text-text-subtle">aktueller Stand</span>
            </div>
            <EmptyState titel="Keine Rückstände erfasst" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ContentSection titel="Zuletzt">
            <div className="border border-hairline bg-surface">
              <EmptyState titel="Noch keine Aktivität" />
            </div>
          </ContentSection>
          <ContentSection titel="Aufgaben & Fristen">
            <div className="border border-hairline bg-surface">
              <EmptyState titel="Keine offenen Aufgaben" />
            </div>
          </ContentSection>
        </div>
      </PageWrapper>
    </TeaserShell>
  );
}
