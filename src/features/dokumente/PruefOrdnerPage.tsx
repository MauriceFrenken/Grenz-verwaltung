import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntwicklungOverlay } from "@/components/shared/EntwicklungOverlay";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { ReviewQueue } from "@/components/shared/ReviewQueue";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Check, Edit3, X } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { dokumenteApi } from "@/api/dokumente";
import { useMandant } from "@/hooks/useMandant";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import type { PruefAufgabe, PruefEntscheidung } from "@/types";

import { PruefZuordnenDialog } from "./components/PruefZuordnenDialog";

export function PruefOrdnerPage() {
  const { aktiveMandantId } = useMandant();
  const { data, isLoading, isEmpty, reload } = useApi(
    () => dokumenteApi.listPruefAufgaben({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );

  const [zuordnenAufgabe, setZuordnenAufgabe] = useState<PruefAufgabe | null>(null);

  const entscheide = async (id: string, entscheidung: PruefEntscheidung) => {
    try {
      await dokumenteApi.entscheidePruefAufgabe(id, entscheidung);
      toast.success("Entscheidung übernommen");
      reload();
    } catch {
      toast.error("Fehler bei der Übernahme");
    }
  };

  const items = (data?.items ?? []).map((a: PruefAufgabe) => ({
    id: a.id,
    titel: a.dateiname,
    untertitel: `${a.absender} — ${a.betreff}`,
    konfidenz: a.konfidenz,
    metadaten: [
      { label: "Vorschlag Mandant", wert: a.vorschlag.mandantId ?? "–" },
      { label: "Vorschlag Objekt", wert: a.vorschlag.objektId ?? "–" },
      { label: "Vorschlag Kategorie", wert: a.vorschlag.kategorieName ?? "–" },
      { label: "Anhang", wert: a.anhangName ?? "–" },
      { label: "Eingegangen", wert: formatDate(a.eingegangenAm) },
    ],
    hinweis:
      !a.vorschlag.mandantId || !a.vorschlag.objektId || !a.vorschlag.kategorieId
        ? "KI-Zuordnung unvollständig — bitte manuell prüfen."
        : undefined,
    _raw: a,
  }));

  return (
    <EntwicklungOverlay>
    <>
      <PageHeader titel="Prüf-Ordner" />
      <PageWrapper>
        <ReviewQueue
          items={items}
          isLoading={isLoading}
          isEmpty={isEmpty}
          actions={(item) => (
            <>
              <PermissionGate berechtigung="aktion.dokumente.pruefordner.bestaetigen">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-foreground text-foreground"
                  onClick={() => entscheide(item.id, "bestaetigt")}
                >
                  <Check className="mr-1 h-4 w-4" strokeWidth={1.5} />
                  Bestätigen
                </Button>
              </PermissionGate>
              <PermissionGate berechtigung="aktion.dokumente.pruefordner.neu_zuordnen">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-foreground text-foreground"
                  onClick={() => setZuordnenAufgabe(item._raw as PruefAufgabe)}
                >
                  <Edit3 className="mr-1 h-4 w-4" strokeWidth={1.5} />
                  Neu zuordnen
                </Button>
              </PermissionGate>
              <PermissionGate berechtigung="aktion.dokumente.pruefordner.ablehnen">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-danger text-danger"
                  onClick={() => entscheide(item.id, "abgelehnt")}
                >
                  <X className="mr-1 h-4 w-4" strokeWidth={1.5} />
                  Ablehnen
                </Button>
              </PermissionGate>
            </>
          )}
        />
      </PageWrapper>

      <PruefZuordnenDialog
        aufgabe={zuordnenAufgabe}
        open={zuordnenAufgabe !== null}
        onOpenChange={(open) => {
          if (!open) setZuordnenAufgabe(null);
        }}
        onSaved={reload}
      />
    </>
    </EntwicklungOverlay>
  );
}
