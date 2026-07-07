import { PageHeader } from "@/components/shared/PageHeader";
import { EntwicklungOverlay } from "@/components/shared/EntwicklungOverlay";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/useApi";
import { einstellungenApi } from "@/api/einstellungen";
import { formatDate } from "@/lib/format";
import type { Integration } from "@/types";

const KATALOG: Array<{ id: Integration["id"]; name: string }> = [
  { id: "microsoft365", name: "Microsoft 365 / Outlook" },
  { id: "onedrive", name: "OneDrive" },
  { id: "salesforce", name: "Salesforce" },
  { id: "dms", name: "DMS (Zielsystem offen)" },
  { id: "datev", name: "DATEV" },
  { id: "bank", name: "Bank (EBICS / FinTS / CAMT-Export)" },
];

export function IntegrationenPage() {
  const { data, isLoading, isEmpty } = useApi(() => einstellungenApi.listIntegrationen(), []);
  const status = new Map((data ?? []).map((i) => [i.id, i]));

  return (
    <EntwicklungOverlay>
    <>
      <PageHeader titel="Integrationen" />
      <PageWrapper>
        {isLoading ? (
          <div className="border border-hairline bg-surface">
            <EmptyState titel="Lade Integrationen…" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {KATALOG.map((k) => {
              const s = status.get(k.id);
              return (
                <div key={k.id} className="flex flex-col justify-between gap-4 border border-hairline bg-surface p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-heading">{k.name}</h3>
                      <StatusBadge status={s?.status ?? "getrennt"} />
                    </div>
                    <p className="mt-3 text-xs text-text-subtle">
                      Letzte Synchronisierung: {formatDate(s?.letzteSynchronisierung ?? null)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <PermissionGate berechtigung="aktion.einstellungen.integrationen.verbinden">
                      <Button size="sm" variant="outline" className="border-foreground text-foreground">Verbinden</Button>
                    </PermissionGate>
                    <PermissionGate berechtigung="aktion.einstellungen.integrationen.reauth">
                      <Button size="sm" variant="outline" className="border-foreground text-foreground">Re-Auth</Button>
                    </PermissionGate>
                  </div>
                </div>
              );
            })}
            {isEmpty ? null : null}
          </div>
        )}
      </PageWrapper>
    </>
    </EntwicklungOverlay>
  );
}