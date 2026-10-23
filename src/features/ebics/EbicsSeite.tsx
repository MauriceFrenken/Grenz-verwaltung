import { useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EbicsAktionenPanel } from "./EbicsAktionenPanel";
import { EbicsUmsaetze } from "./EbicsUmsaetze";

export function EbicsSeite() {
  const [neuLaden, setNeuLaden] = useState(0);

  return (
    <>
      <PageHeader titel="EBICS" />
      <PageWrapper>
        <div className="max-w-5xl space-y-8">
          <EbicsAktionenPanel
            onUmsaetzeAbgerufen={() => setNeuLaden((n) => n + 1)}
          />
          <EbicsUmsaetze neuLaden={neuLaden} />
        </div>
      </PageWrapper>
    </>
  );
}
