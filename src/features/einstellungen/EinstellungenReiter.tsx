import { ReiterLeiste } from "@/components/layout/ReiterLeiste";

export type EinstellungenReiterId =
  | "integrationen"
  | "benutzer"
  | "vorlagen"
  | "audit";

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
        {
          id: "vorlagen",
          label: "Design-Vorlagen",
          href: "/einstellungen/vorlagen",
        },
        { id: "audit", label: "Audit-Trail", href: "/einstellungen/audit" },
      ]}
    />
  );
}
