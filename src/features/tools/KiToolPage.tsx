import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import type { KiToolDefinition } from "@/lib/ki-tools/tools";

export function KiToolPage({ tool }: { tool: KiToolDefinition }) {
  return (
    <>
      <PageHeader titel={tool.label} beschreibung={tool.beschreibung} />
      <PageWrapper>
        <p className="text-sm text-text-muted">Wird gebaut.</p>
      </PageWrapper>
    </>
  );
}
