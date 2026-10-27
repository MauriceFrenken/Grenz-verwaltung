import { ReiterLeiste } from "@/components/layout/ReiterLeiste";

/** Exposéanalyse und Marktkarte arbeiten mit denselben Exposés, daher eine Seite mit Reitern. */
export function ExposeReiter({ aktiv }: { aktiv: "eingang" | "karte" }) {
  return (
    <ReiterLeiste
      label="Exposéanalyse"
      aktiv={aktiv}
      reiter={[
        { id: "eingang", label: "Eingang", href: "/exposes" },
        { id: "karte", label: "Marktkarte", href: "/exposes/karte" },
      ]}
    />
  );
}
