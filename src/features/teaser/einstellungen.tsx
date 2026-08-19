import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { TeaserShell } from "./TeaserShell";

export function AuditTeaser() {
  return (
    <TeaserShell>
      <PageHeader titel="Audit-Trail" />
      <PageWrapper>
        <div className="border border-hairline bg-surface">
          <EmptyState titel="Keine Audit-Einträge" />
        </div>
      </PageWrapper>
    </TeaserShell>
  );
}
