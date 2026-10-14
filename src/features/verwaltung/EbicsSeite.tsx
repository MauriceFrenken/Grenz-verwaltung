import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EbicsAktionenPanel } from "./EbicsAktionenPanel";

export function EbicsSeite() {
  return (
    <>
      <PageHeader titel="EBICS" />
      <PageWrapper>
        <EbicsAktionenPanel />
      </PageWrapper>
    </>
  );
}
