import { useNavigate } from "@tanstack/react-router";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PotenzialListe } from "@/features/akquise/PotenzialListe";

import { RadarListe } from "./RadarListe";

export type VerkaeuferReiter = "markt" | "salesforce";

/** Verkäuferseite: wer im Markt verkaufen will oder muss, und wer laut Salesforce verkaufen könnte. */
export function VerkaeuferPage({ reiter }: { reiter: VerkaeuferReiter }) {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        titel="Verkäufer"
        beschreibung="Mögliche Verkäufer aus den Immobiliennews und aus Salesforce, als Ansatz für neue Mandate"
      />
      <PageWrapper>
        <Tabs
          value={reiter}
          onValueChange={(v) =>
            void navigate({
              to: "/verkaeufer",
              search: { tab: v as VerkaeuferReiter },
              replace: true,
            })
          }
        >
          <TabsList>
            <TabsTrigger value="markt">Markt-Radar</TabsTrigger>
            <TabsTrigger value="salesforce">
              Potenzial aus Salesforce
            </TabsTrigger>
          </TabsList>
          <TabsContent value="markt" className="mt-4">
            <RadarListe seite="verkaeufer" />
          </TabsContent>
          <TabsContent value="salesforce" className="mt-4">
            <PotenzialListe />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}
