import { PageWrapper } from "@/components/layout/PageWrapper";
import { ReiterLeiste } from "@/components/layout/ReiterLeiste";
import { PageHeader } from "@/components/shared/PageHeader";
import { RadarListe } from "@/features/markt-radar/RadarListe";

import { AktivitaetenTab } from "./AktivitaetenTab";
import { AnschreibenTab } from "./AnschreibenTab";
import { Ladehinweis, StandLeiste } from "./bausteine";
import { MassnahmenTab } from "./MassnahmenTab";
import { PotenzialListe } from "./PotenzialListe";
import { UebersichtTab } from "./UebersichtTab";
import { useAkquiseDaten } from "./useAkquiseDaten";

/** Reihenfolge folgt der Akquise: Verkäufer finden, anschreiben, nachhalten. */
export const AKQUISE_REITER = [
  { id: "uebersicht", label: "Dashboard" },
  { id: "potenzial", label: "Potenzial aus Salesforce" },
  { id: "radar", label: "Markt-Radar" },
  { id: "anschreiben", label: "Anschreiben" },
  { id: "aktivitaeten", label: "Aktivitäten" },
  { id: "massnahmen", label: "Maßnahmen" },
] as const;

export type AkquiseReiter = (typeof AKQUISE_REITER)[number]["id"];

export function akquisePfad(reiter: AkquiseReiter): string {
  return reiter === "uebersicht" ? "/akquise" : `/akquise/${reiter}`;
}

/** Akquise: Verkäufer aus Salesforce und dem Markt-Radar, Anschreiben, Anrufe, Termine und Maßnahmen. */
export function AkquiseSeite({ reiter }: { reiter: AkquiseReiter }) {
  return (
    <>
      <PageHeader
        titel="Akquise"
        beschreibung="Mögliche Verkäufer, Anschreiben, Anrufe und Termine der Verkäufer-Akquise"
        reiter={
          <ReiterLeiste
            label="Akquise"
            aktiv={reiter}
            reiter={AKQUISE_REITER.map((r) => ({
              id: r.id,
              label: r.label,
              href: akquisePfad(r.id),
            }))}
          />
        }
      />
      <PageWrapper>
        {reiter === "radar" ? (
          <RadarListe seite="verkaeufer" />
        ) : reiter === "potenzial" ? (
          <PotenzialListe />
        ) : (
          <SalesforceInhalt reiter={reiter} />
        )}
      </PageWrapper>
    </>
  );
}

function SalesforceInhalt({ reiter }: { reiter: AkquiseReiter }) {
  const { daten, laedt, fehler, neuLaden } = useAkquiseDaten();
  return (
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
      ) : reiter === "massnahmen" ? (
        <MassnahmenTab daten={daten} />
      ) : (
        <UebersichtTab daten={daten} />
      )}
    </div>
  );
}
