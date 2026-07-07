import { createFileRoute } from "@tanstack/react-router";
import { ExposeImportPage } from "@/features/transaktionen/ExposeImportPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/transaktionen/expose-import")({
  beforeLoad: seitenGuard("seite.transaktionen.expose_import"),
  head: () => ({ meta: [{ title: "Exposé-Import — FRENKEN Verwaltung" }] }),
  component: ExposeImportPage,
});