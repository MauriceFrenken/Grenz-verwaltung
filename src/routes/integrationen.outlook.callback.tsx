import { createFileRoute } from "@tanstack/react-router";

import { OutlookCallbackView } from "@/features/dokumente/outlook/OutlookCallbackView";

export const Route = createFileRoute("/integrationen/outlook/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Outlook verbinden – FRENKEN Verwaltung" }] }),
  component: OutlookCallbackView,
});
