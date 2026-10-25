import { PageWrapper } from "@/components/layout/PageWrapper";
import { ReiterLeiste } from "@/components/layout/ReiterLeiste";
import { PageHeader } from "@/components/shared/PageHeader";

import { AktivitaetenTab } from "./AktivitaetenTab";
import { AnschreibenTab } from "./AnschreibenTab";
import { Ladehinweis, StandLeiste } from "./bausteine";
import { UebersichtTab } from "./UebersichtTab";
import { useAkquiseDaten } from "./useAkquiseDaten";
import { WiedervorlagenTab } from "./WiedervorlagenTab";

export const SALESFORCE_REITER = [
  { id: "uebersicht", label: "Dashboard" },
  { id: "anschreiben", label: "Anschreiben" },
  { id: "aktivitaeten", label: "Aktivitäten" },
  { id: "wiedervorlagen", label: "Wiedervorlagen" },
] as const;

export type SalesforceReiter = (typeof SALESFORCE_REITER)[number]["id"];

/** Akquise › Salesforce: alle Akquise-Aktivitäten (Briefe, Anrufe, Termine) als Dashboards. */
export function SalesforceSeite({ reiter }: { reiter: SalesforceReiter }) {
  const { daten, laedt, fehler, neuLaden } = useAkquiseDaten();
  return (
    <>
      <PageHeader
        titel="Akquise in Salesforce"
        beschreibung="Anschreiben, Anrufe, Termine und Wiedervorlagen der Verkäufer-Akquise"
        reiter={
          <ReiterLeiste
            label="Akquise in Salesforce"
            aktiv={reiter}
            reiter={SALESFORCE_REITER.map((r) => ({
              id: r.id,
              label: r.label,
              href:
                r.id === "uebersicht"
                  ? "/akquise/salesforce"
                  : `/akquise/salesforce/${r.id}`,
            }))}
          />
        }
      />
      <PageWrapper>
        <div className="flex flex-col gap-6">
          <StandLeiste
            daten={daten}
            laedt={laedt}
            fehler={fehler}
            onNeuLaden={() => void neuLaden()}
          />
          {!daten ? (
            <Ladehinweis laedt={laedt} fehler={fehler} />
          ) : reiter === "anschreiben" ? (
            <AnschreibenTab daten={daten} />
          ) : reiter === "aktivitaeten" ? (
            <AktivitaetenTab daten={daten} />
          ) : reiter === "wiedervorlagen" ? (
            <WiedervorlagenTab daten={daten} />
          ) : (
            <UebersichtTab daten={daten} />
          )}
        </div>
      </PageWrapper>
    </>
  );
}
