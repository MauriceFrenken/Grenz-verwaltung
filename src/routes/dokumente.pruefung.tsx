import { createFileRoute } from "@tanstack/react-router";
import { DokumentPruefungPage } from "@/features/dokumente/DokumentPruefungPage";

type DokumentPruefungSearch = {
  postfach?: string;
};

export const Route = createFileRoute("/dokumente/pruefung")({
  validateSearch: (search: Record<string, unknown>): DokumentPruefungSearch => ({
    postfach: typeof search.postfach === "string" ? search.postfach : undefined,
  }),
  head: () => ({ meta: [{ title: "Dokument prüfen — Grenz & Co." }] }),
  component: DokumentPruefungPage,
});
