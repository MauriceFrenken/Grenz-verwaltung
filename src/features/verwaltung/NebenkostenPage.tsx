import { PageHeader } from "@/components/shared/PageHeader";
import { EntwicklungOverlay } from "@/components/shared/EntwicklungOverlay";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";

export function NebenkostenPage() {
  return (
    <EntwicklungOverlay>
    <>
      <PageHeader titel="Nebenkostenabrechnung" />
      <PageWrapper>
        <div className="border border-hairline bg-surface">
          <EmptyState titel="Noch nicht implementiert" />
        </div>
      </PageWrapper>
    </>
    </EntwicklungOverlay>
  );
}
