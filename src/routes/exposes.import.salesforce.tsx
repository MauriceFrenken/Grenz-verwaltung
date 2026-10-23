import { createFileRoute } from "@tanstack/react-router";
import { SalesforceMatchPage } from "@/features/exposes/SalesforceMatchPage";

type SalesforceExportSearch = {
  draft?: string;
};

export const Route = createFileRoute("/exposes/import/salesforce")({
  validateSearch: (search: Record<string, unknown>): SalesforceExportSearch => ({
    draft: typeof search.draft === "string" ? search.draft : undefined,
  }),
  head: () => ({ meta: [{ title: "Salesforce-Export — Grenz & Co." }] }),
  component: SalesforceMatchPage,
});
