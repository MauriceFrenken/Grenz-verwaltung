import { ImpressumInhalt } from "@/features/legal/ImpressumInhalt";
import { LegalPageLayout } from "@/features/legal/LegalPageLayout";

export function ImpressumPage() {
  return (
    <LegalPageLayout
      titel="Impressum"
      untertitel="Angaben gemäß § 5 TMG / § 55 RStV."
    >
      <ImpressumInhalt />
    </LegalPageLayout>
  );
}
