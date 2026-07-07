import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { AuditTrail } from "@/components/shared/AuditTrail";
import { useApi } from "@/hooks/useApi";
import { dokumenteApi } from "@/api/dokumente";

export function AuditPage() {
  const { data, isLoading, isEmpty } = useApi(() => dokumenteApi.listAuditEintraege(), []);
  return (
    <>
      <PageHeader titel="Audit-Trail" />
      <PageWrapper>
        <AuditTrail eintraege={data?.items ?? []} isLoading={isLoading} isEmpty={isEmpty} />
      </PageWrapper>
    </>
  );
}