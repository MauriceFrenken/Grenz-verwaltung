import { createFileRoute } from "@tanstack/react-router";
import { ExposeImportPage } from "@/features/transaktionen/ExposeImportPage";

export const Route = createFileRoute("/transaktionen/expose-import/")({
  head: () => ({ meta: [{ title: "Exposé-Import — FRENKEN Verwaltung" }] }),
  component: ExposeImportPage,
});
