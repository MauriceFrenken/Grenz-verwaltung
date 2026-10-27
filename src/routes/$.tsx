import { createFileRoute } from "@tanstack/react-router";

import { alteAdresseUmleiten } from "@/lib/navigation/alte-adressen";

/** Alles ohne eigene Route: frühere Adressen weiterleiten, sonst 404. */
export const Route = createFileRoute("/$")({
  beforeLoad: ({ location }) => alteAdresseUmleiten(location),
});
