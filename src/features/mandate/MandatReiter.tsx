import { ReiterLeiste } from "@/components/layout/ReiterLeiste";

export type MandatReiterId =
  | "ueberblick"
  | "bewertung"
  | "exposes"
  | "matching"
  | "interessenten"
  | "reports";

/** Reihenfolge folgt dem Ablauf eines Verkaufs. */
export function MandatReiter({
  sfId,
  aktiv,
}: {
  sfId: string;
  aktiv: MandatReiterId;
}) {
  const basis = `/mandate/${encodeURIComponent(sfId)}`;
  return (
    <ReiterLeiste
      label="Mandatsakte"
      aktiv={aktiv}
      reiter={[
        { id: "ueberblick", label: "Überblick", href: basis },
        { id: "bewertung", label: "Bewertung", href: `${basis}/bewertung` },
        { id: "exposes", label: "Exposé & Teaser", href: `${basis}/exposes` },
        { id: "matching", label: "Käufer-Matching", href: `${basis}/matching` },
        {
          id: "interessenten",
          label: "Interessenten",
          href: `${basis}/interessenten`,
        },
        { id: "reports", label: "Eigentümer-Report", href: `${basis}/reports` },
      ]}
    />
  );
}
