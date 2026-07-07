import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BerechtigungId } from "@/lib/permissions";

interface SeitenEintrag {
  id: BerechtigungId;
  label: string;
  aktionen: Array<{ id: BerechtigungId; label: string }>;
}

interface BerechtigungsGruppeProps {
  titel: string;
  seiten: SeitenEintrag[];
  werte: Record<BerechtigungId, boolean>;
  readonly: boolean;
  onToggle: (id: BerechtigungId, aktiv: boolean) => void;
  istDeaktiviert?: (id: BerechtigungId) => boolean;
}

function BerechtigungsZeile({
  id,
  label,
  checked,
  disabled,
  readonly,
  onToggle,
  className,
  hinweis,
}: {
  id: BerechtigungId;
  label: string;
  checked: boolean;
  disabled?: boolean;
  readonly: boolean;
  onToggle: (id: BerechtigungId, aktiv: boolean) => void;
  className?: string;
  hinweis?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-2.5", className)}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={readonly || disabled}
        onCheckedChange={(value) => onToggle(id, value === true)}
      />
      <div className="min-w-0">
        <Label
          htmlFor={id}
          className={cn(
            "font-normal leading-snug",
            readonly || disabled ? "text-text-muted" : "cursor-pointer text-foreground",
          )}
        >
          {label}
        </Label>
        {hinweis ? <p className="text-xs text-text-subtle">{hinweis}</p> : null}
      </div>
    </div>
  );
}

function SeitenKopf({
  seite,
  seiteAktiv,
  readonly,
  onToggle,
  expandTrigger,
  seiteNichtVergebbar,
}: {
  seite: SeitenEintrag;
  seiteAktiv: boolean;
  readonly: boolean;
  onToggle: (id: BerechtigungId, aktiv: boolean) => void;
  expandTrigger?: ReactNode;
  seiteNichtVergebbar?: boolean;
}) {
  return (
    <div className="flex items-start gap-1 px-4 py-0.5">
      <div className="mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {expandTrigger}
      </div>
      <div className="min-w-0 flex-1">
        <BerechtigungsZeile
          id={seite.id}
          label={seite.label}
          checked={seiteAktiv}
          disabled={seiteNichtVergebbar}
          readonly={readonly}
          onToggle={onToggle}
          hinweis={seiteNichtVergebbar ? "Kein eigener Zugriff" : undefined}
        />
      </div>
    </div>
  );
}

function AktionenListe({
  seite,
  seiteAktiv,
  werte,
  readonly,
  onToggle,
  istDeaktiviert,
}: {
  seite: SeitenEintrag;
  seiteAktiv: boolean;
  werte: Record<BerechtigungId, boolean>;
  readonly: boolean;
  onToggle: (id: BerechtigungId, aktiv: boolean) => void;
  istDeaktiviert?: (id: BerechtigungId) => boolean;
}) {
  return (
    <ul className="hairline-t border-t border-hairline bg-surface-muted/40 px-4 pb-2 pl-12">
      {seite.aktionen.map((aktion) => {
        const nichtVergebbar = istDeaktiviert?.(aktion.id) ?? false;
        return (
          <li key={aktion.id}>
            <BerechtigungsZeile
              id={aktion.id}
              label={aktion.label}
              checked={werte[aktion.id] ?? false}
              disabled={!seiteAktiv || nichtVergebbar}
              readonly={readonly}
              onToggle={onToggle}
              hinweis={nichtVergebbar ? "Kein eigener Zugriff" : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function BerechtigungsGruppe({
  titel,
  seiten,
  werte,
  readonly,
  onToggle,
  istDeaktiviert,
}: BerechtigungsGruppeProps) {
  if (seiten.length === 0) return null;

  return (
    <div className="border border-hairline bg-surface">
      <div className="label-caps hairline-b border-b border-hairline px-4 py-2 text-text-muted">{titel}</div>
      <ul className="divide-y divide-hairline">
        {seiten.map((seite) => {
          const seiteAktiv = werte[seite.id] ?? false;
          const hatAktionen = seite.aktionen.length > 0;
          const seiteNichtVergebbar = istDeaktiviert?.(seite.id) ?? false;

          if (!hatAktionen) {
            return (
              <li key={seite.id}>
                <SeitenKopf
                  seite={seite}
                  seiteAktiv={seiteAktiv}
                  readonly={readonly}
                  onToggle={onToggle}
                  seiteNichtVergebbar={seiteNichtVergebbar}
                />
              </li>
            );
          }

          return (
            <li key={seite.id}>
              <Collapsible defaultOpen={false}>
                <SeitenKopf
                  seite={seite}
                  seiteAktiv={seiteAktiv}
                  readonly={readonly}
                  onToggle={onToggle}
                  seiteNichtVergebbar={seiteNichtVergebbar}
                  expandTrigger={
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center text-text-muted hover:text-heading [&[data-state=open]_svg]:rotate-90"
                        aria-label={`Aktionen für ${seite.label} anzeigen`}
                      >
                        <ChevronRight className="h-4 w-4 transition-transform" />
                      </button>
                    </CollapsibleTrigger>
                  }
                />
                <CollapsibleContent>
                  <AktionenListe
                    seite={seite}
                    seiteAktiv={seiteAktiv}
                    werte={werte}
                    readonly={readonly}
                    onToggle={onToggle}
                    istDeaktiviert={istDeaktiviert}
                  />
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
