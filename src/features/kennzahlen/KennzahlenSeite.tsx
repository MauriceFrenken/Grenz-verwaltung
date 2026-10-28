import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EbicsAktionenPanel } from "@/features/ebics/EbicsAktionenPanel";
import { EbicsUmsaetze } from "@/features/ebics/EbicsUmsaetze";

import { FinanzenTab } from "./FinanzenTab";
import { MaklerTab } from "./MaklerTab";
import { MarktumfeldTab } from "./MarktumfeldTab";

export const KENNZAHLEN_REITER = [
  { id: "wachstum", label: "Wachstum" },
  { id: "liquiditaet", label: "Liquidität" },
  { id: "markt", label: "Markt" },
] as const;

export type KennzahlenReiter = (typeof KENNZAHLEN_REITER)[number]["id"];

/** Kennzahlen: Wachstum und Liquidität von Grenz & Co., dazu der Immobilienmarkt fürs Kundengespräch. */
export function KennzahlenSeite({ reiter }: { reiter: KennzahlenReiter }) {
  const navigate = useNavigate();
  const [neuLaden, setNeuLaden] = useState(0);

  return (
    <>
      <PageHeader
        titel="Kennzahlen"
        beschreibung="Grenz & Co. Immobilienberatungs-GmbH"
      />
      <PageWrapper>
        <Tabs
          value={reiter}
          onValueChange={(v) =>
            void navigate({
              to: "/kennzahlen",
              search: { tab: v as KennzahlenReiter },
              replace: true,
            })
          }
        >
          <TabsList>
            {KENNZAHLEN_REITER.map((r) => (
              <TabsTrigger key={r.id} value={r.id}>
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="wachstum" className="mt-4">
            <MaklerTab />
          </TabsContent>
          <TabsContent value="liquiditaet" className="mt-4">
            <div className="flex flex-col gap-8">
              <FinanzenTab />
              <div className="max-w-5xl space-y-8">
                <EbicsAktionenPanel
                  onUmsaetzeAbgerufen={() => setNeuLaden((n) => n + 1)}
                />
                <EbicsUmsaetze neuLaden={neuLaden} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="markt" className="mt-4">
            <MarktumfeldTab />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}
