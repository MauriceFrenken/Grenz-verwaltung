import { ReiterLeiste } from "@/components/layout/ReiterLeiste";

export type EinstellungenReiterId = "benutzer" | "integrationen" | "audit";

/** Ein Eintrag „Einstellungen“ in der Seitenleiste, die Bereiche als Reiter. */
export function EinstellungenReiter({
  aktiv,
}: {
  aktiv: EinstellungenReiterId;
}) {
  return (
    <ReiterLeiste
      label="Einstellungen"
      aktiv={aktiv}
      reiter={[
        {
          id: "integrationen",
          label: "Integrationen",
          href: "/einstellungen/integrationen",
        },
        { id: "benutzer", label: "Benutzer", href: "/einstellungen/benutzer" },
        { id: "audit", label: "Audit-Trail", href: "/einstellungen/audit" },
      ]}
    />
  );
}
