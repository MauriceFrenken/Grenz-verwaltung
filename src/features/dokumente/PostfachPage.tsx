import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { MICROSOFT_POST_MAILBOX } from "@/lib/microsoft/config";

type Zeile = {
  id: string;
};

const SPALTEN: Column<Zeile>[] = [
  {
    key: "absender",
    header: "Absender",
    className: "max-w-[11rem]",
    render: () => null,
  },
  {
    key: "betreff",
    header: "Betreff",
    className: "max-w-0 w-full",
    render: () => null,
  },
  {
    key: "datum",
    header: "Datum",
    align: "right",
    render: () => null,
  },
];

export function PostfachPage() {
  return (
    <>
      <PageHeader
        titel="Postfach"
        nebenTitel={
          <span className="truncate text-xs text-text-muted">
            {MICROSOFT_POST_MAILBOX}
          </span>
        }
      />
      <PageWrapper>
        <DataTable
          spalten={SPALTEN}
          zeilen={[]}
          isEmpty
          emptyTitel="Keine Nachrichten"
          rowKey={(z) => z.id}
        />
      </PageWrapper>
    </>
  );
}
