import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Calendar } from "lucide-react";

import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ContentSection, PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { TeaserShell } from "./TeaserShell";

function istMontagErinnerung(): boolean {
  return new Date().getDay() === 1;
}

export function DashboardTeaser() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [offen, setOffen] = useState<number | null>(null);
  const erinnerung = istMontagErinnerung();

  useEffect(() => {
    if (!token) return;
    let abgebrochen = false;
    void (async () => {
      try {
        const { dokumentRechnungsfreigabeZaehlenFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        const { offen: anzahl } = await dokumentRechnungsfreigabeZaehlenFn({
          data: { supabaseAccessToken: token },
        });
        if (!abgebrochen) setOffen(anzahl);
      } catch {
        if (!abgebrochen) setOffen(null);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [token]);

  return (
    <TeaserShell>
      <PageHeader
        titel="Übersicht"
        aktionen={
          <Button
            variant="outline"
            size="sm"
            className="border-foreground text-foreground"
          >
            <Calendar className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Zeitraum wählen
          </Button>
        }
      />
      <PageWrapper>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div
            className={cn(
              erinnerung && offen !== null && offen > 0 && "ring-1 ring-foreground",
            )}
          >
            <KpiCard
              label="Rechnungsfreigabe"
              wert={offen === null ? "–" : String(offen)}
              hilfetext={erinnerung ? "Wöchentliche Erinnerung" : undefined}
              aktion={
                <Link
                  to="/dokumente/rechnungsfreigabe"
                  className="text-xs text-text-muted underline-offset-2 hover:underline"
                >
                  Board
                </Link>
              }
            />
          </div>
          <KpiCard label="Offene Rückstände" wert="–" />
          <KpiCard label="Fällige Sollstellungen" wert="–" />
          <KpiCard label="Dokumente zur Prüfung" wert="–" />
          <KpiCard label="Offene Exposé-Prüfungen" wert="–" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-[260px] flex-col border border-hairline bg-surface">
            <div className="hairline-b flex items-center justify-between border-b border-hairline px-4 py-3">
              <h3 className="label-caps text-text-muted">Mieteingänge</h3>
              <span className="text-xs text-text-subtle">letzte 12 Monate</span>
            </div>
            <EmptyState titel="Noch keine Auswertung" />
          </div>
          <div className="flex min-h-[260px] flex-col border border-hairline bg-surface">
            <div className="hairline-b flex items-center justify-between border-b border-hairline px-4 py-3">
              <h3 className="label-caps text-text-muted">
                Rückstände je Objekt
              </h3>
              <span className="text-xs text-text-subtle">aktueller Stand</span>
            </div>
            <EmptyState titel="Keine Rückstände erfasst" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ContentSection titel="Zuletzt">
            <div className="border border-hairline bg-surface">
              <EmptyState titel="Noch keine Aktivität" />
            </div>
          </ContentSection>
          <ContentSection titel="Aufgaben & Fristen">
            <div className="border border-hairline bg-surface">
              <EmptyState titel="Keine offenen Aufgaben" />
            </div>
          </ContentSection>
        </div>
      </PageWrapper>
    </TeaserShell>
  );
}
