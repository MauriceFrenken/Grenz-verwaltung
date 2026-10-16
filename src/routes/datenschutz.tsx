import { createFileRoute } from "@tanstack/react-router";
import { DatenschutzPage } from "@/features/legal/DatenschutzPage";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutzerklärung — Grenz & Co. Verwaltung" },
      {
        name: "description",
        content: "Datenschutzerklärung zur internen Webanwendung Grenz & Co. Verwaltung.",
      },
    ],
  }),
  component: DatenschutzPage,
});
