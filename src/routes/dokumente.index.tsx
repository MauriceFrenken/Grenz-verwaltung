import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dokumente/")({
  beforeLoad: () => {
    throw redirect({ to: "/dokumente/ablage" });
  },
});