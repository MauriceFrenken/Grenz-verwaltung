import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { ExposeMarktTab } from "@/features/kennzahlen/ExposeMarktTab";

/** Auswertung des Ankaufsmarkts aus allen eingegangenen Exposés. */
export function ExposeAuswertungPage() {
  return (
    <>
      <PageHeader
        titel="Marktanalyse"
        beschreibung="Angebotener Markt aus allen eingegangenen Exposés"
      />
      <PageWrapper>
        <ExposeMarktTab />
      </PageWrapper>
    </>
  );
}
