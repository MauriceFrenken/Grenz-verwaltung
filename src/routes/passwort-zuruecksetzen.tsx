import { createFileRoute } from "@tanstack/react-router";
import { PasswortZuruecksetzenPage } from "@/features/auth/PasswortZuruecksetzenPage";

export const Route = createFileRoute("/passwort-zuruecksetzen")({
  head: () => ({
    meta: [{ title: "Passwort zurücksetzen — FRENKEN Verwaltung" }],
  }),
  component: PasswortZuruecksetzenPage,
});
