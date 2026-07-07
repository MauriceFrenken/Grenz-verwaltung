import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy-Pfad — leitet auf die in Azure registrierte Callback-URI um. */
export const Route = createFileRoute("/dokumente/outlook/callback")({
  beforeLoad: () => {
    throw redirect({ to: "/integrationen/outlook/callback", search: true });
  },
});
