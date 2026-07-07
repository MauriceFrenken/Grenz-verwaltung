import { createFileRoute } from "@tanstack/react-router";
import { DatenschutzPage } from "@/features/legal/DatenschutzPage";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutzerklärung — FRENKEN Verwaltung" },
      {
        name: "description",
        content: "Datenschutzerklärung zur internen Webanwendung FRENKEN Verwaltung.",
      },
    ],
  }),
  component: DatenschutzPage,
});
