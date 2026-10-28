import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AbwesenheitenTab } from "./AbwesenheitenTab";
import { Auswahl } from "./bausteine";
import { ChecklistenTab } from "./ChecklistenTab";
import { LeistungTab } from "./LeistungTab";
import { SchulungenTab } from "./SchulungenTab";
import { TeamTab } from "./TeamTab";
import { UebersichtTab } from "./UebersichtTab";
import { usePersonal, type PersonalKontext } from "./usePersonal";

export type PersonalReiter =
  | "uebersicht"
  | "mitarbeiter"
  | "abwesenheiten"
  | "schulungen"
  | "onboarding"
  | "berichte";
export const PERSONAL_REITER: PersonalReiter[] = [
  "uebersicht",
  "mitarbeiter",
  "abwesenheiten",
  "schulungen",
  "onboarding",
  "berichte",
];
/** Frühere Reiternamen, damit alte Links weiter funktionieren. */
export const ALTE_REITER: Record<string, PersonalReiter> = {
  team: "mitarbeiter",
  checklisten: "onboarding",
  leistung: "berichte",
};

/**
 * Personal nach dem Vorbild von Personio: Übersicht mit „Zu erledigen“, Mitarbeiterliste mit
 * Profilen, Abwesenheiten, Schulungen, On-/Offboarding und Berichte.
 */
export function PersonalPage({ reiter }: { reiter: PersonalReiter }) {
  const navigate = useNavigate();
  const aktuell = new Date().getFullYear();
  const [jahr, setJahr] = useState(aktuell);
  const p = usePersonal(jahr);

  return (
    <>
      <PageHeader
        titel="Personal"
        beschreibung="Mitarbeiter, Abwesenheiten, Schulungen, On- und Offboarding"
        aktionen={
          <div className="w-28">
            <Auswahl
              wert={String(jahr)}
              optionen={[aktuell + 1, aktuell, aktuell - 1, aktuell - 2].map(
                (j) => ({ wert: String(j), label: String(j) }),
              )}
              onChange={(w) => setJahr(Number(w) || aktuell)}
            />
          </div>
        }
      />
      <PageWrapper>
        {p.fehler ? (
          <div className="border border-hairline bg-surface p-6 text-sm">
            <p className="font-medium text-heading">
              Personaldaten konnten nicht geladen werden.
            </p>
            <p className="mt-1 text-text-muted">{p.fehler}</p>
          </div>
        ) : !p.daten ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Tabs
            value={reiter}
            onValueChange={(v) =>
              void navigate({
                to: "/personal",
                search: { tab: v as PersonalReiter },
                replace: true,
              })
            }
          >
            <TabsList className="flex-wrap">
              <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
              <TabsTrigger value="mitarbeiter">Mitarbeiter</TabsTrigger>
              <TabsTrigger value="abwesenheiten">Abwesenheiten</TabsTrigger>
              <TabsTrigger value="schulungen">Schulungen</TabsTrigger>
              <TabsTrigger value="onboarding">On- & Offboarding</TabsTrigger>
              <TabsTrigger value="berichte">Berichte</TabsTrigger>
            </TabsList>
            <div
              className={p.laedt ? "opacity-70 transition-opacity" : undefined}
            >
              <TabsContent value="uebersicht" className="mt-4">
                <UebersichtTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="mitarbeiter" className="mt-4">
                <TeamTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="abwesenheiten" className="mt-4">
                <AbwesenheitenTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="schulungen" className="mt-4">
                <SchulungenTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="onboarding" className="mt-4">
                <ChecklistenTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="berichte" className="mt-4">
                <LeistungTab k={p as PersonalKontext} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </PageWrapper>
    </>
  );
}
