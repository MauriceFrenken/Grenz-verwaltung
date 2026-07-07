import { PageHeader } from "@/components/shared/PageHeader";
import { EntwicklungOverlay } from "@/components/shared/EntwicklungOverlay";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/useApi";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { verwaltungApi } from "@/api/verwaltung";
import { useMandant } from "@/hooks/useMandant";
import { formatEuro, formatMonth } from "@/lib/format";
import { NotImplementedError } from "@/lib/errors";
import { toast } from "sonner";
import type { Sollstellung } from "@/types";

const spalten: Column<Sollstellung>[] = [
  { key: "zeitraum", header: "Zeitraum", render: (s) => formatMonth(s.zeitraum) },
  { key: "mv", header: "Mietverhältnis", render: (s) => s.mietverhaeltnisId },
  { key: "betrag", header: "Soll-Betrag", align: "right", render: (s) => formatEuro(s.sollBetrag) },
  { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
];

export function SollstellungPage() {
  const { aktiveMandantId } = useMandant();
  const { erlaubtOderHinweis } = useAktionGuard();
  const { data, isLoading, isEmpty, reload } = useApi(
    () => verwaltungApi.listSollstellungen({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );

  const laufErzeugen = async () => {
    if (!erlaubtOderHinweis("aktion.buchhaltung.sollstellung.erzeugen")) return;

    try {
      await verwaltungApi.erzeugeSollstellungLauf({
        zeitraum: new Date().toISOString().slice(0, 7),
        mandantId: aktiveMandantId ?? undefined,
      });
      toast.success("Sollstellungslauf erzeugt");
      reload();
    } catch (err) {
      if (err instanceof NotImplementedError) {
        toast.info("Buchhaltung wird später implementiert.");
      } else {
        toast.error("Fehler beim Erzeugen");
      }
    }
  };

  return (
    <EntwicklungOverlay>
    <>
      <PageHeader
        titel="Sollstellung"
        aktionen={
          <PermissionGate berechtigung="aktion.buchhaltung.sollstellung.erzeugen">
            <Button size="sm" onClick={laufErzeugen} className="bg-primary text-primary-foreground hover:bg-heading">
              Sollstellung erzeugen
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <DataTable spalten={spalten} zeilen={data?.items ?? []} isLoading={isLoading} isEmpty={isEmpty} rowKey={(s) => s.id} />
      </PageWrapper>
    </>
    </EntwicklungOverlay>
  );
}
