import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";

import { DokumenteKarte } from "./DokumenteKarte";
import { MandatReiter } from "./MandatReiter";
import {
  mandatBeschreibung,
  mandatTitel,
  useMandatDetail,
} from "./useMandatDetail";

/** Reiter „Exposé & Teaser“ der Mandatsakte. */
export function MandatExposesPage({ sfId }: { sfId: string }) {
  const { token, detail } = useMandatDetail(sfId);
  return (
    <>
      <PageHeader
        titel={mandatTitel(detail)}
        beschreibung={mandatBeschreibung(detail)}
        reiter={<MandatReiter sfId={sfId} aktiv="exposes" />}
      />
      <PageWrapper>
        <DokumenteKarte token={token} sfId={sfId} />
      </PageWrapper>
    </>
  );
}
