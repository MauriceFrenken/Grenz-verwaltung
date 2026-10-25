import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { euroKurz } from "@/features/kennzahlen/hilfen";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";
import type { AnkaufsprofilZeile } from "@/lib/markt-radar/server-fn";

import { RadarListe } from "./RadarListe";

export type InvestorenReiter = "markt" | "profile";

function volumen(p: AnkaufsprofilZeile): string {
  if (p.volumenMin && p.volumenMax)
    return `${euroKurz(p.volumenMin)} bis ${euroKurz(p.volumenMax)}`;
  if (p.volumenMax) return `bis ${euroKurz(p.volumenMax)}`;
  if (p.volumenMin) return `ab ${euroKurz(p.volumenMin)}`;
  return "k. A.";
}

function Ankaufsprofile() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [profile, setProfile] = useState<AnkaufsprofilZeile[] | null>(null);
  const [suche, setSuche] = useState("");

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { ankaufsprofileLadenFn } =
          await import("@/lib/markt-radar/server-fn");
        setProfile(
          await ankaufsprofileLadenFn({ data: { supabaseAccessToken: token } }),
        );
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Profile konnten nicht geladen werden.",
        );
      }
    })();
  }, [token]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q || !profile) return profile ?? [];
    return profile.filter((p) =>
      [p.name, p.investor, p.investorTyp, ...p.assetklassen, ...p.regionen]
        .filter(Boolean)
        .some((t) => t!.toLowerCase().includes(q)),
    );
  }, [profile, suche]);

  return (
    <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-heading">
          Aktive Ankaufsprofile aus Salesforce ({profile?.length ?? "…"})
        </h2>
        <Input
          className="max-w-xs"
          placeholder="Investor, Region, Assetklasse"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>
      {!profile ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-subtle">
                <th className="py-2 pr-3 font-medium">Investor</th>
                <th className="py-2 pr-3 font-medium">Typ</th>
                <th className="py-2 pr-3 font-medium">Assetklassen</th>
                <th className="py-2 pr-3 font-medium">Regionen</th>
                <th className="py-2 pr-3 text-right font-medium">Volumen</th>
                <th className="py-2 font-medium">Geändert</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((p) => (
                <tr key={p.sfId} className="border-t border-hairline align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-heading">
                      {p.investor ?? p.name ?? p.sfId}
                    </div>
                    {p.investor && p.name ? (
                      <div className="text-xs text-text-subtle">{p.name}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{p.investorTyp ?? "k. A."}</td>
                  <td className="py-2 pr-3">
                    {p.assetklassen.join(", ") || "k. A."}
                  </td>
                  <td className="py-2 pr-3">
                    {p.regionen.join(", ") || "k. A."}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {volumen(p)}
                  </td>
                  <td className="py-2 text-text-subtle">
                    {formatDate(p.geaendertAm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Käuferseite: wer kauft gerade im Markt, und wer sucht laut Salesforce. */
export function InvestorenPage({ reiter }: { reiter: InvestorenReiter }) {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        titel="Investoren"
        beschreibung="Aktive Käufer am Markt und Ankaufsprofile aus Salesforce"
      />
      <PageWrapper>
        <Tabs
          value={reiter}
          onValueChange={(v) =>
            void navigate({
              to: "/investoren",
              search: { tab: v as InvestorenReiter },
              replace: true,
            })
          }
        >
          <TabsList>
            <TabsTrigger value="markt">Aktiv am Markt</TabsTrigger>
            <TabsTrigger value="profile">Ankaufsprofile</TabsTrigger>
          </TabsList>
          <TabsContent value="markt" className="mt-4">
            <RadarListe seite="kaeufer" />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <Ankaufsprofile />
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}
