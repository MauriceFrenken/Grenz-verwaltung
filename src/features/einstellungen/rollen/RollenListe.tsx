import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { rollenBezeichnung, rollenBeschreibung } from "@/lib/constants";
import { rolleRang } from "@/lib/permissions";
import type { KonfigurierbareRolle, RollenDefinition } from "@/types";

interface RollenListeProps {
  ausgewaehlteRolle: KonfigurierbareRolle;
  onRolleWaehlen: (rolle: KonfigurierbareRolle) => void;
  bearbeitbareRollen: KonfigurierbareRolle[];
  rollen: RollenDefinition[];
  rangMap: Record<string, number>;
  beschreibungEntwuerfe?: Record<string, string>;
}

export function RollenListe({
  ausgewaehlteRolle,
  onRolleWaehlen,
  bearbeitbareRollen,
  rollen,
  rangMap,
  beschreibungEntwuerfe = {},
}: RollenListeProps) {
  const bearbeitbarSet = new Set(bearbeitbareRollen);
  const sortiert = [...rollen].sort((a, b) => a.rang - b.rang);

  return (
    <div className="flex flex-col gap-2">
      {sortiert.map((rolle) => {
        const istBearbeitbar = bearbeitbarSet.has(rolle.id);
        const istAktiv = ausgewaehlteRolle === rolle.id;

        return (
          <button
            key={rolle.id}
            type="button"
            onClick={() => onRolleWaehlen(rolle.id)}
            className={cn(
              "border border-hairline px-4 py-3 text-left transition-colors",
              istAktiv ? "border-foreground bg-surface-muted" : "bg-surface hover:bg-surface-muted",
              !istBearbeitbar && "opacity-60",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-heading">
                {rollenBezeichnung(rolle.id, rollen)}
                {!rolle.istSystem ? (
                  <span className="ml-2 text-xs font-normal text-text-subtle">(eigene Rolle)</span>
                ) : null}
              </span>
              <span className="label-caps text-text-subtle">
                Rang {rolleRang(rolle.id, rangMap).toFixed(rolle.rang % 1 === 0 ? 0 : 1)}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {(beschreibungEntwuerfe[rolle.id] ?? rollenBeschreibung(rolle.id, rollen)).trim() ||
                "Keine Beschreibung"}
            </p>
            {!istBearbeitbar ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-text-subtle">
                <Lock className="h-3 w-3" strokeWidth={1.5} />
                Nur-Lesen
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
