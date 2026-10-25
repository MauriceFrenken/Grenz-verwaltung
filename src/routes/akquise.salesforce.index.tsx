import { createFileRoute } from "@tanstack/react-router";

import { SalesforceSeite } from "@/features/akquise/SalesforceSeite";

export const Route = createFileRoute("/akquise/salesforce/")({
  head: () => ({ meta: [{ title: "Akquise in Salesforce — Grenz & Co." }] }),
  component: function AkquiseSalesforceRoute() {
    return <SalesforceSeite reiter="uebersicht" />;
  },
});
