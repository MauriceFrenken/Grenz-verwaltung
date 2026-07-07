import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/einstellungen/")({
  beforeLoad: () => {
    throw redirect({ to: "/einstellungen/integrationen" });
  },
});