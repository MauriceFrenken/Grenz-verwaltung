import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { EntwicklungOverlay } from "@/components/shared/EntwicklungOverlay";
import { EinstellungenReiter } from "./EinstellungenReiter";

export function AuditPage() {
  return (
    <EntwicklungOverlay>
      <PageHeader
        titel="Einstellungen"
        reiter={<EinstellungenReiter aktiv="audit" />}
      />
      <PageWrapper>
        <div className="border border-hairline bg-surface">
          <EmptyState titel="Keine Audit-Einträge" />
        </div>
      </PageWrapper>
    </EntwicklungOverlay>
  );
}
