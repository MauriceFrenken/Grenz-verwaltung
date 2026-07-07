import { Link } from "@tanstack/react-router";
import { Plus, Search, Upload } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeaserShell } from "./TeaserShell";

function LeereTabelle({ titel }: { titel?: string }) {
  return (
    <div className="border border-hairline bg-surface">
      <EmptyState titel={titel ?? "Noch keine Einträge"} />
    </div>
  );
}

export function MandantenTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Mandanten"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.mandanten.anlegen">
            <Button variant="outline" size="sm" className="border-foreground text-foreground">
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neuer Mandant
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <LeereTabelle />
      </PageWrapper>
    </TeaserShell>
  );
}

export function ObjekteTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Objekte"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.objekte.anlegen">
            <Button variant="outline" size="sm" className="border-foreground text-foreground">
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neues Objekt
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
            <Input placeholder="Objekt suchen" className="w-72 pl-9" readOnly />
          </div>
        </div>
        <LeereTabelle />
      </PageWrapper>
    </TeaserShell>
  );
}

export function ObjektDetailTeaser({ id }: { id: string }) {
  return (
    <TeaserShell>
      <PageHeader
        titel={`Objekt ${id}`}
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
          <TabsContent value="stammdaten" className="mt-4">
            <LeereTabelle />
          </TabsContent>
          <TabsContent value="einheiten" className="mt-4">
            <LeereTabelle />
          </TabsContent>
          <TabsContent value="kostenpositionen" className="mt-4">
            <LeereTabelle />
          </TabsContent>
          <TabsContent value="dokumente" className="mt-4">
            <LeereTabelle />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </TeaserShell>
  );
}

export function EinheitenTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Einheiten"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.einheiten.anlegen">
            <Button variant="outline" size="sm" className="border-foreground text-foreground">
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neue Einheit
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <LeereTabelle />
      </PageWrapper>
    </TeaserShell>
  );
}

export function MietverhaeltnisseTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Mietverhältnisse"
        aktionen={
          <PermissionGate berechtigung="aktion.verwaltung.mietverhaeltnisse.anlegen">
            <Button variant="outline" size="sm" className="border-foreground text-foreground">
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neues Mietverhältnis
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <LeereTabelle />
      </PageWrapper>
    </TeaserShell>
  );
}

export function SollstellungTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Sollstellung"
        aktionen={
          <PermissionGate berechtigung="aktion.buchhaltung.sollstellung.erzeugen">
            <Button variant="outline" size="sm" className="border-foreground text-foreground">
              Sollstellungslauf erzeugen
            </Button>
          </PermissionGate>
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
          <PermissionGate berechtigung="aktion.buchhaltung.zahlungen.bankimport">
            <Button variant="outline" size="sm" className="border-foreground text-foreground">
              <Upload className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Bankimport (CAMT.053)
            </Button>
          </PermissionGate>
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
