import { createFileRoute, redirect } from "@tanstack/react-router";

/** Design-Vorlagen sind aus der Seitenleiste entfernt; die Grenz-Vorlagen stecken in den KI-Tools. */
export const Route = createFileRoute("/einstellungen/vorlagen")({
  beforeLoad: () => {
    throw redirect({ to: "/tools" });
  },
});
