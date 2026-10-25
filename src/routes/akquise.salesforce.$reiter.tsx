import { createFileRoute } from "@tanstack/react-router";

import {
  SALESFORCE_REITER,
  SalesforceSeite,
} from "@/features/akquise/SalesforceSeite";

export const Route = createFileRoute("/akquise/salesforce/$reiter")({
  head: () => ({ meta: [{ title: "Akquise in Salesforce — Grenz & Co." }] }),
  component: function AkquiseSalesforceReiterRoute() {
    const { reiter } = Route.useParams();
    const gefunden =
      SALESFORCE_REITER.find((r) => r.id === reiter)?.id ?? "uebersicht";
    return <SalesforceSeite reiter={gefunden} />;
  },
});
