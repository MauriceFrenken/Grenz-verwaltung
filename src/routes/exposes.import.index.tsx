import { createFileRoute } from "@tanstack/react-router";
import { ExposeImportPage } from "@/features/exposes/ExposeImportPage";

type ExposeImportSearch = {
  /** Eintrag aus dem Ankauf-Postfach (bereits per KI analysiert). */
  postfach?: string;
};

export const Route = createFileRoute("/exposes/import/")({
  validateSearch: (search: Record<string, unknown>): ExposeImportSearch => ({
    postfach: typeof search.postfach === "string" ? search.postfach : undefined,
  }),
  head: () => ({ meta: [{ title: "Exposé-Import — Grenz & Co." }] }),
  component: ExposeImportPage,
});
