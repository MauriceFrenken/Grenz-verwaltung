import { createFileRoute } from "@tanstack/react-router";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { ExposeAuswertung } from "@/features/exposes/ExposeAuswertung";
import { ExposeReiter } from "@/features/exposes/ExposeReiter";

export const Route = createFileRoute("/exposes/auswertung")({
  head: () => ({ meta: [{ title: "Exposé-Auswertung — Grenz & Co." }] }),
  component: function ExposeAuswertungRoute() {
    return (
      <>
        <PageHeader
          titel="Exposéanalyse"
          beschreibung="Was der Markt anbietet: Faktoren, Mieten, Objektarten, Städte und Makler aus den eingegangenen Exposés"
          reiter={<ExposeReiter aktiv="auswertung" />}
        />
        <PageWrapper>
          <ExposeAuswertung />
        </PageWrapper>
      </>
    );
  },
});
