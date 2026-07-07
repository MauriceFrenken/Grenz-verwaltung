import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { TeaserShell } from "./TeaserShell";

const INTEGRATIONEN = [
  "Microsoft 365 / Outlook",
  "OneDrive",
  "Salesforce",
  "DMS (Zielsystem offen)",
  "DATEV",
  "Bank (EBICS / FinTS / CAMT-Export)",
];

export function IntegrationenTeaser() {
  return (
    <TeaserShell>
      <PageHeader titel="Integrationen" />
      <PageWrapper>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {INTEGRATIONEN.map((name) => (
            <div key={name} className="flex flex-col justify-between gap-4 border border-hairline bg-surface p-5">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-heading">{name}</h3>
                  <StatusBadge status="getrennt" />
                </div>
                <p className="mt-3 text-xs text-text-subtle">Letzte Synchronisierung: –</p>
              </div>
              <div className="flex gap-2">
                <PermissionGate berechtigung="aktion.einstellungen.integrationen.verbinden">
                  <Button size="sm" variant="outline" className="border-foreground text-foreground">
                    Verbinden
                  </Button>
                </PermissionGate>
                <PermissionGate berechtigung="aktion.einstellungen.integrationen.reauth">
                  <Button size="sm" variant="outline" className="border-foreground text-foreground">
                    Re-Auth
                  </Button>
                </PermissionGate>
              </div>
            </div>
          ))}
        </div>
      </PageWrapper>
    </TeaserShell>
  );
}

export function AuditTeaser() {
  return (
    <TeaserShell>
      <PageHeader titel="Audit-Trail" />
      <PageWrapper>
        <div className="border border-hairline bg-surface">
          <EmptyState titel="Keine Audit-Einträge" />
        </div>
      </PageWrapper>
    </TeaserShell>
  );
}
