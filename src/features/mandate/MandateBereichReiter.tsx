import { ReiterLeiste } from "@/components/layout/ReiterLeiste";

/** Mandate und Deal-Pipeline sind ein Bereich unter Akquise, mit je einem Reiter. */
export function MandateBereichReiter({
  aktiv,
}: {
  aktiv: "liste" | "pipeline";
}) {
  return (
    <ReiterLeiste
      label="Mandate & Pipeline"
      aktiv={aktiv}
      reiter={[
        { id: "liste", label: "Mandate", href: "/mandate" },
        { id: "pipeline", label: "Deal-Pipeline", href: "/mandate/pipeline" },
      ]}
    />
  );
}
