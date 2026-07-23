import { createFileRoute } from "@tanstack/react-router";
import { SalesforceMatchPage } from "@/features/transaktionen/SalesforceMatchPage";
import { seitenGuard } from "@/lib/permissions";

type SalesforceExportSearch = {
  draft?: string;
};

export const Route = createFileRoute("/transaktionen/expose-import/salesforce")({
  beforeLoad: seitenGuard("seite.transaktionen.expose_import"),
  validateSearch: (search: Record<string, unknown>): SalesforceExportSearch => ({
    draft: typeof search.draft === "string" ? search.draft : undefined,
  }),
  head: () => ({ meta: [{ title: "Salesforce-Export — FRENKEN Verwaltung" }] }),
  component: SalesforceMatchPage,
});
