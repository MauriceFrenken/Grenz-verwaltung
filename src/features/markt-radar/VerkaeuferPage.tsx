import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";

import { RadarListe } from "./RadarListe";

/** Verkäuferseite: wer im Markt verkaufen will oder muss, als Ansatz für neue Mandate. */
export function VerkaeuferPage() {
  return (
    <>
      <PageHeader
        titel="Verkäufer"
        beschreibung="Mögliche Verkäufer aus den Immobiliennews, als Ansatz für neue Mandate"
      />
      <PageWrapper>
        <RadarListe seite="verkaeufer" />
      </PageWrapper>
    </>
  );
}
