import { PageHeader } from "@/components/shared/PageHeader";
import { EntwicklungOverlay } from "@/components/shared/EntwicklungOverlay";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useApi } from "@/hooks/useApi";
import { transaktionenApi } from "@/api/transaktionen";
import { formatEuro, formatFlaeche, formatInt, formatNumber } from "@/lib/format";
import type { Transaktion } from "@/types";

const spalten: Column<Transaktion>[] = [
  { key: "adresse", header: "Objektadresse", render: (t) => <span className="font-medium text-heading">{t.objektadresse}</span> },
  { key: "kaufpreis", header: "Kaufpreis", align: "right", render: (t) => formatEuro(t.kaufpreis) },
  { key: "flaeche", header: "Fläche", align: "right", render: (t) => formatFlaeche(t.flaecheM2) },
  { key: "einheiten", header: "Einheiten", align: "right", render: (t) => formatInt(t.einheiten) },
  { key: "baujahr", header: "Baujahr", align: "right", render: (t) => (t.baujahr ? String(t.baujahr) : "–") },
  { key: "faktor", header: "Faktor / Rendite", align: "right", render: (t) => formatNumber(t.faktor) },
  { key: "makler", header: "Makler / Kontakt", render: (t) => t.makler ?? "–" },
  { key: "sf", header: "Salesforce-Status", render: (t) => <StatusBadge status={t.salesforceStatus === "abgeschlossen" ? "aktiv" : "offen"} label={t.salesforceStatus} /> },
];

export function TransaktionslistePage() {
  const { data, isLoading, isEmpty } = useApi(() => transaktionenApi.listTransaktionen(), []);
  return (
    <EntwicklungOverlay>
    <>
      <PageHeader titel="Transaktionsliste" />
      <PageWrapper>
        <DataTable
          spalten={spalten}
          zeilen={data?.items ?? []}
          isLoading={isLoading}
          isEmpty={isEmpty}
          rowKey={(t) => t.id}
        />
      </PageWrapper>
    </>
    </EntwicklungOverlay>
  );
}