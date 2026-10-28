import { createFileRoute } from "@tanstack/react-router";

import { AkquiseSeite } from "@/features/akquise/AkquiseSeite";

export const Route = createFileRoute("/akquise/")({
  head: () => ({ meta: [{ title: "Akquise — Grenz & Co." }] }),
  component: function AkquiseRoute() {
    return <AkquiseSeite reiter="uebersicht" />;
  },
});
