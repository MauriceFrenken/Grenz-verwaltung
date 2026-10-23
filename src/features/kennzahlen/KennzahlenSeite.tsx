import { useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ExposeMarktTab } from "./ExposeMarktTab";
import { FinanzenTab } from "./FinanzenTab";
import { MaklerTab } from "./MaklerTab";

const REITER = [
  { id: "finanzen", label: "Finanzen" },
  { id: "makler", label: "Maklergeschäft" },
  { id: "exposes", label: "Exposé-Markt" },
] as const;

type ReiterId = (typeof REITER)[number]["id"];

/** Kennzahlen des Maklerunternehmens: Finanzen, Vertrieb, Ankaufsmarkt. */
export function KennzahlenSeite() {
  const [reiter, setReiter] = useState<ReiterId>("finanzen");

  return (
    <>
      <PageHeader
        titel="Kennzahlen"
        beschreibung="Grenz & Co. Immobilienberatungs-GmbH"
      />
      <PageWrapper>
        <Tabs value={reiter} onValueChange={(v) => setReiter(v as ReiterId)}>
          <TabsList>
            {REITER.map((r) => (
              <TabsTrigger key={r.id} value={r.id}>
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="finanzen" className="mt-4">
            <FinanzenTab />
          </TabsContent>
          <TabsContent value="makler" className="mt-4">
            <MaklerTab />
          </TabsContent>
          <TabsContent value="exposes" className="mt-4">
            <ExposeMarktTab />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}
