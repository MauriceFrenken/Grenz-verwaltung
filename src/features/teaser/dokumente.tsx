import { Link2, Tags } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TeaserShell } from "./TeaserShell";

export function AblageTeaser() {
  return (
    <TeaserShell>
      <PageHeader
        titel="Dokumentenablage"
        aktionen={
          <div className="flex flex-wrap gap-2">
            <PermissionGate berechtigung="aktion.dokumente.outlook.verbinden">
              <Button type="button" variant="outline" size="sm" className="border-foreground text-foreground">
                <Link2 className="h-4 w-4" strokeWidth={1.5} />
                <span className="sr-only">Outlook verbinden</span>
              </Button>
            </PermissionGate>
            <PermissionGate berechtigung="aktion.dokumente.kategorien.verwalten">
              <Button type="button" variant="outline" size="sm" className="border-foreground text-foreground">
                <Tags className="h-4 w-4" strokeWidth={1.5} />
                <span className="sr-only">Kategorien</span>
              </Button>
            </PermissionGate>
          </div>
        }
      />
      <PageWrapper>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-heading">Posteingang (mit Anhang)</h2>
          <div className="border border-hairline bg-surface">
            <EmptyState titel="Outlook nicht verbunden" />
          </div>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-heading">Abgelegte Dokumente</h2>
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Dateiname suchen" className="w-72" readOnly />
          </div>
          <div className="border border-hairline bg-surface">
            <EmptyState titel="Noch keine Dokumente abgelegt" />
          </div>
        </section>
      </PageWrapper>
    </TeaserShell>
  );
}

export function PruefOrdnerTeaser() {
  return (
    <TeaserShell>
      <PageHeader titel="Prüf-Ordner" />
      <PageWrapper>
        <div className="border border-hairline bg-surface">
          <EmptyState titel="Keine Dokumente zur Prüfung" />
        </div>
      </PageWrapper>
    </TeaserShell>
  );
}
