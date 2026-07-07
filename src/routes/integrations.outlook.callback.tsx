import { createFileRoute } from "@tanstack/react-router";

import { OutlookCallbackView } from "@/features/dokumente/outlook/OutlookCallbackView";

/** SchmiedeOS/ImmoGuard-kompatibler Alias — gleiche Azure Redirect-URI-Variante. */
export const Route = createFileRoute("/integrations/outlook/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Outlook verbinden – FRENKEN Verwaltung" }] }),
  component: OutlookCallbackView,
});
