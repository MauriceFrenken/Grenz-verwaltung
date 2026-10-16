import { createFileRoute } from "@tanstack/react-router";
import { ImpressumPage } from "@/features/legal/ImpressumPage";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum — Grenz & Co. Verwaltung" },
      {
        name: "description",
        content: "Impressum der Grenz & Co. Immobilienberatungs-GmbH.",
      },
    ],
  }),
  component: ImpressumPage,
});
