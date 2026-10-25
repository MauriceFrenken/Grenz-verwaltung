import { useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EbicsAktionenPanel } from "@/features/ebics/EbicsAktionenPanel";
import { EbicsUmsaetze } from "@/features/ebics/EbicsUmsaetze";

import { FinanzenTab } from "./FinanzenTab";

export type FinanzenReiter = "ueberblick" | "konto";

/** Liquidität, Provisionen, Kosten und die Kontoumsätze der Bank auf einer Seite. */
export function FinanzenSeite({
  start = "ueberblick",
}: {
  start?: FinanzenReiter;
}) {
  const [reiter, setReiter] = useState<FinanzenReiter>(start);
  const [neuLaden, setNeuLaden] = useState(0);

  return (
    <>
      <PageHeader
        titel="Finanzen"
        beschreibung="Grenz & Co. Immobilienberatungs-GmbH"
      />
      <PageWrapper>
        <Tabs
          value={reiter}
          onValueChange={(v) => setReiter(v as FinanzenReiter)}
        >
          <TabsList>
            <TabsTrigger value="ueberblick">
              Liquidität und Ergebnis
            </TabsTrigger>
            <TabsTrigger value="konto">Kontoumsätze</TabsTrigger>
          </TabsList>
          <TabsContent value="ueberblick" className="mt-4">
            <FinanzenTab />
          </TabsContent>
          <TabsContent value="konto" className="mt-4">
            <div className="max-w-5xl space-y-8">
              <EbicsAktionenPanel
                onUmsaetzeAbgerufen={() => setNeuLaden((n) => n + 1)}
              />
              <EbicsUmsaetze neuLaden={neuLaden} />
            </div>
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}
