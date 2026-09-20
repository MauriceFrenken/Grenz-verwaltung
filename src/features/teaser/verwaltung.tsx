import { Upload } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeaserShell } from "./TeaserShell";

function LeereTabelle({ titel }: { titel?: string }) {
  return (
    <div className="border border-hairline bg-surface">
      <EmptyState titel={titel ?? "Noch keine Einträge"} />
    </div>
  );
}

export function SollstellungTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Sollstellung"
        aktionen={
          <Button
            variant="outline"
            size="sm"
            className="border-foreground text-foreground"
          >
            Sollstellungslauf erzeugen
          </Button>
        }
      />
      <PageWrapper>
        <LeereTabelle />
      </PageWrapper>
    </TeaserShell>
  );
}

export function ZahlungenTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Zahlungen & Rückstände"
        aktionen={
          <Button
            variant="outline"
            size="sm"
            className="border-foreground text-foreground"
          >
            <Upload className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Bankauszug (PDF)
          </Button>
        }
      />
      <PageWrapper>
        <Tabs defaultValue="zahlungen">
          <TabsList className="border border-hairline bg-surface p-0">
            <TabsTrigger value="zahlungen">Zahlungen</TabsTrigger>
            <TabsTrigger value="rueckstaende">Rückstände</TabsTrigger>
          </TabsList>
          <TabsContent value="zahlungen" className="mt-4">
            <LeereTabelle titel="Noch keine Zahlungen" />
          </TabsContent>
          <TabsContent value="rueckstaende" className="mt-4">
            <LeereTabelle titel="Keine Rückstände" />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </TeaserShell>
  );
}

export function NebenkostenTeaser() {
  return (
    <TeaserShell>
      <PageHeader titel="Nebenkostenabrechnung" />
      <PageWrapper>
        <LeereTabelle titel="Noch nicht implementiert" />
      </PageWrapper>
    </TeaserShell>
  );
}
