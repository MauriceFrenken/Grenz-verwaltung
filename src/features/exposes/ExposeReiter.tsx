import { ReiterLeiste } from "@/components/layout/ReiterLeiste";

/** Eingang, Marktkarte und Auswertung arbeiten mit denselben Exposés, daher eine Seite mit Reitern. */
export function ExposeReiter({
  aktiv,
}: {
  aktiv: "eingang" | "karte" | "auswertung";
}) {
  return (
    <ReiterLeiste
      label="Exposéanalyse"
      aktiv={aktiv}
      reiter={[
        { id: "eingang", label: "Eingang", href: "/exposes" },
        { id: "karte", label: "Marktkarte", href: "/exposes/karte" },
        { id: "auswertung", label: "Auswertung", href: "/exposes/auswertung" },
      ]}
    />
  );
}
