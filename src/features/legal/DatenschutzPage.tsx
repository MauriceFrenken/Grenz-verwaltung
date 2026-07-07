import { DatenschutzInhalt } from "@/features/legal/DatenschutzInhalt";
import { LegalPageLayout } from "@/features/legal/LegalPageLayout";

export function DatenschutzPage() {
  return (
    <LegalPageLayout
      titel="Datenschutzerklärung"
      untertitel="Informationen zur Verarbeitung personenbezogener Daten in dieser internen Webanwendung."
    >
      <DatenschutzInhalt />
    </LegalPageLayout>
  );
}
