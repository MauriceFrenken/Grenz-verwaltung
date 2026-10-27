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
import { usePersonal, type PersonalKontext } from "./usePersonal";

export type PersonalReiter =
  "team" | "abwesenheiten" | "schulungen" | "leistung" | "checklisten";
export const PERSONAL_REITER: PersonalReiter[] = [
  "team",
  "abwesenheiten",
  "schulungen",
  "leistung",
  "checklisten",
];

/** Personal: Team und Akten, Abwesenheiten, Pflichtschulungen, Leistung, On-/Offboarding. */
export function PersonalPage({ reiter }: { reiter: PersonalReiter }) {
  const navigate = useNavigate();
  const aktuell = new Date().getFullYear();
  const [jahr, setJahr] = useState(aktuell);
  const p = usePersonal(jahr);

  return (
    <>
      <PageHeader
        titel="Personal"
        beschreibung="Team, Urlaub und Abwesenheiten, Pflichtschulungen und Leistung"
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
            <TabsList>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="abwesenheiten">
                Urlaub & Abwesenheiten
              </TabsTrigger>
              <TabsTrigger value="schulungen">Pflichtschulungen</TabsTrigger>
              <TabsTrigger value="leistung">Leistung</TabsTrigger>
              <TabsTrigger value="checklisten">On- & Offboarding</TabsTrigger>
            </TabsList>
            <div
              className={p.laedt ? "opacity-70 transition-opacity" : undefined}
            >
              <TabsContent value="team" className="mt-4">
                <TeamTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="abwesenheiten" className="mt-4">
                <AbwesenheitenTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="schulungen" className="mt-4">
                <SchulungenTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="leistung" className="mt-4">
                <LeistungTab k={p as PersonalKontext} />
              </TabsContent>
              <TabsContent value="checklisten" className="mt-4">
                <ChecklistenTab k={p as PersonalKontext} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </PageWrapper>
    </>
  );
}
