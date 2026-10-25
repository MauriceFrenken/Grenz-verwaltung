import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";

import { MaklerTab } from "./MaklerTab";

/** Zahlen des Maklergeschäfts: Pipeline, Funnel, Abschlüsse, Vertriebsaktivität. */
export function GeschaeftszahlenSeite() {
  return (
    <>
      <PageHeader
        titel="Geschäftszahlen"
        beschreibung="Pipeline, Vermarktung, Abschlüsse und Vertriebsaktivität aus Salesforce"
      />
      <PageWrapper>
        <MaklerTab />
      </PageWrapper>
    </>
  );
}
