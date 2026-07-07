import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/useApi";
import { verwaltungApi } from "@/api/verwaltung";

export function ObjektDetailPage({ id }: { id: string }) {
  const { data, isLoading } = useApi(() => verwaltungApi.getObjekt(id), [id]);

  return (
    <>
      <PageHeader
        titel={data?.bezeichnung ?? `Objekt ${id}`}
        meta={
          data
            ? `${data.adresse.strasse}, ${data.adresse.plz} ${data.adresse.ort}`
            : isLoading
              ? "Lädt…"
              : undefined
        }
        aktionen={
          <Button asChild variant="outline" size="sm" className="border-foreground text-foreground">
            <Link to="/verwaltung/objekte">Zurück zur Übersicht</Link>
          </Button>
        }
      />
      <PageWrapper>
        <Tabs defaultValue="stammdaten">
          <TabsList className="border border-hairline bg-surface p-0">
            <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>
            <TabsTrigger value="einheiten">Einheiten</TabsTrigger>
            <TabsTrigger value="kostenpositionen">Kostenpositionen</TabsTrigger>
            <TabsTrigger value="dokumente">Dokumente</TabsTrigger>
          </TabsList>
          <TabsContent value="stammdaten" className="mt-4 border border-hairline bg-surface">
            <EmptyState />
          </TabsContent>
          <TabsContent value="einheiten" className="mt-4 border border-hairline bg-surface">
            <EmptyState />
          </TabsContent>
          <TabsContent value="kostenpositionen" className="mt-4 border border-hairline bg-surface">
            <EmptyState />
          </TabsContent>
          <TabsContent value="dokumente" className="mt-4 border border-hairline bg-surface">
            <EmptyState />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}