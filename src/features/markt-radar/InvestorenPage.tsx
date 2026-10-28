import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvestorenListe } from "@/features/investoren/InvestorenListe";
import { ListenInvestoren } from "@/features/investoren/ListenInvestoren";
import { MarktVermarktung } from "@/features/investoren/MarktVermarktung";
import { Pruefliste } from "@/features/investoren/Pruefliste";
import { VermarktungsAbgleich } from "@/features/investoren/VermarktungsAbgleich";

export type InvestorenReiter = "datenbank" | "vermarktungen" | "markt";
export const INVESTOREN_REITER: InvestorenReiter[] = [
  "datenbank",
  "vermarktungen",
  "markt",
];

/** Frühere Reiter, damit Lesezeichen weiter funktionieren. */
export const ALTE_INVESTOREN_REITER: Record<string, InvestorenReiter> = {
  pruefliste: "datenbank",
  listen: "datenbank",
  pruefen: "datenbank",
  profile: "datenbank",
  nachfrage: "markt",
};

/** Zugeklappter Arbeitsbereich unter der Datenbank. */
function Aufklappbar({
  titel,
  children,
}: {
  titel: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-heading">
        {titel}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * Investoren: die Datenbank, laufende Vermarktungen gegen die Datenbank und gegen gerade aktive
 * Käufer aus der Online-Recherche.
 */
export function InvestorenPage({ reiter }: { reiter: InvestorenReiter }) {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        titel="Investoren"
        beschreibung="Alle Investoren und welche davon zu den laufenden Vermarktungen passen"
      />
      <PageWrapper>
        <Tabs
          value={reiter}
          onValueChange={(v) =>
            void navigate({
              to: "/investoren",
              search: { tab: v as InvestorenReiter },
              replace: true,
            })
          }
        >
          <TabsList>
            <TabsTrigger value="datenbank">Datenbank</TabsTrigger>
            <TabsTrigger value="vermarktungen">
              Vermarktungen gegen Datenbank
            </TabsTrigger>
            <TabsTrigger value="markt">
              Vermarktungen gegen aktive Käufer
            </TabsTrigger>
          </TabsList>
          <TabsContent value="datenbank" className="mt-4 flex flex-col gap-6">
            <InvestorenListe />
            <Aufklappbar titel="Korrekturvorschläge zur Datenbank prüfen">
              <Pruefliste />
            </Aufklappbar>
            <Aufklappbar titel="Neue Investoren aus Listen und Recherche anlegen">
              <ListenInvestoren />
            </Aufklappbar>
          </TabsContent>
          <TabsContent value="vermarktungen" className="mt-4">
            <VermarktungsAbgleich />
          </TabsContent>
          <TabsContent value="markt" className="mt-4">
            <MarktVermarktung />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}
